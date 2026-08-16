import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { saleRequestSchema, calculateTotals } from "@/lib/pos";
import { canonicalizeRequestedItems, canonicalSaleItems, expireReservations, getPosContext, resolveLocalPosProducts, withSerializableRetry } from "@/lib/pos-server";
import { syncPosSale } from "@/lib/accurate/pos";
import crypto from "node:crypto";
import { canOperatePos } from "@/lib/access-control";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canOperatePos(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = saleRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid sale" }, { status: 400 });
  const { credentialId, items: requestedItems, paymentMethod, idempotencyKey, buyerType, staffEmail, staffName } = parsed.data;
  const context = await getPosContext(session.user.id, credentialId);
  if (!context) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  if (!context.settings) return NextResponse.json({ error: "POS is not configured" }, { status: 409 });
  await expireReservations(credentialId);
  const products = await resolveLocalPosProducts(
    credentialId,
    { id: context.settings.warehouseId, name: context.settings.warehouseName },
    requestedItems.map((item) => item.itemCode),
  );
  const uniqueRequestedItems = canonicalizeRequestedItems(requestedItems);
  if (products.length !== uniqueRequestedItems.length) {
    return NextResponse.json({ error: "Some items are not available in the POS catalog" }, { status: 409 });
  }
  const items = canonicalSaleItems(requestedItems, products);
  const normalizedStaffEmail = staffEmail?.toLowerCase().trim();

  let allowanceUsed = 0;
  if (paymentMethod === "allowance") {
    allowanceUsed = calculateTotals(items).revenue;
  }

  const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ credentialId, paymentMethod, items, buyerType, staffEmail: normalizedStaffEmail })).digest("hex");
  const existing = await prisma.posSale.findUnique({ where: { userId_idempotencyKey: { userId: session.user.id, idempotencyKey } }, include: { items: true } });
  if (existing) {
    if (existing.requestFingerprint !== fingerprint) return NextResponse.json({ error: "Idempotency key was already used for a different sale" }, { status: 409 });
    if (existing.status !== "synced") {
      return NextResponse.json({ sale: existing, error: "This sale has no confirmed Accurate adjustment ID. Manual reconciliation is required before retrying." }, { status: 409 });
    }
    return NextResponse.json(existing);
  }
  const created = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    for (const item of items) {
      const product = await tx.posProduct.findUnique({ where: { credentialId_itemCode: { credentialId, itemCode: item.itemCode } } });
      if (!product?.isActive) throw new Error("INSUFFICIENT_STOCK");
      const allocation = await tx.posStockAllocation.findUnique({ where: { credentialId_warehouseId_itemCode: { credentialId, warehouseId: context.settings!.warehouseId, itemCode: item.itemCode } } });
      const heldQuantity = allocation?.heldQuantity ?? 0;
      const updated = await tx.posProduct.updateMany({
        where: { id: product.id, stock: { gte: heldQuantity + item.quantity } },
        data: { stock: { decrement: item.quantity }, syncStatus: "pending", syncError: null },
      });
      if (updated.count !== 1) throw new Error("INSUFFICIENT_STOCK");
      if (allocation) {
        await tx.posStockAllocation.update({ where: { id: allocation.id }, data: { stockSnapshot: product.stock - item.quantity, soldQuantity: { increment: item.quantity } } });
      }
    }
    const sale = await tx.posSale.create({ data: { userId: session.user.id, credentialId, idempotencyKey, requestFingerprint: fingerprint, warehouseId: context.settings!.warehouseId, warehouseName: context.settings!.warehouseName, paymentMethod, buyerType, staffEmail: normalizedStaffEmail, staffName, allowanceUsed, items: { create: items } }, include: { items: true } });
    return { sale, created: true };
  }).catch(async (error: unknown) => {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") return null;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.posSale.findUnique({ where: { userId_idempotencyKey: { userId: session.user.id, idempotencyKey } }, include: { items: true } });
      if (existing?.requestFingerprint === fingerprint) return { sale: existing, created: false };
    }
    throw error;
  }));
  if (!created) return NextResponse.json({ error: "Insufficient available stock" }, { status: 409 });
  if (!created.created) {
    if (created.sale.status === "synced") return NextResponse.json(created.sale);
    return NextResponse.json({ sale: created.sale, error: "This sale is already being processed or requires manual reconciliation." }, { status: 409 });
  }
  const sale = created.sale;
  if (!context.accurate) {
    const failed = await prisma.posSale.update({
      where: { id: sale.id },
      data: { status: "sync_error", syncError: "Accurate session is not ready" },
      include: { items: true },
    });
    return NextResponse.json({ sale: failed, error: "Sale was saved locally but Accurate is not connected" }, { status: 502 });
  }
  try {
    const adjustment = await syncPosSale(context.accurate, sale);
    const completed = await prisma.posSale.update({
      where: { id: sale.id },
      data: { status: "synced", accurateId: adjustment.id, syncedAt: new Date(), syncError: null },
      include: { items: true },
    });
    return NextResponse.json({ sale: completed, totals: calculateTotals(items), adjustmentNumber: adjustment.number }, { status: 201 });
  } catch {
    const failed = await prisma.posSale.update({
      where: { id: sale.id },
      data: { status: "sync_error", syncError: "Unable to create the Accurate inventory adjustment; no confirmed adjustment ID was returned" },
      include: { items: true },
    });
    return NextResponse.json({ sale: failed, error: "Sale was saved locally but Accurate inventory adjustment could not be confirmed" }, { status: 502 });
  }
}
