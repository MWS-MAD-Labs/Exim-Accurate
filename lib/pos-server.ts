import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { PosAccurateCredentials, PosProduct } from "@/lib/accurate/pos";
import { calculateAllowanceForPeriod, calculateRemainingAllowance, getRecurringAllowancePeriod, startOfDate, type AllowancePeriod } from "@/lib/pos";

async function getOwnedCredential(userId: string, credentialId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  if (!user) return null;

  return prisma.accurateCredentials.findFirst({
    where: { id: credentialId, organizationId: user.organizationId, disconnectedAt: null },
  });
}

export async function getPosContext(userId: string, credentialId: string) {
  const credential = await getOwnedCredential(userId, credentialId);
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

export async function getDefaultPosStore(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  if (!user) return null;

  return prisma.posSettings.findFirst({
    where: {
      organizationId: user.organizationId,
      isActive: true,
      credential: { organizationId: user.organizationId, disconnectedAt: null },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getStaffAllowance(credentialId: string, staffEmail: string, now = new Date()) {
  const settings = await prisma.posSettings.findUnique({ where: { credentialId } });
  const allowancePerWorkingDay = Number(settings?.allowancePerWorkingDay ?? 0);
  const workingDays = settings?.workingDays ?? [1, 2, 3, 4, 5];
  const holidayDates = settings?.holidayDates ?? [];
  const today = startOfDate(now);
  const override = await prisma.posAllowancePeriodOverride.findFirst({
    where: { credentialId, startsAt: { lte: today }, endsAt: { gte: today } },
    orderBy: { startsAt: "desc" },
  });
  const period: AllowancePeriod = override
    ? { startsAt: startOfDate(override.startsAt), endsAt: startOfDate(override.endsAt) }
    : getRecurringAllowancePeriod(settings?.allowanceCutoffDay ?? 22, now);
  const total = calculateAllowanceForPeriod(allowancePerWorkingDay, workingDays, period, holidayDates);
  const periodEndExclusive = new Date(period.endsAt);
  periodEndExclusive.setDate(periodEndExclusive.getDate() + 1);
  const usedSales = await prisma.posSale.findMany({
    where: {
      credentialId,
      staffEmail: staffEmail.toLowerCase().trim(),
      paymentMethod: "allowance",
      status: { not: "sync_error" },
      createdAt: { gte: period.startsAt, lt: periodEndExclusive },
    },
    select: { allowanceUsed: true },
  });
  const used = usedSales.reduce((sum, sale) => sum + Number(sale.allowanceUsed), 0);

  return {
    total,
    used,
    remaining: calculateRemainingAllowance(total, used),
    period: { startsAt: period.startsAt.toISOString(), endsAt: period.endsAt.toISOString(), isCustom: !!override },
  };
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

export async function resolveLocalPosProducts(
  credentialId: string,
  warehouse: { id: number; name: string },
  requestedCodes?: readonly string[],
  query = "",
): Promise<PosProduct[]> {
  const codes = requestedCodes ? [...new Set(requestedCodes)] : undefined;
  const catalog = await prisma.posProduct.findMany({
    where: {
      credentialId,
      isActive: true,
      ...(codes ? { itemCode: { in: codes } } : {}),
      ...(query.trim()
        ? { OR: [{ itemCode: { contains: query.trim(), mode: "insensitive" } }, { itemName: { contains: query.trim(), mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { itemName: "asc" },
  });
  const allocations = await prisma.posStockAllocation.findMany({
    where: { credentialId, warehouseId: warehouse.id, itemCode: { in: catalog.map((entry) => entry.itemCode) } },
    select: { itemCode: true, heldQuantity: true },
  });
  const heldByCode = new Map(allocations.map((allocation) => [allocation.itemCode, allocation.heldQuantity]));
  return catalog.map((entry) => ({
    id: entry.accurateItemId ?? 0,
    itemCode: entry.itemCode,
    itemName: entry.itemName,
    stock: Math.max(0, entry.stock - (heldByCode.get(entry.itemCode) ?? 0)),
    unitPrice: Number(entry.sellPrice),
    unitCost: Number(entry.buyPrice),
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
  }));
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
