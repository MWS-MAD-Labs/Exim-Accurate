import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getOperationalPosCredential } from "@/lib/credential-access";
import { getOrganizationIdForUser } from "@/lib/organization";
import {
  DAY_MS,
  addDateOnly,
  dateOnlyOrdinal,
  dateOnlySchema,
  jakartaDateKey,
  jakartaDateStart,
} from "@/lib/pos";
import { isAdmin, saleTotal } from "@/lib/pos-server";
import { prisma } from "@/lib/prisma";

const MAX_RANGE_DAYS = 366;
const MAX_TRANSACTIONS = 500;

const querySchema = z.object({
  start: dateOnlySchema.optional(),
  end: dateOnlySchema.optional(),
  credentialId: z.string().uuid().optional(),
  person: z.union([
    z.literal("guest"),
    z.string().regex(/^staff:.+$/).max(320),
    z.string().regex(/^cashier:.+$/).max(320),
  ]).optional(),
  itemCode: z.string().max(120).optional(),
  paymentMethod: z.string().max(80).optional(),
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
});


function periodKey(date: Date, period: "daily" | "weekly" | "monthly") {
  const dateKey = jakartaDateKey(date);
  if (period === "daily") return dateKey;
  if (period === "monthly") return dateKey.slice(0, 7);

  const ordinal = dateOnlyOrdinal(dateKey);
  const weekday = new Date(ordinal).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return addDateOnly(dateKey, mondayOffset);
}


