import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/pos-server";
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
  const product = await prisma.posProduct.upsert({
    where: { credentialId_itemCode: { credentialId, itemCode } },
    update: { itemName, unit, stock, buyPrice, sellPrice, isActive, syncStatus: "pending", syncError: null },
    create: { credentialId, itemCode, itemName, unit, stock, buyPrice, sellPrice, isActive },
  });
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
  const product = await prisma.posProduct.findFirst({
    where: { id, credential: { organizationId } },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (updates.stock !== undefined) {
    const settings = await prisma.posSettings.findUnique({ where: { credentialId: product.credentialId } });
    if (settings) {
      const allocation = await prisma.posStockAllocation.findUnique({
        where: { credentialId_warehouseId_itemCode: { credentialId: product.credentialId, warehouseId: settings.warehouseId, itemCode: product.itemCode } },
      });
      if (updates.stock < (allocation?.heldQuantity ?? 0)) {
        return NextResponse.json({ error: "Stock cannot be lower than the quantity held by active reservations" }, { status: 409 });
      }
    }
  }
  const updated = await prisma.posProduct.update({ where: { id }, data: { ...updates, syncStatus: "pending", syncError: null } });
  return NextResponse.json(updated);
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
