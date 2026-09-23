import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { assertReservationDebtAuthorized, reservationPickupPaymentIntent, ReservationPaymentError } from "@/lib/pos-reservation-payment";

import { canOperatePos } from "@/lib/access-control";
import { authOptions } from "@/lib/auth";
import { getOperationalPosCredential } from "@/lib/credential-access";
import { PaymentAllocationError, serializePayments } from "@/lib/pos-payments";
import { allocateSalePayment, getPosContext, lockPosSynchronization, reconcileSaleImmediateDebtSettlement, saleTotal, withSerializableRetry } from "@/lib/pos-server";
import { sendPosSaleReceipt } from "@/lib/pos-sale-receipt";
import { prisma } from "@/lib/prisma";

const saleInclude = { items: true, payments: { orderBy: { createdAt: "asc" as const } } } satisfies Prisma.PosSaleInclude;


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
  // Confirmation only: caller-supplied payment fields never override the reservation.

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
    const payment = reservationPickupPaymentIntent(reservation, await req.json().catch(() => null));
    sale = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
      await lockPosSynchronization(tx, reservation.credentialId);
      const allocation = await allocateSalePayment(tx, {
        credentialId: reservation.credentialId,
        buyerType: "staff",
        staffEmail: reservation.staffEmail,
        total: saleTotal(reservation.items),
        payment,
      });
      assertReservationDebtAuthorized(allocation, reservation.approvedResultingDebt);
      const changed = await tx.posReservation.updateMany({ where: { id, status: "active", expiresAt: { gt: new Date() } }, data: { status: "picked_up", pickupAt: new Date() } });
      if (changed.count !== 1) throw new Error("RESERVATION_CONFLICT");
      const createdSale = await tx.posSale.create({
        data: {
          userId: session.user.id,
          credentialId: reservation.credentialId,
          reservationId: reservation.id,
          idempotencyKey: `reservation:${reservation.id}`,
          requestFingerprint: `reservation:${reservation.id}:${JSON.stringify(payment)}`,
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
      if (allocation.period) {
        await reconcileSaleImmediateDebtSettlement(tx, {
          saleId: createdSale.id,
          credentialId: reservation.credentialId,
          staffEmail: reservation.staffEmail,
          period: allocation.period,
          createdById: session.user.id,
          settlement: allocation.immediateDebtSettlement,
          createdAt: createdSale.createdAt,
        });
      }
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 }).catch((error: unknown) => {
      if (error instanceof Error && ["RESERVATION_CONFLICT", "ALLOCATION_CONFLICT"].includes(error.message)) return null;
      throw error;
    }));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "A valid expectedAllowanceAvailable preview is required for split pickup. Reload the preorder before confirming." }, { status: 400 });
    }
    if (error instanceof ReservationPaymentError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: 409 });
    }
    if (error instanceof PaymentAllocationError) {
      const message = error.code === "ALLOWANCE_CHANGED"
        ? "Allowance balance changed. Review the updated allowance and external payment amount, then confirm pickup again."
        : error.code === "ALLOWANCE_DEBT_CHANGED"
          ? "The resulting allowance debt changed. Ask staff to review their preorder."
          : "The stored payment choice cannot be fulfilled with the current allowance. Restore allowance or cancel this preorder and ask staff to check out again.";
      return NextResponse.json({ code: error.code, error: message, ...error.details }, { status: 409 });
    }
    if (error instanceof Error && error.message === "PREVIOUS_ALLOWANCE_DEBT_BLOCKED") {
      return NextResponse.json({ error: "Previous-period negative balance must be paid before another transaction can be completed." }, { status: 409 });
    }
    throw error;
  }
  if (!sale) return NextResponse.json({ error: "Reservation changed by another request" }, { status: 409 });

  return NextResponse.json({
    ...responseFor(sale),
    synchronization: {
      status: "queued",
      message: "Pickup completed using local POS data and queued for Accurate synchronization.",
    },
  }, { status: 202 });
}
