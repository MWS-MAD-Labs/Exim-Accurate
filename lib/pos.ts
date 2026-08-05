import crypto from "node:crypto";
import { z } from "zod";

export const paymentMethodSchema = z.enum(["cash", "debit", "qris", "transfer"]);

export const posItemRequestSchema = z.object({
  itemCode: z.string().trim().min(1),
  quantity: z.number().int().positive(),
});

export const posItemSchema = posItemRequestSchema.extend({
  itemName: z.string().trim().min(1),
  unitPrice: z.number().finite().nonnegative(),
  unitCost: z.number().finite().nonnegative(),
});

export const saleRequestSchema = z.object({
  credentialId: z.string().uuid(),
  paymentMethod: paymentMethodSchema,
  idempotencyKey: z.string().trim().min(8).max(128),
  items: z.array(posItemRequestSchema).min(1),
});

export const reservationRequestSchema = z.object({
  credentialId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(128),
  expiresAt: z.coerce.date(),
  items: z.array(posItemRequestSchema).min(1),
});

export type PosItem = z.infer<typeof posItemSchema>;

export function calculateTotals(items: readonly PosItem[]) {
  return items.reduce(
    (totals, item) => {
      totals.revenue += item.quantity * item.unitPrice;
      totals.cost += item.quantity * item.unitCost;
      return totals;
    },
    { revenue: 0, cost: 0 },
  );
}

export function calculateProfit(items: readonly PosItem[]) {
  const { revenue, cost } = calculateTotals(items);
  return { revenue, cost, profit: revenue - cost, margin: revenue === 0 ? 0 : (revenue - cost) / revenue };
}

export function availableQuantity(stock: number, held: number, requested: number) {
  if (!Number.isInteger(stock) || !Number.isInteger(held) || !Number.isInteger(requested)) {
    throw new Error("Quantity must be an integer");
  }
  if (stock < 0 || held < 0 || requested <= 0) throw new Error("Invalid quantity");
  return Math.max(0, stock - held - requested);
}

export function isReservationActive(status: string, expiresAt: Date, now = new Date()) {
  return status === "active" && expiresAt.getTime() > now.getTime();
}

export function reservationStatusAt(status: string, expiresAt: Date, now = new Date()) {
  return isReservationActive(status, expiresAt, now) ? status : status === "active" ? "expired" : status;
}

export function makeReservationReference(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `RES-${date}-${suffix}`;
}
