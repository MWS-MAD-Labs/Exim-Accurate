import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canUseStaffStore } from "@/lib/access-control";
import { authOptions } from "@/lib/auth";
import { getOrganizationIdForUser } from "@/lib/organization";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;
const cursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().uuid(),
}).strict();

const transactionSelect = {
  id: true,
  createdAt: true,
  warehouseName: true,
  reservation: { select: { reference: true } },
  status: true,
  paymentMethod: true,
  payments: {
    select: { method: true, amount: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  allowanceUsed: true,
  allowanceBalanceAfter: true,
  items: {
    select: { id: true, itemName: true, itemCode: true, quantity: true, unitPrice: true },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.PosSaleSelect;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!session?.user?.id || !email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseStaffStore(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  if ([...params.keys()].some((key) => key !== "cursor" && key !== "limit")
    || params.getAll("cursor").length > 1
    || params.getAll("limit").length > 1
    || (params.has("limit") && params.get("limit") !== String(PAGE_SIZE))) {
    return NextResponse.json({ error: "Only cursor and limit=20 are supported" }, { status: 400 });
  }

  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (params.has("cursor")) {
    const encoded = params.get("cursor")!;
    try {
      if (encoded.length > 512 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("Invalid cursor");
      cursor = cursorSchema.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
      if (!Number.isFinite(new Date(cursor.createdAt).getTime())) throw new Error("Invalid cursor");
    } catch {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }
  }

  const organizationId = await getOrganizationIdForUser(session.user.id);
  if (!organizationId) {
    return NextResponse.json({ error: "Organization not found" }, { status: 403 });
  }

  const sales = await prisma.posSale.findMany({
    where: {
      staffEmail: email,
      buyerType: "staff",
      credential: { organizationId },
      // These are completed local purchases; status tracks Accurate synchronization.
      status: { in: ["pending_sync", "synced", "sync_error"] },
      ...(cursor ? {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      } : {}),
    },
    select: transactionSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
  });
  const page = sales.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  const nextCursor = sales.length > PAGE_SIZE && last
    ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString("base64url")
    : null;

  return NextResponse.json({
    transactions: page.map((sale) => ({
      id: sale.id,
      createdAt: sale.createdAt.toISOString(),
      warehouseName: sale.warehouseName,
      reservationReference: sale.reservation?.reference ?? null,
      status: sale.status,
      paymentMethod: sale.paymentMethod,
      payments: sale.payments.map((payment) => ({ method: payment.method, amount: payment.amount.toFixed(2) })),
      total: sale.items.reduce((sum, item) => sum.plus(item.unitPrice.times(item.quantity)), new Prisma.Decimal(0)).toFixed(2),
      allowanceUsed: sale.allowanceUsed.toFixed(2),
      allowanceBalanceAfter: sale.allowanceBalanceAfter?.toFixed(2) ?? null,
      items: sale.items.map((item) => ({
        id: item.id,
        itemName: item.itemName,
        itemCode: item.itemCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
      })),
    })),
    nextCursor,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