export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const organizationId = await getOrganizationIdForUser(session.user.id);
    if (!organizationId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 403 });
    }

    const params = new URL(req.url).searchParams;
    const parsed = querySchema.safeParse({
      start: params.get("start") ?? undefined,
      end: params.get("end") ?? undefined,
      credentialId: params.get("credentialId") ?? undefined,
      person: params.get("person") ?? undefined,
      itemCode: params.get("itemCode") ?? undefined,
      paymentMethod: params.get("paymentMethod") ?? undefined,
      period: params.get("period") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid sales log filters" }, { status: 400 });
    }

    const today = jakartaDateKey(new Date());
    const startValue = parsed.data.start ?? today;
    const endValue = parsed.data.end ?? today;
    const rangeDays = Math.floor((dateOnlyOrdinal(endValue) - dateOnlyOrdinal(startValue)) / DAY_MS) + 1;
    if (rangeDays < 1) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }
    if (rangeDays > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Date range cannot exceed ${MAX_RANGE_DAYS} days` }, { status: 400 });
    }

    if (parsed.data.credentialId) {
      const credential = await getOperationalPosCredential(
        session.user.id,
        session.user.role,
        parsed.data.credentialId,
      );
      if (!credential) {
        return NextResponse.json({ error: "Credential not found" }, { status: 404 });
      }
    }

    const personFilter: Prisma.PosSaleWhereInput = {};
    if (parsed.data.person === "guest") {
      personFilter.buyerType = "guest";
    } else if (parsed.data.person?.startsWith("staff:")) {
      personFilter.staffEmail = parsed.data.person.slice(6);
    } else if (parsed.data.person?.startsWith("cashier:")) {
      personFilter.userId = parsed.data.person.slice(8);
    }

    const where: Prisma.PosSaleWhereInput = {
      credential: { organizationId },
      createdAt: {
        gte: jakartaDateStart(startValue),
        lt: jakartaDateStart(addDateOnly(endValue, 1)),
      },
      ...(parsed.data.credentialId ? { credentialId: parsed.data.credentialId } : {}),
      ...(parsed.data.paymentMethod ? { paymentMethod: parsed.data.paymentMethod } : {}),
      ...(parsed.data.itemCode ? { items: { some: { itemCode: parsed.data.itemCode } } } : {}),
      ...personFilter,
    };

    const [sales, facetSales, facetItems] = await Promise.all([
      prisma.posSale.findMany({
        where,
        include: {
          items: { orderBy: { itemName: "asc" } },
          user: { select: { id: true, name: true, email: true } },
          credential: { select: { id: true, appKey: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.posSale.findMany({
        where: { credential: { organizationId } },
        select: {
          paymentMethod: true,
          buyerType: true,
          staffEmail: true,
          staffName: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.posSaleItem.findMany({
        where: { sale: { credential: { organizationId } } },
        select: { itemCode: true, itemName: true },
        distinct: ["itemCode"],
        orderBy: { itemCode: "asc" },
      }),
    ]);

    let totalSales = new Prisma.Decimal(0);
    let totalUnits = 0;
    const periodMap = new Map<string, { period: string; sales: number; units: number; total: Prisma.Decimal }>();
    const paymentMap = new Map<string, { paymentMethod: string; transactions: number; total: Prisma.Decimal }>();

    for (const sale of sales) {
      const total = saleTotal(sale.items);
      const units = sale.items.reduce((sum, item) => sum + item.quantity, 0);
      totalSales = totalSales.add(total);
      totalUnits += units;

      const key = periodKey(sale.createdAt, parsed.data.period);
      const aggregate = periodMap.get(key) ?? {
        period: key,
        sales: 0,
        units: 0,
        total: new Prisma.Decimal(0),
      };
      aggregate.sales += 1;
      aggregate.units += units;
      aggregate.total = aggregate.total.add(total);
      periodMap.set(key, aggregate);

      const payment = paymentMap.get(sale.paymentMethod) ?? {
        paymentMethod: sale.paymentMethod,
        transactions: 0,
        total: new Prisma.Decimal(0),
      };
      payment.transactions += 1;
      payment.total = payment.total.add(total);
      paymentMap.set(sale.paymentMethod, payment);
    }

    const transactions = sales.slice(0, MAX_TRANSACTIONS).map((sale) => {
      const total = saleTotal(sale.items);
      const units = sale.items.reduce((sum, item) => sum + item.quantity, 0);

      return {
        id: sale.id,
        createdAt: sale.createdAt.toISOString(),
        paymentMethod: sale.paymentMethod,
        status: sale.status,
        buyerType: sale.buyerType,
        person: sale.buyerType === "staff"
          ? { name: sale.staffName, email: sale.staffEmail }
          : { name: "Guest", email: null },
        cashier: {
          id: sale.user.id,
          name: sale.user.name,
          email: sale.user.email,
        },
        credential: sale.credential,
        warehouseName: sale.warehouseName,
        units,
        total: total.toFixed(2),
        items: sale.items.map((item) => ({
          itemCode: item.itemCode,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2),
          subtotal: item.unitPrice.mul(item.quantity).toFixed(2),
        })),
      };
    });

    const people = new Map<string, { value: string; label: string }>();
    const payments = new Set<string>();
    let hasGuest = false;
    for (const sale of facetSales) {
      payments.add(sale.paymentMethod);
      if (sale.buyerType === "staff" && sale.staffEmail) {
        people.set(`staff:${sale.staffEmail}`, {
          value: `staff:${sale.staffEmail}`,
          label: sale.staffName ? `${sale.staffName} (${sale.staffEmail})` : sale.staffEmail,
        });
      } else if (sale.buyerType === "guest") {
        hasGuest = true;
      }
      people.set(`cashier:${sale.user.id}`, {
        value: `cashier:${sale.user.id}`,
        label: `Cashier: ${sale.user.name || sale.user.email}`,
      });
    }
    if (hasGuest) people.set("guest", { value: "guest", label: "Guest" });

    return NextResponse.json({
      period: { start: startValue, end: endValue, grouping: parsed.data.period },
      summary: {
        totalSales: totalSales.toFixed(2),
        transactions: sales.length,
        units: totalUnits,
        averageSale: sales.length ? totalSales.div(sales.length).toFixed(2) : "0.00",
      },
      groupedTotals: Array.from(periodMap.values())
        .sort((a, b) => b.period.localeCompare(a.period))
        .map((row) => ({ ...row, total: row.total.toFixed(2) })),
      paymentBreakdown: Array.from(paymentMap.values()).map((row) => ({
        paymentMethod: row.paymentMethod,
        transactions: row.transactions,
        total: row.total.toFixed(2),
      })),
      transactions,
      truncated: sales.length > MAX_TRANSACTIONS,
      facets: {
        people: Array.from(people.values()).sort((a, b) => a.label.localeCompare(b.label)),
        items: facetItems.map((item) => ({
          value: item.itemCode,
          label: `${item.itemName} (${item.itemCode})`,
        })),
        paymentMethods: Array.from(payments).sort(),
      },
    });
  } catch (error) {
    console.error("[pos/sales/log] Failed to load sales log", error);
    return NextResponse.json({ error: "Unable to load sales log" }, { status: 500 });
  }
}
