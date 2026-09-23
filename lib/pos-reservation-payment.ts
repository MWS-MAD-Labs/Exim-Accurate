import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { PaymentAllocationResult, PaymentIntent } from "./pos-payments";

const amountSchema = z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/);
export const reservationCheckoutPaymentSchema = z.discriminatedUnion("strategy", [
  z.object({ strategy: z.literal("external_only"), method: z.enum(["cash", "qris"]) }),
  z.object({ strategy: z.literal("allowance_then_external"), remainderMethod: z.enum(["cash", "qris"]), expectedAllowanceAmount: amountSchema.optional() }),
  z.object({ strategy: z.literal("allowance_debt"), debtConfirmed: z.literal(true), expectedResultingDebt: amountSchema }),
]);

type CheckoutExpectation = {
  strategy: string;
  expectedAllowanceAmount?: string;
  expectedResultingDebt?: string;
};

export function approvedReservationDebt(payment: CheckoutExpectation, allocation: PaymentAllocationResult): Prisma.Decimal | null {
  if (payment.strategy === "allowance_then_external" && payment.expectedAllowanceAmount !== undefined) {
    const applied = allocation.payments.find((entry) => entry.method === "allowance")?.amount ?? new Prisma.Decimal(0);
    if (!applied.equals(payment.expectedAllowanceAmount)) {
      throw new ReservationPaymentError("RESERVATION_PAYMENT_CHANGED", { expectedAllowanceAmount: applied.toFixed(2) });
    }
  }
  if (payment.strategy !== "allowance_debt") return null;
  if (payment.expectedResultingDebt === undefined) throw new ReservationPaymentError("RESERVATION_DEBT_AUTHORIZATION_REQUIRED");
  const debt = Prisma.Decimal.max(0, allocation.allowanceBalanceAfter!.negated());
  if (!debt.equals(payment.expectedResultingDebt)) {
    throw new ReservationPaymentError("RESERVATION_PAYMENT_CHANGED", { expectedResultingDebt: debt.toFixed(2) });
  }
  return debt;
}

export class ReservationPaymentError extends Error {
  constructor(
    public readonly code: "RESERVATION_PAYMENT_INVALID" | "RESERVATION_DEBT_AUTHORIZATION_REQUIRED" | "RESERVATION_PAYMENT_CHANGED" | "RESERVATION_DEBT_LIMIT_EXCEEDED",
    public readonly details: Record<string, string> = {},
  ) {
    super(code === "RESERVATION_PAYMENT_INVALID"
      ? "The stored preorder payment choice is incomplete. Cancel this preorder and ask staff to check out again."
      : code === "RESERVATION_PAYMENT_CHANGED"
        ? "Allowance changed. Review the updated payment amount and confirm checkout again."
        : code === "RESERVATION_DEBT_LIMIT_EXCEEDED"
          ? "Pickup would exceed the staff-approved resulting debt. Restore allowance or cancel this preorder and ask staff to check out again."
          : "This preorder has no staff-approved debt amount. Cancel it and ask staff to check out again.");
  }
}

export function reservationPaymentIntent(reservation: {
  paymentStrategy: string;
  externalPaymentMethod: string | null;
}): PaymentIntent {
  const method = reservation.externalPaymentMethod;
  switch (reservation.paymentStrategy) {
    case "external_only":
      if (method === "cash" || method === "qris") return { strategy: "external_only", method };
      break;
    case "allowance_then_external":
      if (method === "cash" || method === "qris") return { strategy: "allowance_then_external", remainderMethod: method };
      break;
    case "allowance_debt":
      if (method === null) return { strategy: "allowance_debt", debtConfirmed: true };
      break;
  }
  throw new ReservationPaymentError("RESERVATION_PAYMENT_INVALID");
}

export function reservationPickupPaymentIntent(
  reservation: Parameters<typeof reservationPaymentIntent>[0],
  confirmation: unknown,
): PaymentIntent {
  const intent = reservationPaymentIntent(reservation);
  if (intent.strategy !== "allowance_then_external") return intent;
  // Only a preview precondition is accepted; strategy and method stay server-owned.
  const preview = z.object({ expectedAllowanceAvailable: amountSchema }).parse(confirmation);
  return { ...intent, expectedAllowanceAvailable: preview.expectedAllowanceAvailable };
}

export function assertReservationDebtAuthorized(allocation: PaymentAllocationResult, approvedResultingDebt?: Prisma.Decimal.Value | null): void {
  // Split remainders are immediately settled by the existing allocator.
  if (allocation.strategy !== "allowance_debt") return;
  if (approvedResultingDebt == null || !allocation.allowanceBalanceAfter) {
    throw new ReservationPaymentError("RESERVATION_DEBT_AUTHORIZATION_REQUIRED");
  }
  const approved = new Prisma.Decimal(approvedResultingDebt);
  const resulting = Prisma.Decimal.max(0, allocation.allowanceBalanceAfter.negated());
  if (!approved.isFinite() || approved.lessThan(0) || resulting.greaterThan(approved)) {
    throw new ReservationPaymentError("RESERVATION_DEBT_LIMIT_EXCEEDED");
  }
}
