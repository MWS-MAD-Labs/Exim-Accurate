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

export function toDateOnlyValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toggleHolidayDate(holidayDates: readonly string[], date: string) {
  const values = new Set(holidayDates);
  if (values.has(date)) values.delete(date);
  else values.add(date);
  return [...values].sort();
}

/**
 * Counts how many days in [year, month] (1-12) fall on one of `workingDays`,
 * excluding date-specific holidays represented as YYYY-MM-DD values.
 */
export function countWorkingDaysInMonth(
  year: number,
  month: number,
  workingDays: readonly number[],
  holidayDates: readonly string[] = [],
) {
  const workingDaySet = new Set(workingDays);
  const holidayDateSet = new Set(holidayDates);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);
    if (workingDaySet.has(date.getDay()) && !holidayDateSet.has(toDateOnlyValue(date))) count += 1;
  }
  return count;
}

export interface AllowancePeriod {
  startsAt: Date;
  endsAt: Date;
}

export function startOfDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getRecurringAllowancePeriod(cutoffDay: number, now = new Date()): AllowancePeriod {
  const currentDate = startOfDate(now);
  const endsThisMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), cutoffDay);
  const endsAt = currentDate <= endsThisMonth
    ? endsThisMonth
    : new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, cutoffDay);
  const startsAt = new Date(endsAt.getFullYear(), endsAt.getMonth() - 1, cutoffDay + 1);
  return { startsAt, endsAt };
}

export function countWorkingDaysInPeriod(
  startsAt: Date,
  endsAt: Date,
  workingDays: readonly number[],
  holidayDates: readonly string[] = [],
) {
  const workingDaySet = new Set(workingDays);
  const holidayDateSet = new Set(holidayDates);
  let count = 0;
  for (let cursor = startOfDate(startsAt); cursor <= endsAt; cursor.setDate(cursor.getDate() + 1)) {
    if (workingDaySet.has(cursor.getDay()) && !holidayDateSet.has(toDateOnlyValue(cursor))) count += 1;
  }
  return count;
}

export function calculateAllowanceForPeriod(
  allowancePerWorkingDay: number,
  workingDays: readonly number[],
  period: AllowancePeriod,
  holidayDates: readonly string[] = [],
) {
  return countWorkingDaysInPeriod(period.startsAt, period.endsAt, workingDays, holidayDates) * allowancePerWorkingDay;
}

export function calculateMonthlyAllowance(
  allowancePerWorkingDay: number,
  workingDays: readonly number[],
  now = new Date(),
  holidayDates: readonly string[] = [],
) {
  const workingDayCount = countWorkingDaysInMonth(now.getFullYear(), now.getMonth() + 1, workingDays, holidayDates);
  return workingDayCount * allowancePerWorkingDay;
}

export function calculateRemainingAllowance(monthlyTotal: number, usedThisMonth: number) {
  return Math.max(0, monthlyTotal - usedThisMonth);
}
