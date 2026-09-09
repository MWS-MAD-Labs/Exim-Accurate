import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { syncPosSale } from "@/lib/accurate/pos";
import { canOperatePos } from "@/lib/access-control";
import { authOptions } from "@/lib/auth";
import { getOperationalPosCredential } from "@/lib/credential-access";
import { legacyPaymentIntent, legacyPaymentMethodSchema, paymentIntentSchema, PaymentAllocationError, serializePayments } from "@/lib/pos-payments";
import { allocateSalePayment, getPosContext, saleTotal, withSerializableRetry } from "@/lib/pos-server";
import { sendPosSaleReceipt } from "@/lib/pos-sale-receipt";
import { prisma } from "@/lib/prisma";

const saleInclude = { items: true, payments: { orderBy: { createdAt: "asc" as const } } } satisfies Prisma.PosSaleInclude;
const pickupPaymentSchema = z.object({
  payment: paymentIntentSchema.optional(),
  paymentMethod: legacyPaymentMethodSchema.optional(),
}).refine((value) => !!value.payment !== !!value.paymentMethod, {
  message: "Provide exactly one payment intent",
  path: ["payment"],
}).transform((value) => value.payment ?? legacyPaymentIntent(value.paymentMethod!));

function responseFor(sale: Prisma.PosSaleGetPayload<{ include: typeof saleInclude }>, adjustmentNumber?: string) {
  return {
    sale: { ...sale, payments: serializePayments(sale.payments) },
    allowance: sale.allowanceBalanceBefore === null ? null : {
      before: sale.allowanceBalanceBefore.toFixed(2),
      used: sale.allowanceUsed.toFixed(2),
      after: sale.allowanceBalanceAfter?.toFixed(2) ?? null,
      periodStartsAt: sale.allowancePeriodStartsAt?.toISOString() ?? null,
      periodEndsAt: sale.allowancePeriodEndsAt?.toISOString() ?? null,
    },
    adjustmentNumber,
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canOperatePos(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const payment = pickupPaymentSchema.safeParse(await req.json().catch(() => null));
  if (!payment.success) return NextResponse.json({ error: payment.error.issues[0]?.message || "Invalid payment intent" }, { status: 400 });

  const { id } = await params;
  const reservation = await prisma.posReservation.findUnique({ where: { id }, include: { items: true, sale: { include: saleInclude } } });
  if (!reservation) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  if (!await getOperationalPosCredential(session.user.id, session.user.role, reservation.credentialId)) {
    return NextResponse.json({ error: "Reservation is not available to this POS operator" }, { status: 403 });
  }
  if (reservation.sale) {
    if (reservation.sale.status === "synced") after(() => sendPosSaleReceipt(reservation.sale!.id));
    return NextResponse.json(responseFor(reservation.sale));
  }
  const context = await getPosContext(session.user.id, reservation.credentialId);
  if (!context?.settings) return NextResponse.json({ error: "POS is not configured" }, { status: 409 });
  if (!reservation.staffEmail?.trim()) return NextResponse.json({ error: "This reservation has no staff email on file." }, { status: 409 });

  let sale: Prisma.PosSaleGetPayload<{ include: typeof saleInclude }> | null;
  try {
    sale = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
      const allocation = await allocateSalePayment(tx, {
        credentialId: reservation.credentialId,
        buyerType: "staff",
        staffEmail: reservation.staffEmail,
        total: saleTotal(reservation.items),
        payment: payment.data,
      });
      const changed = await tx.posReservation.updateMany({ where: { id, status: "active", expiresAt: { gt: new Date() } }, data: { status: "picked_up", pickupAt: new Date() } });
      if (changed.count !== 1) throw new Error("RESERVATION_CONFLICT");
      const createdSale = await tx.posSale.create({
        data: {
          userId: session.user.id,
          credentialId: reservation.credentialId,
          reservationId: reservation.id,
          idempotencyKey: `reservation:${reservation.id}`,
          requestFingerprint: `reservation:${reservation.id}:${JSON.stringify(payment.data)}`,
          warehouseId: reservation.warehouseId,
          warehouseName: reservation.warehouseName,
          paymentMethod: allocation.paymentMethod,
          paymentStrategy: allocation.strategy,
          buyerType: "staff",
          staffEmail: reservation.staffEmail.toLowerCase().trim(),
          staffName: reservation.staffName,
          allowanceUsed: allocation.allowanceUsed,
          allowancePeriodStartsAt: allocation.period?.startsAt,
          allowancePeriodEndsAt: allocation.period?.endsAt,
          allowanceBalanceBefore: allocation.allowanceBalanceBefore,
          allowanceBalanceAfter: allocation.allowanceBalanceAfter,
          payments: { create: allocation.payments },
          items: { create: reservation.items.map((item) => ({ itemCode: item.itemCode, itemName: item.itemName, quantity: item.quantity, unitPrice: item.unitPrice, unitCost: item.unitCost })) },
        },
        include: saleInclude,
      });
      for (const item of reservation.items) {
        const stockAllocation = await tx.posStockAllocation.findUnique({ where: { credentialId_warehouseId_itemCode: { credentialId: reservation.credentialId, warehouseId: reservation.warehouseId, itemCode: item.itemCode } } });
        if (!stockAllocation || stockAllocation.heldQuantity < item.quantity) throw new Error("ALLOCATION_CONFLICT");
        const product = await tx.posProduct.findUnique({ where: { credentialId_itemCode: { credentialId: reservation.credentialId, itemCode: item.itemCode } } });
        if (!product || product.stock < item.quantity) throw new Error("ALLOCATION_CONFLICT");
        await tx.posProduct.update({ where: { id: product.id }, data: { stock: { decrement: item.quantity }, syncStatus: "pending", syncError: null } });
        await tx.posStockAllocation.update({ where: { id: stockAllocation.id }, data: { heldQuantity: { decrement: item.quantity }, soldQuantity: { increment: item.quantity }, stockSnapshot: product.stock - item.quantity } });
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
            note: `Preorder pickup (${allocation.strategy}: ${serializePayments(allocation.payments).map((entry) => `${entry.method} ${entry.amount}`).join(" + ")})`,
          },
        });
      }
      return createdSale;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
      if (error instanceof Error && ["RESERVATION_CONFLICT", "ALLOCATION_CONFLICT"].includes(error.message)) return null;
      throw error;
    }));
  } catch (error) {
    if (error instanceof PaymentAllocationError) {
      const message = error.code === "ALLOWANCE_CHANGED"
        ? "Allowance balance changed. Review the updated payment."
        : error.code === "ALLOWANCE_DEBT_CHANGED"
          ? "The resulting allowance debt changed. Review and confirm again."
          : "No positive allowance is available. Choose Cash, QRIS, or explicitly confirm allowance debt.";
      return NextResponse.json({ code: error.code, error: message, ...error.details }, { status: 409 });
    }
    if (error instanceof Error && error.message === "PREVIOUS_ALLOWANCE_DEBT_BLOCKED") {
      return NextResponse.json({ error: "Previous-period negative balance must be paid before another transaction can be completed." }, { status: 409 });
    }
    throw error;
  }
  if (!sale) return NextResponse.json({ error: "Reservation changed by another request" }, { status: 409 });

  const attemptAt = new Date();
  await prisma.posSale.update({ where: { id: sale.id }, data: { syncAttempts: { increment: 1 }, lastSyncAttemptAt: attemptAt, nextSyncAttemptAt: null } });
  if (!context.accurate) {
    const failed = await prisma.posSale.update({ where: { id: sale.id }, data: { status: "sync_error", syncError: "Accurate session is not ready", nextSyncAttemptAt: new Date(attemptAt.getTime() + 5 * 60 * 1000) }, include: saleInclude });
    return NextResponse.json({ ...responseFor(failed), error: "Pickup was saved locally but Accurate is not connected" }, { status: 502 });
  }
  try {
    const adjustment = await syncPosSale(context.accurate, sale);
    const completed = await prisma.posSale.update({ where: { id: sale.id }, data: { status: "synced", accurateId: adjustment.id, syncedAt: new Date(), syncError: null }, include: saleInclude });
    after(() => sendPosSaleReceipt(completed.id));
    return NextResponse.json(responseFor(completed, adjustment.number), { status: 201 });
  } catch (error) {
    const syncError = error instanceof Error ? error.message : "Unknown Accurate synchronization error";
    const failed = await prisma.posSale.update({ where: { id: sale.id }, data: { status: "sync_error", syncError, nextSyncAttemptAt: new Date(attemptAt.getTime() + 5 * 60 * 1000) }, include: saleInclude });
    return NextResponse.json({ ...responseFor(failed), error: "Pickup was saved locally but Accurate inventory adjustment could not be confirmed" }, { status: 502 });
  }
}
