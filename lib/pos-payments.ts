import { Prisma } from "@prisma/client";
import { z } from "zod";

export const externalPaymentMethodSchema = z.enum(["cash", "qris"]);
export const legacyPaymentMethodSchema = z.enum(["allowance", "cash", "qris"]);
export const paymentStrategySchema = z.enum([
  "external_only",
  "allowance_then_external",
  "allowance_debt",
]);

const decimalExpectationSchema = z.string().trim().regex(/^-?\d+(?:\.\d{1,2})?$/);

export const paymentIntentSchema = z.discriminatedUnion("strategy", [
  z.object({
    strategy: z.literal("external_only"),
    method: externalPaymentMethodSchema,
  }),
  z.object({
    strategy: z.literal("allowance_then_external"),
    remainderMethod: externalPaymentMethodSchema,
    expectedAllowanceAvailable: decimalExpectationSchema.optional(),
  }),
  z.object({
    strategy: z.literal("allowance_debt"),
    expectedAllowanceBalance: decimalExpectationSchema.optional(),
    debtConfirmed: z.literal(true),
  }),
]);

export const reservationPaymentPreferenceSchema = z.discriminatedUnion("strategy", [
  z.object({ strategy: z.literal("external_only"), method: externalPaymentMethodSchema }),
  z.object({ strategy: z.literal("allowance_then_external"), remainderMethod: externalPaymentMethodSchema }),
  z.object({ strategy: z.literal("allowance_debt"), debtConfirmed: z.literal(true) }),
]);

export type PaymentIntent = z.infer<typeof paymentIntentSchema>;
export type PaymentStrategy = z.infer<typeof paymentStrategySchema>;
export type ExternalPaymentMethod = z.infer<typeof externalPaymentMethodSchema>;
export type PaymentAllocation = { method: "allowance" | ExternalPaymentMethod; amount: Prisma.Decimal };

export type PaymentAllocationResult = {
  strategy: PaymentStrategy;
  payments: PaymentAllocation[];
  allowanceUsed: Prisma.Decimal;
  allowanceBalanceBefore: Prisma.Decimal | null;
  allowanceBalanceAfter: Prisma.Decimal | null;
  paymentMethod: "allowance" | ExternalPaymentMethod | "split";
};

export class PaymentAllocationError extends Error {
  constructor(
    public readonly code:
      | "ALLOWANCE_REQUIRES_STAFF"
      | "ALLOWANCE_UNAVAILABLE"
      | "ALLOWANCE_CHANGED"
      | "ALLOWANCE_DEBT_CHANGED",
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

function compatibilityMethod(payments: readonly PaymentAllocation[]) {
  if (payments.length > 1) return "split" as const;
  return payments[0].method;
}

export function allocatePayment(input: {
  buyerType: string;
  saleTotal: Prisma.Decimal.Value;
  currentAllowanceBalance?: Prisma.Decimal.Value | null;
  intent: PaymentIntent;
}): PaymentAllocationResult {
  const total = new Prisma.Decimal(input.saleTotal);
  if (!total.greaterThan(0)) throw new Error("SALE_TOTAL_MUST_BE_POSITIVE");

  if (input.intent.strategy === "external_only") {
    const payments: PaymentAllocation[] = [{ method: input.intent.method, amount: total }];
    return {
      strategy: input.intent.strategy,
      payments,
      allowanceUsed: new Prisma.Decimal(0),
      allowanceBalanceBefore: null,
      allowanceBalanceAfter: null,
      paymentMethod: compatibilityMethod(payments),
    };
  }

  if (input.buyerType !== "staff") {
    throw new PaymentAllocationError("ALLOWANCE_REQUIRES_STAFF");
  }
  const before = new Prisma.Decimal(input.currentAllowanceBalance ?? 0);

  if (input.intent.strategy === "allowance_then_external") {
    const available = Prisma.Decimal.max(before, 0);
    const allowanceAmount = Prisma.Decimal.min(total, available);
    if (!allowanceAmount.greaterThan(0)) {
      throw new PaymentAllocationError("ALLOWANCE_UNAVAILABLE", {
        currentBalance: before.toFixed(2),
      });
    }
    const expected = input.intent.expectedAllowanceAvailable;
    if (expected !== undefined && !available.equals(new Prisma.Decimal(expected))) {
      const externalAmount = total.sub(allowanceAmount);
      throw new PaymentAllocationError("ALLOWANCE_CHANGED", {
        allowance: {
          previouslyDisplayed: new Prisma.Decimal(expected).toFixed(2),
          currentlyAvailable: available.toFixed(2),
        },
        proposedPayments: [
          { method: "allowance", amount: allowanceAmount.toFixed(2) },
          ...(externalAmount.greaterThan(0)
            ? [{ method: input.intent.remainderMethod, amount: externalAmount.toFixed(2) }]
            : []),
        ],
      });
    }
    const externalAmount = total.sub(allowanceAmount);
    const payments: PaymentAllocation[] = [
      { method: "allowance", amount: allowanceAmount },
      ...(externalAmount.greaterThan(0)
        ? [{ method: input.intent.remainderMethod, amount: externalAmount } as PaymentAllocation]
        : []),
    ];
    return {
      strategy: input.intent.strategy,
      payments,
      allowanceUsed: allowanceAmount,
      allowanceBalanceBefore: before,
      allowanceBalanceAfter: before.sub(allowanceAmount),
      paymentMethod: compatibilityMethod(payments),
    };
  }

  const after = before.sub(total);
  const expected = input.intent.expectedAllowanceBalance;
  if (expected !== undefined && !before.equals(new Prisma.Decimal(expected))) {
    throw new PaymentAllocationError("ALLOWANCE_DEBT_CHANGED", {
      allowance: {
        previouslyDisplayed: new Prisma.Decimal(expected).toFixed(2),
        currentBalance: before.toFixed(2),
        proposedBalanceAfter: after.toFixed(2),
      },
    });
  }
  const payments: PaymentAllocation[] = [{ method: "allowance", amount: total }];
  return {
    strategy: input.intent.strategy,
    payments,
    allowanceUsed: total,
    allowanceBalanceBefore: before,
    allowanceBalanceAfter: after,
    paymentMethod: compatibilityMethod(payments),
  };
}

export function serializePayments(payments: readonly { method: string; amount: Prisma.Decimal.Value }[]) {
  return payments.map((payment) => ({ method: payment.method, amount: new Prisma.Decimal(payment.amount).toFixed(2) }));
}

export function legacyPaymentIntent(paymentMethod: "allowance" | ExternalPaymentMethod): PaymentIntent {
  if (paymentMethod === "allowance") return { strategy: "allowance_debt", debtConfirmed: true };
  return { strategy: "external_only", method: paymentMethod };
}

export function legacyReservationPaymentPreference(paymentMethod: "allowance" | ExternalPaymentMethod) {
  if (paymentMethod === "allowance") {
    return { strategy: "allowance_debt" as const, debtConfirmed: true as const };
  }
  return { strategy: "external_only" as const, method: paymentMethod };
}
