import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOutstandingPreviousAllowanceDebt, getPosContext, withSerializableRetry } from "@/lib/pos-server";
import { calculateTotals, paymentMethodSchema } from "@/lib/pos";
import { syncPosSale } from "@/lib/accurate/pos";
import { canOperatePos } from "@/lib/access-control";
import { getOperationalPosCredential } from "@/lib/credential-access";
import { sendPosSaleReceipt } from "@/lib/pos-sale-receipt";


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
  if (reservation.sale) {
    if (reservation.sale.status === "synced") after(() => sendPosSaleReceipt(reservation.sale!.id));
    return NextResponse.json(reservation.sale);
  }
  if (!await getOperationalPosCredential(session.user.id, session.user.role, reservation.credentialId)) {
    return NextResponse.json({ error: "Reservation is not available to this POS operator" }, { status: 403 });
  }
  const context = await getPosContext(session.user.id, reservation.credentialId);
  if (!context?.settings) return NextResponse.json({ error: "POS is not configured" }, { status: 409 });

  if (!reservation.staffEmail?.trim()) {
    return NextResponse.json({ error: "This reservation has no staff email on file." }, { status: 409 });
  }
  const previousDebt = await getOutstandingPreviousAllowanceDebt(reservation.credentialId, reservation.staffEmail);
  if (previousDebt.blocked) {
    return NextResponse.json({ error: "Previous-period negative balance must be paid before another transaction can be completed.", previousDebt }, { status: 409 });
  }

  let allowanceUsed = 0;
  if (payment.data === "allowance") {
    allowanceUsed = calculateTotals(reservation.items.map((item) => ({ ...item, unitPrice: Number(item.unitPrice), unitCost: Number(item.unitCost) }))).revenue;
  }

  const sale = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const changed = await tx.posReservation.updateMany({ where: { id, status: "active", expiresAt: { gt: new Date() } }, data: { status: "picked_up", pickupAt: new Date() } });
    if (changed.count !== 1) throw new Error("RESERVATION_CONFLICT");
    const createdSale = await tx.posSale.create({ data: { userId: session.user.id, credentialId: reservation.credentialId, reservationId: reservation.id, idempotencyKey: `reservation:${reservation.id}`, requestFingerprint: `reservation:${reservation.id}`, warehouseId: reservation.warehouseId, warehouseName: reservation.warehouseName, paymentMethod: payment.data, buyerType: "staff", staffEmail: reservation.staffEmail, staffName: reservation.staffName, allowanceUsed, items: { create: reservation.items.map((item) => ({ itemCode: item.itemCode, itemName: item.itemName, quantity: item.quantity, unitPrice: item.unitPrice, unitCost: item.unitCost })) } }, include: { items: true } });
    for (const item of reservation.items) {
      const allocation = await tx.posStockAllocation.findUnique({ where: { credentialId_warehouseId_itemCode: { credentialId: reservation.credentialId, warehouseId: reservation.warehouseId, itemCode: item.itemCode } } });
      if (!allocation || allocation.heldQuantity < item.quantity) throw new Error("ALLOCATION_CONFLICT");
      const product = await tx.posProduct.findUnique({ where: { credentialId_itemCode: { credentialId: reservation.credentialId, itemCode: item.itemCode } } });
      if (!product || product.stock < item.quantity) throw new Error("ALLOCATION_CONFLICT");
      await tx.posProduct.update({ where: { id: product.id }, data: { stock: { decrement: item.quantity }, syncStatus: "pending", syncError: null } });
      await tx.posStockAllocation.update({ where: { id: allocation.id }, data: { heldQuantity: { decrement: item.quantity }, soldQuantity: { increment: item.quantity }, stockSnapshot: product.stock - item.quantity } });
      await tx.posStockChange.create({
        data: {
          credentialId: reservation.credentialId,
          productId: product.id,
          saleId: createdSale.id,
          userId: session.user.id,
          itemCode: product.itemCode,
          itemName: product.itemName,
          previousStock: product.stock,
          newStock: product.stock - item.quantity,
          quantityChange: -item.quantity,
          source: "sale",
          note: `Preorder pickup sale (${payment.data})`,
        },
      });
    }
    return createdSale;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => { if (error instanceof Error && ["RESERVATION_CONFLICT", "ALLOCATION_CONFLICT"].includes(error.message)) return null; throw error; }));
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
    after(() => sendPosSaleReceipt(completed.id));
    return NextResponse.json({ sale: completed, adjustmentNumber: adjustment.number }, { status: 201 });
  } catch (error) {
    const syncError = error instanceof Error ? error.message : "Unknown Accurate synchronization error";
    const failed = await prisma.posSale.update({
      where: { id: sale.id },
      data: { status: "sync_error", syncError },
      include: { items: true },
    });
    return NextResponse.json({ sale: failed, error: "Pickup was saved locally but Accurate inventory adjustment could not be confirmed" }, { status: 502 });
  }
}
