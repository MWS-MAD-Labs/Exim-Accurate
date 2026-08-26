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
import { isAdmin } from "@/lib/pos-server";
import { prisma } from "@/lib/prisma";

const MAX_RANGE_DAYS = 366;

const querySchema = z.object({
  start: dateOnlySchema.optional(),
  end: dateOnlySchema.optional(),
  credentialId: z.string().uuid().optional(),
});

interface ItemAggregate {
  itemCode: string;
  itemName: string;
  units: number;
  orders: Set<string>;
  revenue: Prisma.Decimal;
  cost: Prisma.Decimal;
}


function percentageChange(current: Prisma.Decimal, previous: Prisma.Decimal) {
  if (previous.isZero()) return current.isZero() ? 0 : null;
  return Number(current.sub(previous).div(previous).mul(100).toFixed(1));
}

function numberChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function aggregateSales(
  sales: Array<{
    id: string;
    createdAt: Date;
    paymentMethod: string;
    buyerType: string;
    items: Array<{
      itemCode: string;
      itemName: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      unitCost: Prisma.Decimal;
    }>;
  }>,
) {
  const itemMap = new Map<string, ItemAggregate>();
  let revenue = new Prisma.Decimal(0);
  let cost = new Prisma.Decimal(0);
  let units = 0;

  for (const sale of sales) {
    for (const item of sale.items) {
      const lineRevenue = item.unitPrice.mul(item.quantity);
      const lineCost = item.unitCost.mul(item.quantity);
      const current = itemMap.get(item.itemCode) ?? {
        itemCode: item.itemCode,
        itemName: item.itemName,
        units: 0,
        orders: new Set<string>(),
        revenue: new Prisma.Decimal(0),
        cost: new Prisma.Decimal(0),
      };

      revenue = revenue.add(lineRevenue);
      cost = cost.add(lineCost);
      units += item.quantity;
      current.units += item.quantity;
      current.orders.add(sale.id);
      current.revenue = current.revenue.add(lineRevenue);
      current.cost = current.cost.add(lineCost);
      itemMap.set(item.itemCode, current);
    }
  }

  return { revenue, cost, units, itemMap };
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
    const parsedQuery = querySchema.safeParse({
      start: params.get("start") ?? undefined,
      end: params.get("end") ?? undefined,
      credentialId: params.get("credentialId") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid analytics filters" }, { status: 400 });
    }

    const defaultEndValue = jakartaDateKey(new Date());
    const endValue = parsedQuery.data.end ?? defaultEndValue;
    const startValue = parsedQuery.data.start ?? addDateOnly(endValue, -29);
    const rangeDays = Math.floor((dateOnlyOrdinal(endValue) - dateOnlyOrdinal(startValue)) / DAY_MS) + 1;
    if (rangeDays < 1) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }
    if (rangeDays > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { error: `Date range cannot exceed ${MAX_RANGE_DAYS} days` },
        { status: 400 },
      );
    }

    const credentialId = parsedQuery.data.credentialId;
    if (credentialId) {
      const credential = await getOperationalPosCredential(
        session.user.id,
        session.user.role,
        credentialId,
      );
      if (!credential) {
        return NextResponse.json({ error: "Credential not found" }, { status: 404 });
      }
    }

    const credentialFilter = credentialId ? { credentialId } : {};
    const start = jakartaDateStart(startValue);
    const endExclusive = jakartaDateStart(addDateOnly(endValue, 1));
    const previousEndValue = addDateOnly(startValue, -1);
    const previousStartValue = addDateOnly(startValue, -rangeDays);
    const previousStart = jakartaDateStart(previousStartValue);
    const previousEndExclusive = start;

    const [periodSales, previousSales, products] = await Promise.all([
      prisma.posSale.findMany({
        where: {
          credential: { organizationId },
          ...credentialFilter,
          createdAt: { gte: start, lt: endExclusive },
        },
        include: { items: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.posSale.findMany({
        where: {
          credential: { organizationId },
          ...credentialFilter,
          createdAt: { gte: previousStart, lt: previousEndExclusive },
          status: "synced",
        },
        include: { items: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.posProduct.findMany({
        where: {
          credential: { organizationId },
          ...credentialFilter,
          isActive: true,
        },
        select: {
          itemCode: true,
          itemName: true,
          stock: true,
          buyPrice: true,
          syncStatus: true,
        },
        orderBy: { itemName: "asc" },
      }),
    ]);

    const syncedSales = periodSales.filter((sale) => sale.status === "synced");
    const current = aggregateSales(syncedSales);
    const previous = aggregateSales(previousSales);
    const profit = current.revenue.sub(current.cost);
    const previousProfit = previous.revenue.sub(previous.cost);

    const paymentMap = new Map<
      string,
      { paymentMethod: string; count: number; revenue: Prisma.Decimal }
    >();
    const customerMap = new Map<string, { buyerType: string; count: number; revenue: Prisma.Decimal }>();
    const byDay = new Map<
      string,
      { date: string; revenue: Prisma.Decimal; cost: Prisma.Decimal; sales: number; units: number }
    >();

    for (let index = 0; index < rangeDays; index += 1) {
      const date = addDateOnly(startValue, index);
      byDay.set(date, {
        date,
        revenue: new Prisma.Decimal(0),
        cost: new Prisma.Decimal(0),
        sales: 0,
        units: 0,
      });
    }

    for (const sale of syncedSales) {
      let saleRevenue = new Prisma.Decimal(0);
      let saleCost = new Prisma.Decimal(0);
      let saleUnits = 0;
      for (const item of sale.items) {
        saleRevenue = saleRevenue.add(item.unitPrice.mul(item.quantity));
        saleCost = saleCost.add(item.unitCost.mul(item.quantity));
        saleUnits += item.quantity;
      }

      const payment = paymentMap.get(sale.paymentMethod) ?? {
        paymentMethod: sale.paymentMethod,
        count: 0,
        revenue: new Prisma.Decimal(0),
      };
      payment.count += 1;
      payment.revenue = payment.revenue.add(saleRevenue);
      paymentMap.set(sale.paymentMethod, payment);

      const buyerType = sale.buyerType === "staff" ? "staff" : "guest";
      const customer = customerMap.get(buyerType) ?? {
        buyerType,
        count: 0,
        revenue: new Prisma.Decimal(0),
      };
      customer.count += 1;
      customer.revenue = customer.revenue.add(saleRevenue);
      customerMap.set(buyerType, customer);

      const date = jakartaDateKey(sale.createdAt);
      const day = byDay.get(date);
      if (day) {
        day.revenue = day.revenue.add(saleRevenue);
        day.cost = day.cost.add(saleCost);
        day.sales += 1;
        day.units += saleUnits;
      }
    }

    const productMap = new Map<
      string,
      {
        itemCode: string;
        itemName: string;
        stock: number;
        inventoryCost: Prisma.Decimal;
        fallbackBuyPrice: Prisma.Decimal;
        syncErrors: number;
      }
    >();
    for (const product of products) {
      const existing = productMap.get(product.itemCode) ?? {
        itemCode: product.itemCode,
        itemName: product.itemName,
        stock: 0,
        inventoryCost: new Prisma.Decimal(0),
        fallbackBuyPrice: product.buyPrice,
        syncErrors: 0,
      };
      existing.stock += product.stock;
      existing.inventoryCost = existing.inventoryCost.add(product.buyPrice.mul(product.stock));
      existing.syncErrors += product.syncStatus === "error" ? 1 : 0;
      productMap.set(product.itemCode, existing);
    }

    let inventoryValue = new Prisma.Decimal(0);
    let recommendedRestockCost = new Prisma.Decimal(0);
    let recommendedRestockUnits = 0;
    const restock = [...productMap.values()].map((product) => {
      const soldUnits = current.itemMap.get(product.itemCode)?.units ?? 0;
      const dailyVelocity = soldUnits / rangeDays;
      const reorderPoint = dailyVelocity > 0 ? Math.max(1, Math.ceil(dailyVelocity * 7)) : 0;
      const targetStock = dailyVelocity > 0 ? Math.max(reorderPoint, Math.ceil(dailyVelocity * 14)) : 0;
      const recommendedUnits = Math.max(0, targetStock - product.stock);
      const estimatedUnitCost = product.stock > 0
        ? product.inventoryCost.div(product.stock)
        : product.fallbackBuyPrice;
      const estimatedCost = estimatedUnitCost.mul(recommendedUnits);
      const daysCover = dailyVelocity > 0 ? product.stock / dailyVelocity : null;

      inventoryValue = inventoryValue.add(product.inventoryCost);
      recommendedRestockCost = recommendedRestockCost.add(estimatedCost);
      recommendedRestockUnits += recommendedUnits;

      return {
        itemCode: product.itemCode,
        itemName: product.itemName,
        currentStock: product.stock,
        soldUnits,
        dailyVelocity: Number(dailyVelocity.toFixed(2)),
        daysCover: daysCover === null ? null : Number(daysCover.toFixed(1)),
        reorderPoint,
        recommendedUnits,
        estimatedCost: estimatedCost.toFixed(2),
        status: dailyVelocity === 0
          ? "healthy"
          : product.stock <= 0
            ? "out_of_stock"
            : product.stock <= reorderPoint
              ? "low_stock"
              : "healthy",
      };
    });

    restock.sort((a, b) => {
      const priority = { out_of_stock: 0, low_stock: 1, healthy: 2 };
      return priority[a.status as keyof typeof priority] - priority[b.status as keyof typeof priority]
        || b.recommendedUnits - a.recommendedUnits
        || b.soldUnits - a.soldUnits;
    });

    const topItems = [...current.itemMap.values()]
      .map((item) => {
        const itemProfit = item.revenue.sub(item.cost);
        return {
          itemCode: item.itemCode,
          itemName: item.itemName,
          units: item.units,
          orders: item.orders.size,
          revenue: item.revenue.toFixed(2),
          cost: item.cost.toFixed(2),
          profit: itemProfit.toFixed(2),
          margin: item.revenue.isZero() ? "0.0000" : itemProfit.div(item.revenue).toFixed(4),
          currentStock: productMap.get(item.itemCode)?.stock ?? null,
        };
      })
      .sort((a, b) => Number(b.revenue) - Number(a.revenue));

    const statusCounts = periodSales.reduce<Record<string, number>>((counts, sale) => {
      counts[sale.status] = (counts[sale.status] ?? 0) + 1;
      return counts;
    }, {});
    const actionableRestock = restock.filter((item) => item.recommendedUnits > 0);

    return NextResponse.json({
      period: {
        start: startValue,
        end: endValue,
        days: rangeDays,
        previousStart: previousStartValue,
        previousEnd: previousEndValue,
      },
      summary: {
        revenue: current.revenue.toFixed(2),
        cost: current.cost.toFixed(2),
        profit: profit.toFixed(2),
        margin: current.revenue.isZero() ? "0.0000" : profit.div(current.revenue).toFixed(4),
        units: current.units,
        sales: syncedSales.length,
        averageOrderValue: syncedSales.length ? current.revenue.div(syncedSales.length).toFixed(2) : "0.00",
        averageUnitsPerSale: syncedSales.length ? Number((current.units / syncedSales.length).toFixed(1)) : 0,
      },
      comparison: {
        revenue: percentageChange(current.revenue, previous.revenue),
        cost: percentageChange(current.cost, previous.cost),
        profit: percentageChange(profit, previousProfit),
        units: numberChange(current.units, previous.units),
        sales: numberChange(syncedSales.length, previousSales.length),
      },
      inventory: {
        activeProducts: products.length,
        inventoryValue: inventoryValue.toFixed(2),
        lowStock: actionableRestock.filter((item) => item.status === "low_stock").length,
        outOfStock: actionableRestock.filter((item) => item.status === "out_of_stock").length,
        recommendedRestockUnits,
        recommendedRestockCost: recommendedRestockCost.toFixed(2),
        productSyncErrors: products.filter((product) => product.syncStatus === "error").length,
      },
      transactionHealth: {
        total: periodSales.length,
        synced: statusCounts.synced ?? 0,
        pending: statusCounts.pending_sync ?? 0,
        failed: statusCounts.sync_error ?? 0,
      },
      topItems,
      restock: actionableRestock,
      paymentMix: [...paymentMap.values()]
        .map((row) => ({ ...row, revenue: row.revenue.toFixed(2) }))
        .sort((a, b) => b.count - a.count),
      customerMix: [...customerMap.values()]
        .map((row) => ({ ...row, revenue: row.revenue.toFixed(2) }))
        .sort((a, b) => b.count - a.count),
      trend: [...byDay.values()].map((row) => ({
        date: row.date,
        revenue: row.revenue.toFixed(2),
        cost: row.cost.toFixed(2),
        profit: row.revenue.sub(row.cost).toFixed(2),
        sales: row.sales,
        units: row.units,
      })),
    });
  } catch (error) {
    console.error("[analytics/pos] Failed to load report", error);
    return NextResponse.json({ error: "Unable to load POS analytics" }, { status: 500 });
  }
}
