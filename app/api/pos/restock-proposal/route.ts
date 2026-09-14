import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getOperationalPosCredential } from "@/lib/credential-access";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  credentialId: z.string().uuid(),
});

const LOOKBACK_DAYS = 30;
const TARGET_COVER_DAYS = 14;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const parsed = querySchema.safeParse({ credentialId: params.get("credentialId") });
  if (!parsed.success) return NextResponse.json({ error: "A valid POS credential is required" }, { status: 400 });

  const credential = await getOperationalPosCredential(
    session.user.id,
    session.user.role,
    parsed.data.credentialId,
  );
  if (!credential) return NextResponse.json({ error: "POS store is not available" }, { status: 404 });

  const settings = await prisma.posSettings.findUnique({
    where: { credentialId: credential.id },
    select: { warehouseId: true },
  });
  if (!settings) return NextResponse.json({ error: "POS warehouse is not configured" }, { status: 409 });

  const salesSince = new Date();
  salesSince.setDate(salesSince.getDate() - LOOKBACK_DAYS);

  const [products, sales, allocations] = await Promise.all([
    prisma.posProduct.findMany({
      where: { credentialId: credential.id, isActive: true },
      select: { itemCode: true, itemName: true, unit: true, stock: true, buyPrice: true },
      orderBy: { itemName: "asc" },
    }),
    prisma.posSale.findMany({
      where: {
        credentialId: credential.id,
        status: { in: ["pending_sync", "sync_error", "synced"] },
        createdAt: { gte: salesSince },
      },
      select: { items: { select: { itemCode: true, quantity: true } } },
    }),
    prisma.posStockAllocation.findMany({
      where: { credentialId: credential.id, warehouseId: settings.warehouseId, heldQuantity: { gt: 0 } },
      select: { itemCode: true, heldQuantity: true },
    }),
  ]);

  const heldByCode = new Map(allocations.map((allocation) => [allocation.itemCode, allocation.heldQuantity]));
  const soldByCode = new Map<string, number>();
  for (const sale of sales) {
    for (const item of sale.items) {
      soldByCode.set(item.itemCode, (soldByCode.get(item.itemCode) ?? 0) + item.quantity);
    }
  }

  const items = products
    .map((product) => {
      const soldUnits = soldByCode.get(product.itemCode) ?? 0;
      const targetStock = soldUnits > 0
        ? Math.max(1, Math.ceil((soldUnits / LOOKBACK_DAYS) * TARGET_COVER_DAYS))
        : 0;
      const heldQuantity = heldByCode.get(product.itemCode) ?? 0;
      const availableStock = Math.max(0, product.stock - heldQuantity);
      const proposedQuantity = Math.max(0, targetStock - availableStock);
      const buyPrice = Number(product.buyPrice);
      return {
        itemCode: product.itemCode,
        itemName: product.itemName,
        unit: product.unit,
        currentStock: product.stock,
        heldQuantity,
        availableStock,
        soldUnits,
        proposedQuantity,
        buyPrice,
        lineTotal: proposedQuantity * buyPrice,
      };
    })
    .filter((item) => item.proposedQuantity > 0)
    .sort((a, b) => b.proposedQuantity - a.proposedQuantity || b.soldUnits - a.soldUnits || a.itemName.localeCompare(b.itemName));

  return NextResponse.json({
    lookbackDays: LOOKBACK_DAYS,
    targetCoverDays: TARGET_COVER_DAYS,
    proposer: { name: session.user.name ?? null, email: session.user.email ?? null },
    generatedAt: new Date().toISOString(),
    items,
  });
}
