import crypto from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";

import { syncPosSale } from "@/lib/accurate/pos";
import { canOperatePos } from "@/lib/access-control";
import { authOptions } from "@/lib/auth";
import { calculateTotals, saleRequestSchema } from "@/lib/pos";
import { PaymentAllocationError, serializePayments } from "@/lib/pos-payments";
import {
  allocateSalePayment,
  canonicalizeRequestedItems,
  canonicalSaleItems,
  expireReservations,
  getPosContext,
  resolveLocalPosProducts,
  saleTotal,
  withSerializableRetry,
} from "@/lib/pos-server";
import { sendPosSaleReceipt } from "@/lib/pos-sale-receipt";
import { prisma } from "@/lib/prisma";

const saleInclude = {
  items: true,
  payments: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.PosSaleInclude;

function saleResponse(sale: Prisma.PosSaleGetPayload<{ include: typeof saleInclude }>, adjustmentNumber?: string) {
  return {
    sale: {
      ...sale,
      payments: serializePayments(sale.payments),
    },
    totals: calculateTotals(sale.items.map((item) => ({
      itemCode: item.itemCode,
      itemName: item.itemName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      unitCost: Number(item.unitCost),
    }))),
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

function allocationErrorResponse(error: PaymentAllocationError) {
  const message = error.code === "ALLOWANCE_CHANGED"
    ? "Allowance balance changed. Review the updated payment."
    : error.code === "ALLOWANCE_DEBT_CHANGED"
      ? "The resulting allowance debt changed. Review and confirm again."
      : error.code === "ALLOWANCE_UNAVAILABLE"
        ? "No positive allowance is available. Choose Cash, QRIS, or explicitly confirm allowance debt."
        : "Allowance can only be used for staff transactions.";
  return NextResponse.json({ code: error.code, error: message, ...error.details }, { status: 409 });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canOperatePos(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = saleRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid sale" }, { status: 400 });
  }
  const { credentialId, items: requestedItems, payment, idempotencyKey, buyerType, staffEmail, staffName } = parsed.data;
  const normalizedStaffEmail = staffEmail?.toLowerCase().trim();
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
  let canonicalStaffName = staffName;
  if (buyerType === "staff" && normalizedStaffEmail) {
    const registeredStaff = await prisma.user.findFirst({
      where: {
        email: normalizedStaffEmail,
        organizationId: context.credential.organizationId,
      },
      select: { name: true },
    });
    if (!registeredStaff) {
      return NextResponse.json({ error: "Staff email is not registered in this organization" }, { status: 409 });
    }
    canonicalStaffName = registeredStaff.name || staffName;
  }
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify({
    credentialId,
    payment,
    items,
    buyerType,
    staffEmail: normalizedStaffEmail,
  })).digest("hex");

  const existing = await prisma.posSale.findUnique({
    where: { userId_idempotencyKey: { userId: session.user.id, idempotencyKey } },
    include: saleInclude,
  });
  if (existing) {
    if (existing.requestFingerprint !== fingerprint) {
      return NextResponse.json({ error: "Idempotency key was already used for a different sale" }, { status: 409 });
    }
    if (existing.status === "synced") {
      after(() => sendPosSaleReceipt(existing.id));
      return NextResponse.json(saleResponse(existing));
    }
    return NextResponse.json({ ...saleResponse(existing), error: "This sale is already committed locally and is awaiting Accurate reconciliation." }, { status: 409 });
  }

  let created: { sale: Prisma.PosSaleGetPayload<{ include: typeof saleInclude }>; created: boolean } | null;
  try {
    created = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
      const allocation = await allocateSalePayment(tx, {
        credentialId,
        buyerType,
        staffEmail: normalizedStaffEmail,
        total: saleTotal(items),
        payment,
      });
      const sale = await tx.posSale.create({
        data: {
          userId: session.user.id,
          credentialId,
          idempotencyKey,
          requestFingerprint: fingerprint,
          warehouseId: context.settings!.warehouseId,
          warehouseName: context.settings!.warehouseName,
          paymentMethod: allocation.paymentMethod,
          paymentStrategy: allocation.strategy,
          buyerType,
          staffEmail: normalizedStaffEmail,
          staffName: canonicalStaffName,
          allowanceUsed: allocation.allowanceUsed,
          allowancePeriodStartsAt: allocation.period?.startsAt,
          allowancePeriodEndsAt: allocation.period?.endsAt,
          allowanceBalanceBefore: allocation.allowanceBalanceBefore,
          allowanceBalanceAfter: allocation.allowanceBalanceAfter,
          payments: { create: allocation.payments },
          items: { create: items },
        },
        include: saleInclude,
      });
      for (const item of items) {
        const product = await tx.posProduct.findUnique({ where: { credentialId_itemCode: { credentialId, itemCode: item.itemCode } } });
        if (!product?.isActive) throw new Error("INSUFFICIENT_STOCK");
        const stockAllocation = await tx.posStockAllocation.findUnique({ where: { credentialId_warehouseId_itemCode: { credentialId, warehouseId: context.settings!.warehouseId, itemCode: item.itemCode } } });
        const heldQuantity = stockAllocation?.heldQuantity ?? 0;
        const updated = await tx.posProduct.updateMany({
          where: { id: product.id, stock: { gte: heldQuantity + item.quantity } },
          data: { stock: { decrement: item.quantity }, syncStatus: "pending", syncError: null },
        });
        if (updated.count !== 1) throw new Error("INSUFFICIENT_STOCK");
        if (stockAllocation) {
          await tx.posStockAllocation.update({ where: { id: stockAllocation.id }, data: { stockSnapshot: product.stock - item.quantity, soldQuantity: { increment: item.quantity } } });
        }
        await tx.posStockChange.create({
          data: {
            credentialId,
            productId: product.id,
            saleId: sale.id,
            userId: session.user.id,
            itemCode: product.itemCode,
            itemName: product.itemName,
            previousStock: product.stock,
            newStock: product.stock - item.quantity,
            quantityChange: -item.quantity,
            source: "sale",
            note: `POS sale (${allocation.strategy}: ${serializePayments(allocation.payments).map((entry) => `${entry.method} ${entry.amount}`).join(" + ")})`,
          },
        });
      }
      return { sale, created: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(async (error: unknown) => {
      if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") return null;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await prisma.posSale.findUnique({
          where: { userId_idempotencyKey: { userId: session.user.id, idempotencyKey } },
          include: saleInclude,
        });
        if (duplicate?.requestFingerprint === fingerprint) return { sale: duplicate, created: false };
      }
      throw error;
    }));
  } catch (error) {
    if (error instanceof PaymentAllocationError) return allocationErrorResponse(error);
    if (error instanceof Error && error.message === "PREVIOUS_ALLOWANCE_DEBT_BLOCKED") {
      return NextResponse.json({ error: "Previous-period negative balance must be paid before another transaction can be completed." }, { status: 409 });
    }
    throw error;
  }

  if (!created) return NextResponse.json({ error: "Insufficient available stock" }, { status: 409 });
  if (!created.created) {
    if (created.sale.status === "synced") after(() => sendPosSaleReceipt(created.sale.id));
    return NextResponse.json({ ...saleResponse(created.sale), error: "This sale is already being processed or requires manual reconciliation." }, { status: 409 });
  }

  const sale = created.sale;
  const attemptAt = new Date();
  await prisma.posSale.update({ where: { id: sale.id }, data: { syncAttempts: { increment: 1 }, lastSyncAttemptAt: attemptAt, nextSyncAttemptAt: null } });
  if (!context.accurate) {
    const failed = await prisma.posSale.update({
      where: { id: sale.id },
      data: { status: "sync_error", syncError: "Accurate session is not ready", nextSyncAttemptAt: new Date(attemptAt.getTime() + 5 * 60 * 1000) },
      include: saleInclude,
    });
    return NextResponse.json({ ...saleResponse(failed), error: "Sale was saved locally but Accurate is not connected" }, { status: 502 });
  }
  try {
    const adjustment = await syncPosSale(context.accurate, sale);
    const completed = await prisma.posSale.update({
      where: { id: sale.id },
      data: { status: "synced", accurateId: adjustment.id, syncedAt: new Date(), syncError: null },
      include: saleInclude,
    });
    after(() => sendPosSaleReceipt(completed.id));
    return NextResponse.json(saleResponse(completed, adjustment.number), { status: 201 });
  } catch (error) {
    const syncError = error instanceof Error ? error.message : "Unknown Accurate synchronization error";
    const failed = await prisma.posSale.update({
      where: { id: sale.id },
      data: { status: "sync_error", syncError, nextSyncAttemptAt: new Date(attemptAt.getTime() + 5 * 60 * 1000) },
      include: saleInclude,
    });
    return NextResponse.json({ ...saleResponse(failed), error: "Sale was saved locally but Accurate inventory adjustment could not be confirmed" }, { status: 502 });
  }
}
