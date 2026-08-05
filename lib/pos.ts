import crypto from "node:crypto";
import { z } from "zod";

export const paymentMethodSchema = z.enum(["allowance", "cash", "qris"]);

export const buyerTypeSchema = z.enum(["staff", "guest"]);

export const posItemRequestSchema = z.object({
  itemCode: z.string().trim().min(1),
  quantity: z.number().int().positive(),
});

export const posItemSchema = posItemRequestSchema.extend({
  itemName: z.string().trim().min(1),
  unitPrice: z.number().finite().nonnegative(),
  unitCost: z.number().finite().nonnegative(),
});

export const saleRequestSchema = z
  .object({
    credentialId: z.string().uuid(),
    paymentMethod: paymentMethodSchema,
    idempotencyKey: z.string().trim().min(8).max(128),
    items: z.array(posItemRequestSchema).min(1),
    buyerType: buyerTypeSchema.default("guest"),
    staffEmail: z.string().trim().email().optional(),
    staffName: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.buyerType !== "staff" || !!data.staffEmail, {
    message: "staffEmail is required when buyerType is staff",
    path: ["staffEmail"],
  })
  .refine((data) => data.paymentMethod !== "allowance" || data.buyerType === "staff", {
    message: "Only staff can pay with allowance",
    path: ["paymentMethod"],
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

/**
 * Counts how many days in [year, month] (1-12) fall on one of `workingDays`
 * (0=Sunday .. 6=Saturday). Used to compute the monthly staff allowance total.
 */
export function countWorkingDaysInMonth(year: number, month: number, workingDays: readonly number[]) {
  const workingDaySet = new Set(workingDays);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    if (workingDaySet.has(new Date(year, month - 1, day).getDay())) count += 1;
  }
  return count;
}

export function calculateMonthlyAllowance(
  allowancePerWorkingDay: number,
  workingDays: readonly number[],
  now = new Date(),
) {
  const workingDayCount = countWorkingDaysInMonth(now.getFullYear(), now.getMonth() + 1, workingDays);
  return workingDayCount * allowancePerWorkingDay;
}

export function calculateRemainingAllowance(monthlyTotal: number, usedThisMonth: number) {
  return Math.max(0, monthlyTotal - usedThisMonth);
}
