import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPosContext, getStaffAllowance, withSerializableRetry } from "@/lib/pos-server";
import { calculateTotals, paymentMethodSchema } from "@/lib/pos";
import { syncPosSale } from "@/lib/accurate/pos";
import { canOperatePos } from "@/lib/access-control";
import { getOperationalPosCredential } from "@/lib/credential-access";


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canOperatePos(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { paymentMethod?: string } | null;
  const payment = paymentMethodSchema.safeParse(body?.paymentMethod);
  if (!payment.success) return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  const reservation = await prisma.posReservation.findUnique({ where: { id }, include: { items: true, sale: true } });
  if (!reservation) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  if (reservation.sale) return NextResponse.json(reservation.sale);
  if (!await getOperationalPosCredential(session.user.role, reservation.credentialId)) {
    return NextResponse.json({ error: "Reservation is not available to this POS operator" }, { status: 403 });
  }
  const context = await getPosContext(session.user.id, reservation.credentialId, true);
  if (!context?.settings) return NextResponse.json({ error: "POS is not configured" }, { status: 409 });

  let allowanceUsed = 0;
  if (payment.data === "allowance") {
    if (!reservation.staffEmail?.trim()) {
      return NextResponse.json({ error: "This reservation has no staff email on file; allowance payment is unavailable." }, { status: 409 });
    }
    const { revenue } = calculateTotals(reservation.items.map((item) => ({ ...item, unitPrice: Number(item.unitPrice), unitCost: Number(item.unitCost) })));
    const allowance = await getStaffAllowance(reservation.credentialId, reservation.staffEmail);
    if (revenue > allowance.remaining) {
      return NextResponse.json({ error: "Insufficient allowance balance. Please use cash or QRIS instead.", allowance }, { status: 409 });
    }
    allowanceUsed = revenue;
  }

  const sale = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const changed = await tx.posReservation.updateMany({ where: { id, status: "active", expiresAt: { gt: new Date() } }, data: { status: "picked_up", pickupAt: new Date() } });
    if (changed.count !== 1) throw new Error("RESERVATION_CONFLICT");
    for (const item of reservation.items) {
      const allocation = await tx.posStockAllocation.findUnique({ where: { credentialId_warehouseId_itemCode: { credentialId: reservation.credentialId, warehouseId: reservation.warehouseId, itemCode: item.itemCode } } });
      if (!allocation || allocation.heldQuantity < item.quantity) throw new Error("ALLOCATION_CONFLICT");
      const product = await tx.posProduct.findUnique({ where: { credentialId_itemCode: { credentialId: reservation.credentialId, itemCode: item.itemCode } } });
      if (!product || product.stock < item.quantity) throw new Error("ALLOCATION_CONFLICT");
      await tx.posProduct.update({ where: { id: product.id }, data: { stock: { decrement: item.quantity }, syncStatus: "pending", syncError: null } });
      await tx.posStockAllocation.update({ where: { id: allocation.id }, data: { heldQuantity: { decrement: item.quantity }, soldQuantity: { increment: item.quantity }, stockSnapshot: product.stock - item.quantity } });
    }
    return tx.posSale.create({ data: { userId: session.user.id, credentialId: reservation.credentialId, reservationId: reservation.id, idempotencyKey: `reservation:${reservation.id}`, requestFingerprint: `reservation:${reservation.id}`, warehouseId: reservation.warehouseId, warehouseName: reservation.warehouseName, paymentMethod: payment.data, buyerType: "staff", staffEmail: reservation.staffEmail, staffName: reservation.staffName, allowanceUsed, items: { create: reservation.items.map((item) => ({ itemCode: item.itemCode, itemName: item.itemName, quantity: item.quantity, unitPrice: item.unitPrice, unitCost: item.unitCost })) } }, include: { items: true } });
  }).catch((error: unknown) => { if (error instanceof Error && ["RESERVATION_CONFLICT", "ALLOCATION_CONFLICT"].includes(error.message)) return null; throw error; }));
  if (!sale) return NextResponse.json({ error: "Reservation changed by another request" }, { status: 409 });
  if (!context.accurate) {
    const failed = await prisma.posSale.update({
      where: { id: sale.id },
      data: { status: "sync_error", syncError: "Accurate session is not ready" },
      include: { items: true },
    });
    return NextResponse.json({ sale: failed, error: "Pickup was saved locally but Accurate is not connected" }, { status: 502 });
  }
  try {
    const adjustment = await syncPosSale(context.accurate, sale);
    const completed = await prisma.posSale.update({
      where: { id: sale.id },
      data: { status: "synced", accurateId: adjustment.id, syncedAt: new Date(), syncError: null },
      include: { items: true },
    });
    return NextResponse.json({ sale: completed, adjustmentNumber: adjustment.number }, { status: 201 });
  } catch {
    const failed = await prisma.posSale.update({
      where: { id: sale.id },
      data: { status: "sync_error", syncError: "Unable to create the Accurate inventory adjustment; no confirmed adjustment ID was returned" },
      include: { items: true },
    });
    return NextResponse.json({ sale: failed, error: "Pickup was saved locally but Accurate inventory adjustment could not be confirmed" }, { status: 502 });
  }
}
