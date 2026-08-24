import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { reservationRequestSchema, makeReservationReference } from "@/lib/pos";
import { canonicalizeRequestedItems, canonicalSaleItems, expireReservations, getDefaultPosStore, getOutstandingPreviousAllowanceDebt, getPosContext, resolveLocalPosProducts, withSerializableRetry } from "@/lib/pos-server";
import crypto from "node:crypto";
import { isRoleAllowed } from "@/lib/access-control";
import { getOrganizationIdForUser } from "@/lib/organization";
import { getOperationalPosCredential } from "@/lib/credential-access";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isRoleAllowed(session.user.role, ["admin", "cashier", "staff"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const mine = params.get("mine") !== "false";
  const organizationId = await getOrganizationIdForUser(session.user.id);
  if (!organizationId) return NextResponse.json({ error: "Organization not found" }, { status: 403 });
  const canReadAny = !mine && isRoleAllowed(session.user.role, ["admin", "cashier"]);
  const activeCredentials = canReadAny
    ? await prisma.accurateCredentials.findMany({
        where: {
          organizationId,
          disconnectedAt: null,
          posSettings: { is: { isActive: true } },
        },
        select: { id: true },
      })
    : [];
  const reservations = await prisma.posReservation.findMany({
    where: canReadAny
      ? { credentialId: { in: activeCredentials.map((credential) => credential.id) } }
      : { userId: session.user.id },
    include: { items: true, sale: true },
    orderBy: { createdAt: "desc" },
  });
  const credentialIds = [...new Set(reservations.map((reservation) => reservation.credentialId))];
  for (const credentialId of credentialIds) await expireReservations(credentialId);
  const refreshed = await prisma.posReservation.findMany({ where: { id: { in: reservations.map((reservation) => reservation.id) } }, include: { items: true, sale: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(refreshed);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isRoleAllowed(session.user.role, ["admin", "staff"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = reservationRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid reservation" }, { status: 400 });
  const { credentialId: requestedCredentialId, idempotencyKey, preferredPaymentMethod, items: requestedItems } = parsed.data;
  const defaultStore = requestedCredentialId ? null : await getDefaultPosStore(session.user.id);
  const credentialId = requestedCredentialId ?? defaultStore?.credentialId;
  if (!credentialId) return NextResponse.json({ error: "POS store is not configured" }, { status: 409 });
  const context = await getPosContext(session.user.id, credentialId);
  if (!context) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  if (!context.settings) return NextResponse.json({ error: "POS is not configured" }, { status: 409 });
  const holdHours = Number.isInteger(context.settings.preorderHoldHours) && context.settings.preorderHoldHours > 0
    ? Math.min(context.settings.preorderHoldHours, 168)
    : 4;
  const expiresAt = new Date(Date.now() + holdHours * 60 * 60 * 1000);
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
  const previousDebt = await getOutstandingPreviousAllowanceDebt(credentialId, session.user.email);
  if (previousDebt.blocked) {
    return NextResponse.json({ error: "Previous-period negative balance must be paid before another transaction can be completed.", previousDebt }, { status: 409 });
  }
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ credentialId, expiresAt: expiresAt.toISOString(), preferredPaymentMethod, items })).digest("hex");
  const existing = await prisma.posReservation.findUnique({ where: { userId_idempotencyKey: { userId: session.user.id, idempotencyKey } }, include: { items: true } });
  if (existing) {
    if (existing.requestFingerprint !== fingerprint) return NextResponse.json({ error: "Idempotency key was already used for a different reservation" }, { status: 409 });
    return NextResponse.json(existing);
  }
  const reservation = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    for (const item of items) {
      const product = await tx.posProduct.findUnique({ where: { credentialId_itemCode: { credentialId, itemCode: item.itemCode } } });
      if (!product?.isActive) throw new Error("INSUFFICIENT_STOCK");
      const allocation = await tx.posStockAllocation.upsert({ where: { credentialId_warehouseId_itemCode: { credentialId, warehouseId: context.settings!.warehouseId, itemCode: item.itemCode } }, update: { stockSnapshot: product.stock }, create: { userId: session.user.id, credentialId, warehouseId: context.settings!.warehouseId, warehouseName: context.settings!.warehouseName, itemCode: item.itemCode, stockSnapshot: product.stock } });
      const updated = await tx.posStockAllocation.updateMany({ where: { id: allocation.id, heldQuantity: { lte: product.stock - item.quantity } }, data: { heldQuantity: { increment: item.quantity }, stockSnapshot: product.stock } });
      if (updated.count !== 1) throw new Error("INSUFFICIENT_STOCK");
    }
    return tx.posReservation.create({ data: { userId: session.user.id, credentialId, reference: makeReservationReference(), idempotencyKey, requestFingerprint: fingerprint, warehouseId: context.settings!.warehouseId, warehouseName: context.settings!.warehouseName, staffEmail: session.user.email, staffName: session.user.name, preferredPaymentMethod, expiresAt, items: { create: items } }, include: { items: true } });
  }).catch(async (error: unknown) => {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") return null;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.posReservation.findUnique({ where: { userId_idempotencyKey: { userId: session.user.id, idempotencyKey } }, include: { items: true } });
      if (existing?.requestFingerprint === fingerprint) return existing;
    }
    throw error;
  }));
  if (!reservation) return NextResponse.json({ error: "Insufficient available stock" }, { status: 409 });
  return NextResponse.json(reservation, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isRoleAllowed(session.user.role, ["admin", "cashier", "staff"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null) as { id?: string; action?: string } | null;
  if (!body?.id || body.action !== "cancel") return NextResponse.json({ error: "Invalid lifecycle action" }, { status: 400 });
  const canManageAny = isRoleAllowed(session.user.role, ["admin", "cashier"]);
  const reservation = await prisma.posReservation.findUnique({
    where: { id: body.id },
    include: { items: true },
  });
  if (!reservation) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  if (canManageAny) {
    const credential = await getOperationalPosCredential(session.user.id, session.user.role, reservation.credentialId);
    if (!credential) return NextResponse.json({ error: "Reservation is not available to this POS operator" }, { status: 403 });
  } else if (reservation.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (reservation.status !== "active") return NextResponse.json(reservation);
  const updated = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const changed = await tx.posReservation.updateMany({ where: { id: reservation.id, status: "active", expiresAt: { gt: new Date() } }, data: { status: "cancelled", cancelledAt: new Date() } });
    if (changed.count !== 1) {
      if (reservation.expiresAt <= new Date() && reservation.status === "active") {
        await tx.posReservation.updateMany({ where: { id: reservation.id, status: "active" }, data: { status: "expired" } });
        for (const item of reservation.items) {
          await tx.posStockAllocation.updateMany({ where: { credentialId: reservation.credentialId, warehouseId: reservation.warehouseId, itemCode: item.itemCode, heldQuantity: { gte: item.quantity } }, data: { heldQuantity: { decrement: item.quantity } } });
        }
      }
      return tx.posReservation.findUnique({ where: { id: reservation.id } });
    }
    for (const item of reservation.items) await tx.posStockAllocation.updateMany({ where: { credentialId: reservation.credentialId, warehouseId: reservation.warehouseId, itemCode: item.itemCode, heldQuantity: { gte: item.quantity } }, data: { heldQuantity: { decrement: item.quantity } } });
    return tx.posReservation.findUnique({ where: { id: reservation.id } });
  }));
  return NextResponse.json(updated);
}
