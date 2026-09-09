import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { reversePosSale } from "@/lib/accurate/pos";
import { authOptions } from "@/lib/auth";
import { getOrganizationIdForUser } from "@/lib/organization";
import { getPosContext, isAdmin, withSerializableRetry } from "@/lib/pos-server";
import { prisma } from "@/lib/prisma";

const voidSaleSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const reconcileVoidSchema = z.object({
  accurateReversalId: z.number().int().positive(),
});

async function getAuthorizedAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdmin(session.user.role)) return null;
  const organizationId = await getOrganizationIdForUser(session.user.id);
  return organizationId ? { userId: session.user.id, organizationId } : null;
}

async function finalizeLocalVoid(saleId: string, reversalId: number, userId: string) {
  return withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const sale = await tx.posSale.findFirst({
      where: { id: saleId, status: "voiding" },
      include: { items: true },
    });
    if (!sale) throw new Error("VOID_FINALIZATION_CONFLICT");
    if (sale.voidAccurateId && sale.voidAccurateId !== reversalId) throw new Error("VOID_REVERSAL_ID_CONFLICT");

    for (const item of sale.items) {
      const product = await tx.posProduct.findUnique({
        where: {
          credentialId_itemCode: {
            credentialId: sale.credentialId,
            itemCode: item.itemCode,
          },
        },
      });
      if (!product) throw new Error("VOID_PRODUCT_MISSING");

      const newStock = product.stock + item.quantity;
      await tx.posProduct.update({
        where: { id: product.id },
        data: { stock: newStock },
      });

      const allocation = await tx.posStockAllocation.findUnique({
        where: {
          credentialId_warehouseId_itemCode: {
            credentialId: sale.credentialId,
            warehouseId: sale.warehouseId,
            itemCode: item.itemCode,
          },
        },
      });
      if (allocation) {
        const changed = await tx.posStockAllocation.updateMany({
          where: { id: allocation.id, soldQuantity: { gte: item.quantity } },
          data: { soldQuantity: { decrement: item.quantity }, stockSnapshot: newStock },
        });
        if (changed.count !== 1) throw new Error("VOID_ALLOCATION_CONFLICT");
      }

      await tx.posStockChange.create({
        data: {
          credentialId: sale.credentialId,
          productId: product.id,
          saleId: sale.id,
          userId,
          itemCode: item.itemCode,
          itemName: item.itemName,
          previousStock: product.stock,
          newStock,
          quantityChange: item.quantity,
          source: "void",
          note: `Voided POS sale: ${sale.voidReason || "No reason recorded"}`,
        },
      });
    }

    return tx.posSale.update({
      where: { id: sale.id },
      data: {
        status: "voided",
        voidedAt: new Date(),
        voidAccurateId: reversalId,
        voidSyncError: null,
      },
      include: {
        items: true,
        voidedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

function finalizationError(error: unknown) {
  if (error instanceof Error && error.message === "VOID_PRODUCT_MISSING") {
    return NextResponse.json({
      error: "A product in this sale no longer exists in the POS catalog. Restore that catalog product before finalizing the void.",
    }, { status: 409 });
  }
  if (error instanceof Error && error.message === "VOID_REVERSAL_ID_CONFLICT") {
    return NextResponse.json({ error: "The supplied Accurate reversal ID does not match the reversal already recorded for this sale." }, { status: 409 });
  }
  if (error instanceof Error && error.message === "VOID_FINALIZATION_CONFLICT") {
    return NextResponse.json({ error: "This sale is no longer awaiting void reconciliation." }, { status: 409 });
  }
  if (error instanceof Error && error.message === "VOID_ALLOCATION_CONFLICT") {
    return NextResponse.json({ error: "Local sold-stock allocation is inconsistent. Reconcile the allocation before finalizing this void." }, { status: 409 });
  }
  return null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAuthorizedAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const parsed = voidSaleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A void reason of at least 3 characters is required" }, { status: 400 });

  const { id } = await params;
  const existing = await prisma.posSale.findFirst({
    where: { id, credential: { organizationId: admin.organizationId } },
    include: { items: true },
  });
  if (!existing) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  if (existing.status === "voided") return NextResponse.json({ sale: existing });
  if (existing.status === "voiding") {
    return NextResponse.json({
      error: "This sale requires reconciliation. Verify the inbound adjustment in Accurate, then use the recovery action with its Accurate ID.",
    }, { status: 409 });
  }
  if (existing.status !== "synced" || !existing.accurateId) {
    return NextResponse.json({ error: "Only sales with a confirmed Accurate adjustment can be voided safely" }, { status: 409 });
  }

  const context = await getPosContext(admin.userId, existing.credentialId);
  if (!context?.accurate) {
    return NextResponse.json({ error: "Accurate must be connected before this sale can be voided" }, { status: 409 });
  }

  let claimed: typeof existing | null;
  try {
    claimed = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
      for (const item of existing.items) {
        const product = await tx.posProduct.findUnique({
          where: {
            credentialId_itemCode: {
              credentialId: existing.credentialId,
              itemCode: item.itemCode,
            },
          },
          select: { id: true },
        });
        if (!product) throw new Error("VOID_PRODUCT_MISSING");
      }

      const changed = await tx.posSale.updateMany({
        where: { id: existing.id, status: "synced", accurateId: existing.accurateId },
        data: {
          status: "voiding",
          voidReason: parsed.data.reason,
          voidedById: admin.userId,
          voidSyncError: null,
        },
      });
      return changed.count === 1 ? existing : null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  } catch (error) {
    const response = finalizationError(error);
    if (response) return response;
    console.error(`[pos/sales/${id}/void] Failed to claim sale for voiding`, error);
    return NextResponse.json({ error: "Unable to prepare this sale for voiding" }, { status: 500 });
  }

  if (!claimed) {
    return NextResponse.json({ error: "This sale is already being voided or is no longer eligible" }, { status: 409 });
  }

  let reversal: { id: number; number: string };
  try {
    reversal = await reversePosSale(context.accurate, {
      id: claimed.id,
      accurateId: claimed.accurateId!,
      warehouseName: claimed.warehouseName,
      paymentMethod: claimed.paymentMethod,
      voidReason: parsed.data.reason,
      items: claimed.items.map((item) => ({ itemCode: item.itemCode, quantity: item.quantity })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to confirm the Accurate reversal";
    await prisma.posSale.updateMany({
      where: { id: claimed.id, status: "voiding" },
      data: { voidSyncError: message.slice(0, 2000) },
    });
    console.error(`[pos/sales/${id}/void] Accurate reversal could not be confirmed`, error);
    return NextResponse.json({
      error: "The Accurate result is uncertain. Check Accurate for the inbound adjustment, then finalize this void with the verified Accurate ID. Do not submit another automatic reversal.",
    }, { status: 502 });
  }

  try {
    const voided = await finalizeLocalVoid(claimed.id, reversal.id, admin.userId);
    return NextResponse.json({ sale: voided, reversalNumber: reversal.number });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to finalize the local void";
    await prisma.posSale.updateMany({
      where: { id: claimed.id, status: "voiding" },
      data: { voidAccurateId: reversal.id, voidSyncError: message.slice(0, 2000) },
    });
    const response = finalizationError(error);
    if (response) return response;
    console.error(`[pos/sales/${id}/void] Accurate was reversed but local finalization failed`, error);
    return NextResponse.json({
      error: "Accurate was reversed, but local finalization failed. Use the recovery action; the Accurate reversal ID has been preserved.",
    }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAuthorizedAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const parsed = reconcileVoidSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A verified positive Accurate reversal ID is required" }, { status: 400 });

  const { id } = await params;
  const sale = await prisma.posSale.findFirst({
    where: { id, status: "voiding", credential: { organizationId: admin.organizationId } },
    select: { id: true, voidAccurateId: true },
  });
  if (!sale) return NextResponse.json({ error: "Sale awaiting void reconciliation was not found" }, { status: 404 });
  if (sale.voidAccurateId && sale.voidAccurateId !== parsed.data.accurateReversalId) {
    return NextResponse.json({ error: "The supplied Accurate reversal ID does not match the ID already recorded for this sale" }, { status: 409 });
  }

  try {
    const voided = await finalizeLocalVoid(sale.id, parsed.data.accurateReversalId, admin.userId);
    return NextResponse.json({ sale: voided });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to finalize the local void";
    await prisma.posSale.updateMany({
      where: { id: sale.id, status: "voiding" },
      data: { voidAccurateId: parsed.data.accurateReversalId, voidSyncError: message.slice(0, 2000) },
    });
    const response = finalizationError(error);
    if (response) return response;
    console.error(`[pos/sales/${id}/void] Manual reconciliation failed`, error);
    return NextResponse.json({ error: "Unable to finalize the reconciled void" }, { status: 500 });
  }
}
