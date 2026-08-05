import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedCredential } from "@/lib/pos-server";
import { z } from "zod";

const upsertSchema = z.object({
  credentialId: z.string().uuid(),
  itemCode: z.string().trim().min(1),
  itemName: z.string().trim().min(1),
  unit: z.string().trim().min(1).optional(),
  buyPrice: z.number().finite().nonnegative(),
  sellPrice: z.number().finite().nonnegative(),
  isActive: z.boolean().default(true),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  buyPrice: z.number().finite().nonnegative().optional(),
  sellPrice: z.number().finite().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const credentialId = new URL(req.url).searchParams.get("credentialId");
  if (!credentialId) return NextResponse.json({ error: "Credential is required" }, { status: 400 });
  const credential = await getOwnedCredential(session.user.id, credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  const products = await prisma.posProduct.findMany({ where: { credentialId }, orderBy: { itemName: "asc" } });
  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  const { credentialId, itemCode, itemName, unit, buyPrice, sellPrice, isActive } = parsed.data;
  const credential = await getOwnedCredential(session.user.id, credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  const product = await prisma.posProduct.upsert({
    where: { credentialId_itemCode: { credentialId, itemCode } },
    update: { itemName, unit, buyPrice, sellPrice, isActive },
    create: { credentialId, itemCode, itemName, unit, buyPrice, sellPrice, isActive },
  });
  return NextResponse.json(product, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const { id, ...updates } = parsed.data;
  const product = await prisma.posProduct.findFirst({ where: { id, credential: { userId: session.user.id } } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  const updated = await prisma.posProduct.update({ where: { id }, data: updates });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Product id is required" }, { status: 400 });
  const product = await prisma.posProduct.findFirst({ where: { id, credential: { userId: session.user.id } } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  await prisma.posProduct.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
