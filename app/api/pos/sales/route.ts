import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { saleRequestSchema, calculateTotals } from "@/lib/pos";
import { applyPosCatalog, canonicalSaleItems, expireReservations, getPosContext, getStaffAllowance, withSerializableRetry } from "@/lib/pos-server";
import { resolvePosProducts, syncPosSale } from "@/lib/accurate/pos";
import crypto from "node:crypto";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = saleRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid sale" }, { status: 400 });
  const { credentialId, items: requestedItems, paymentMethod, idempotencyKey, buyerType, staffEmail, staffName } = parsed.data;
  const context = await getPosContext(session.user.id, credentialId);
  if (!context) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  if (!context.settings || !context.accurate) return NextResponse.json({ error: "POS is not configured" }, { status: 409 });
  await expireReservations(credentialId);
  let accurateProducts;
  try { accurateProducts = await resolvePosProducts(context.accurate, { id: context.settings.warehouseId, name: context.settings.warehouseName }, requestedItems.map((item) => item.itemCode)); }
  catch { return NextResponse.json({ error: "Unable to verify products and warehouse stock" }, { status: 502 }); }
  const products = await applyPosCatalog(credentialId, accurateProducts);
  if (products.length !== requestedItems.length) {
    return NextResponse.json({ error: "Some items are not available in the POS catalog" }, { status: 409 });
  }
  const items = canonicalSaleItems(requestedItems, products);
  const normalizedStaffEmail = staffEmail?.toLowerCase().trim();

  let allowanceUsed = 0;
  if (paymentMethod === "allowance") {
    const { revenue } = calculateTotals(items);
    const allowance = await getStaffAllowance(credentialId, normalizedStaffEmail!);
    if (revenue > allowance.remaining) {
      return NextResponse.json({ error: "Insufficient allowance balance. Please use cash or QRIS instead.", allowance }, { status: 409 });
    }
    allowanceUsed = revenue;
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
    const allocations = new Map<string, { id: string }>();
    for (const item of items) {
      const allocation = await tx.posStockAllocation.upsert({ where: { credentialId_warehouseId_itemCode: { credentialId, warehouseId: context.settings!.warehouseId, itemCode: item.itemCode } }, update: { stockSnapshot: products.find((product) => product.itemCode === item.itemCode)!.stock }, create: { userId: session.user.id, credentialId, warehouseId: context.settings!.warehouseId, warehouseName: context.settings!.warehouseName, itemCode: item.itemCode, stockSnapshot: products.find((product) => product.itemCode === item.itemCode)!.stock } });
      allocations.set(item.itemCode, allocation);
      const updated = await tx.posStockAllocation.updateMany({ where: { id: allocation.id, soldQuantity: { lte: allocation.stockSnapshot - allocation.heldQuantity - item.quantity } }, data: { soldQuantity: { increment: item.quantity } } });
      if (updated.count !== 1) throw new Error("INSUFFICIENT_STOCK");
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
