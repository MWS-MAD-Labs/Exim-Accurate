import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PosProduct, Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, withSerializableRetry } from "@/lib/pos-server";
import { getOrganizationIdForUser } from "@/lib/organization";
import { z } from "zod";

const upsertSchema = z.object({
  credentialId: z.string().uuid(),
  itemCode: z.string().trim().min(1),
  itemName: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  stock: z.number().int().nonnegative(),
  buyPrice: z.number().finite().nonnegative(),
  sellPrice: z.number().finite().nonnegative(),
  isActive: z.boolean().default(true),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  itemName: z.string().trim().min(1).optional(),
  unit: z.string().trim().min(1).optional(),
  stock: z.number().int().nonnegative().optional(),
  buyPrice: z.number().finite().nonnegative().optional(),
  sellPrice: z.number().finite().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const credentialId = new URL(req.url).searchParams.get("credentialId");
  if (!credentialId) return NextResponse.json({ error: "Credential is required" }, { status: 400 });
  const organizationId = await getOrganizationIdForUser(session.user.id);
  if (!organizationId) return NextResponse.json({ error: "Organization not found" }, { status: 403 });
  const credential = await prisma.accurateCredentials.findFirst({ where: { id: credentialId, organizationId } });
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  const products = await prisma.posProduct.findMany({ where: { credentialId }, orderBy: { itemName: "asc" } });
  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  const { credentialId, itemCode, itemName, unit, stock, buyPrice, sellPrice, isActive } = parsed.data;
  const organizationId = await getOrganizationIdForUser(session.user.id);
  if (!organizationId) return NextResponse.json({ error: "Organization not found" }, { status: 403 });
  const credential = await prisma.accurateCredentials.findFirst({ where: { id: credentialId, organizationId } });
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  const product = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const existing = await tx.posProduct.findUnique({
      where: { credentialId_itemCode: { credentialId, itemCode } },
    });
    const saved = await tx.posProduct.upsert({
      where: { credentialId_itemCode: { credentialId, itemCode } },
      update: { itemName, unit, stock, buyPrice, sellPrice, isActive, syncStatus: "pending", syncError: null },
      create: { credentialId, itemCode, itemName, unit, stock, buyPrice, sellPrice, isActive },
    });
    const previousStock = existing?.stock ?? 0;
    if (!existing || previousStock !== stock) {
      await tx.posStockChange.create({
        data: {
          credentialId,
          productId: saved.id,
          userId: session.user.id,
          itemCode,
          itemName,
          previousStock,
          newStock: stock,
          quantityChange: stock - previousStock,
          source: "manual",
          note: existing ? "Stock updated from stock management" : "Initial stock when product was added",
        },
      });
    }
    return saved;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  return NextResponse.json(product, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const { id, ...updates } = parsed.data;
  const organizationId = await getOrganizationIdForUser(session.user.id);
  if (!organizationId) return NextResponse.json({ error: "Organization not found" }, { status: 403 });
  const result = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const current = await tx.posProduct.findFirst({
      where: { id, credential: { organizationId } },
    });
    if (!current) return { status: "not_found" as const };

    if (updates.stock !== undefined) {
      const settings = await tx.posSettings.findUnique({ where: { credentialId: current.credentialId } });
      if (settings) {
        const allocation = await tx.posStockAllocation.findUnique({
          where: { credentialId_warehouseId_itemCode: { credentialId: current.credentialId, warehouseId: settings.warehouseId, itemCode: current.itemCode } },
        });
        if (updates.stock < (allocation?.heldQuantity ?? 0)) {
          return { status: "held_stock_conflict" as const };
        }
      }
    }

    let saved: PosProduct;
    if (updates.stock !== undefined) {
      const changed = await tx.posProduct.updateMany({
        where: { id, stock: current.stock },
        data: { ...updates, syncStatus: "pending", syncError: null },
      });
      if (changed.count !== 1) return { status: "stock_changed" as const };
      saved = await tx.posProduct.findUniqueOrThrow({ where: { id } });
    } else {
      saved = await tx.posProduct.update({ where: { id }, data: { ...updates, syncStatus: "pending", syncError: null } });
    }
    if (updates.stock !== undefined && updates.stock !== current.stock) {
      await tx.posStockChange.create({
        data: {
          credentialId: current.credentialId,
          productId: current.id,
          userId: session.user.id,
          itemCode: current.itemCode,
          itemName: saved.itemName,
          previousStock: current.stock,
          newStock: updates.stock,
          quantityChange: updates.stock - current.stock,
          source: "manual",
          note: "Stock updated from stock management",
        },
      });
    }
    return { status: "updated" as const, product: saved };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

  if (result.status === "not_found") return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (result.status === "held_stock_conflict") {
    return NextResponse.json({ error: "Stock cannot be lower than the quantity held by active reservations" }, { status: 409 });
  }
  if (result.status === "stock_changed") {
    return NextResponse.json({ error: "Stock changed while this update was being saved. Reload the product and try again." }, { status: 409 });
  }
  return NextResponse.json(result.product);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Product id is required" }, { status: 400 });
  const organizationId = await getOrganizationIdForUser(session.user.id);
  if (!organizationId) return NextResponse.json({ error: "Organization not found" }, { status: 403 });
  const product = await prisma.posProduct.findFirst({
    where: { id, credential: { organizationId } },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  const activeHold = await prisma.posStockAllocation.findFirst({ where: { credentialId: product.credentialId, itemCode: product.itemCode, heldQuantity: { gt: 0 } } });
  if (activeHold) return NextResponse.json({ error: "Product has active reservation holds and cannot be removed" }, { status: 409 });
  await prisma.posProduct.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
