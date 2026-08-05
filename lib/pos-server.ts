import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { PosAccurateCredentials, PosProduct } from "@/lib/accurate/pos";
import { calculateMonthlyAllowance, calculateRemainingAllowance } from "@/lib/pos";

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

export async function getStaffAllowance(credentialId: string, staffEmail: string, now = new Date()) {
  const settings = await prisma.posSettings.findUnique({ where: { credentialId } });
  const allowancePerWorkingDay = Number(settings?.allowancePerWorkingDay ?? 0);
  const workingDays = settings?.workingDays ?? [1, 2, 3, 4, 5];
  const total = calculateMonthlyAllowance(allowancePerWorkingDay, workingDays, now);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const usedSales = await prisma.posSale.findMany({
    where: {
      credentialId,
      staffEmail: staffEmail.toLowerCase().trim(),
      paymentMethod: "allowance",
      status: { not: "sync_error" },
      createdAt: { gte: monthStart, lt: monthEnd },
    },
    select: { allowanceUsed: true },
  });
  const used = usedSales.reduce((sum, sale) => sum + Number(sale.allowanceUsed), 0);

  return { total, used, remaining: calculateRemainingAllowance(total, used) };
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

// POS sells and prices only items configured (and left active) in Stock Management (PosProduct).
// Accurate remains the source of truth for stock, but sell/buy price used for POS transactions
// and analytics comes from the local catalog, so cashiers/admins control pricing without
// touching Accurate's item master.
export async function applyPosCatalog(credentialId: string, products: PosProduct[]) {
  const catalog = await prisma.posProduct.findMany({
    where: { credentialId, itemCode: { in: products.map((product) => product.itemCode) }, isActive: true },
  });
  const catalogByCode = new Map(catalog.map((entry) => [entry.itemCode, entry]));
  return products.flatMap((product) => {
    const entry = catalogByCode.get(product.itemCode);
    if (!entry) return [];
    return [{ ...product, itemName: entry.itemName, unitPrice: Number(entry.sellPrice), unitCost: Number(entry.buyPrice) }];
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
