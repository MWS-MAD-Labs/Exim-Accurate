import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getOrganizationIdForUser } from "@/lib/organization";
import { isAdmin } from "@/lib/pos-server";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const organizationId = await getOrganizationIdForUser(session.user.id);
  if (!organizationId) return NextResponse.json({ error: "Organization not found" }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const start = new Date(params.get("start") || new Date(new Date().setDate(new Date().getDate() - 30)));
  const end = new Date(params.get("end") || new Date());
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  const credentialId = params.get("credentialId");
  const sales = await prisma.posSale.findMany({
    where: {
      credential: { organizationId },
      ...(credentialId ? { credentialId } : {}),
      createdAt: { gte: start, lte: end },
      status: "synced",
    },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });
  const itemMap = new Map<string, { itemCode: string; itemName: string; units: number; revenue: Prisma.Decimal; cost: Prisma.Decimal }>();
  const paymentMap = new Map<string, number>();
  let revenue = new Prisma.Decimal(0); let cost = new Prisma.Decimal(0); let units = 0;
  for (const sale of sales) {
    paymentMap.set(sale.paymentMethod, (paymentMap.get(sale.paymentMethod) || 0) + 1);
    for (const item of sale.items) {
      const lineRevenue = item.unitPrice.mul(item.quantity); const lineCost = item.unitCost.mul(item.quantity);
      revenue = revenue.add(lineRevenue); cost = cost.add(lineCost); units += item.quantity;
      const current = itemMap.get(item.itemCode) || { itemCode: item.itemCode, itemName: item.itemName, units: 0, revenue: new Prisma.Decimal(0), cost: new Prisma.Decimal(0) };
      current.units += item.quantity; current.revenue = current.revenue.add(lineRevenue); current.cost = current.cost.add(lineCost); itemMap.set(item.itemCode, current);
    }
  }
  const byDay = new Map<string, { date: string; revenue: Prisma.Decimal; cost: Prisma.Decimal }>();
  for (const sale of sales) {
    const date = sale.createdAt.toISOString().slice(0, 10);
    const row = byDay.get(date) || { date, revenue: new Prisma.Decimal(0), cost: new Prisma.Decimal(0) };
    for (const item of sale.items) { row.revenue = row.revenue.add(item.unitPrice.mul(item.quantity)); row.cost = row.cost.add(item.unitCost.mul(item.quantity)); }
    byDay.set(date, row);
  }
  const profit = revenue.sub(cost);
  return NextResponse.json({
    summary: { revenue: revenue.toFixed(2), cost: cost.toFixed(2), profit: profit.toFixed(2), margin: revenue.isZero() ? "0.0000" : profit.div(revenue).toFixed(4), units, sales: sales.length },
    topItems: [...itemMap.values()].map((item) => ({ itemCode: item.itemCode, itemName: item.itemName, units: item.units, revenue: item.revenue.toFixed(2), cost: item.cost.toFixed(2), profit: item.revenue.sub(item.cost).toFixed(2) })).sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, 10),
    paymentMix: [...paymentMap.entries()].map(([paymentMethod, count]) => ({ paymentMethod, count })),
    trend: [...byDay.values()].map((row) => ({ date: row.date, revenue: row.revenue.toFixed(2), cost: row.cost.toFixed(2), profit: row.revenue.sub(row.cost).toFixed(2) })),
  });
}
