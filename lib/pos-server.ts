import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { PosAccurateCredentials, PosProduct } from "@/lib/accurate/pos";

export async function getOwnedCredential(userId: string, credentialId: string) {
  return prisma.accurateCredentials.findFirst({ where: { id: credentialId, userId } });
}

export async function getPosContext(userId: string, credentialId: string, allowAdmin = false) {
  const credential = allowAdmin
    ? await prisma.accurateCredentials.findFirst({ where: { id: credentialId } })
    : await getOwnedCredential(userId, credentialId);
  if (!credential) return null;
  const settings = await prisma.posSettings.findUnique({ where: { credentialId } });
  if (!settings) return { credential, settings: null };
  if (!credential.host || !credential.session) return { credential, settings, accurate: null };
  return {
    credential,
    settings,
    accurate: {
      apiToken: credential.apiToken,
      signatureSecret: credential.signatureSecret,
      host: credential.host,
      session: credential.session,
    } satisfies PosAccurateCredentials,
  };
}

export function isAdmin(role?: string | null) {
  return role === "admin";
}

export function canonicalizeRequestedItems(items: Array<{ itemCode: string; quantity: number }>) {
  const quantities = new Map<string, number>();
  for (const item of items) quantities.set(item.itemCode, (quantities.get(item.itemCode) || 0) + item.quantity);
  return [...quantities.entries()].map(([itemCode, quantity]) => ({ itemCode, quantity }));
}

export function canonicalSaleItems(
  requested: Array<{ itemCode: string; quantity: number }>,
  products: PosProduct[],
) {
  const productByCode = new Map(products.map((product) => [product.itemCode, product]));
  return canonicalizeRequestedItems(requested).map((item) => {
    const product = productByCode.get(item.itemCode);
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    return { ...item, itemName: product.itemName, unitPrice: product.unitPrice, unitCost: product.unitCost };
  });
}

export async function expireReservations(credentialId: string) {
  await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const settings = await tx.posSettings.findUnique({ where: { credentialId } });
    if (!settings) return;
    const expired = await tx.posReservation.findMany({ where: { credentialId, status: "active", expiresAt: { lte: new Date() } }, include: { items: true } });
    for (const reservation of expired) {
      const changed = await tx.posReservation.updateMany({ where: { id: reservation.id, status: "active" }, data: { status: "expired" } });
      if (changed.count !== 1) continue;
      for (const item of reservation.items) {
        await tx.posStockAllocation.updateMany({ where: { credentialId, warehouseId: reservation.warehouseId, itemCode: item.itemCode, heldQuantity: { gte: item.quantity } }, data: { heldQuantity: { decrement: item.quantity } } });
      }
    }
  }));
}

export async function withSerializableRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await operation(); } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new Error("Transaction retry exhausted");
}
