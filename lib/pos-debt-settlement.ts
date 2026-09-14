import type { AllowancePeriod } from "@/lib/pos";

export interface PayableDebtStatus {
  hasOutstanding: boolean;
  outstanding: number;
  period: { startsAt: string; endsAt: string };
}

export type DebtSettlementValidationCode = "DEBT_PERIOD_CHANGED" | "DEBT_ALREADY_PAID" | "PAYMENT_EXCEEDS_DEBT";

function samePeriod(period: AllowancePeriod, debt: PayableDebtStatus) {
  return period.startsAt.getTime() === new Date(debt.period.startsAt).getTime()
    && period.endsAt.getTime() === new Date(debt.period.endsAt).getTime();
}

export function validateDebtSettlement(input: {
  requestedPeriod: AllowancePeriod;
  amount: number;
  currentDebt: PayableDebtStatus;
  previousDebt: PayableDebtStatus;
}): "current" | "previous" {
  const periodType = samePeriod(input.requestedPeriod, input.currentDebt)
    ? "current"
    : samePeriod(input.requestedPeriod, input.previousDebt)
      ? "previous"
      : null;
  if (!periodType) throw new Error("DEBT_PERIOD_CHANGED" satisfies DebtSettlementValidationCode);
  const debt = periodType === "current" ? input.currentDebt : input.previousDebt;
  if (!debt.hasOutstanding) throw new Error("DEBT_ALREADY_PAID" satisfies DebtSettlementValidationCode);
  if (input.amount > debt.outstanding) throw new Error("PAYMENT_EXCEEDS_DEBT" satisfies DebtSettlementValidationCode);
  return periodType;
}

export async function recordValidatedDebtSettlement<T>(input: {
  requestedPeriod: AllowancePeriod;
  amount: number;
  loadDebts: () => Promise<{ currentDebt: PayableDebtStatus; previousDebt: PayableDebtStatus }>;
  createSettlement: () => Promise<T>;
}) {
  const debts = await input.loadDebts();
  validateDebtSettlement({ ...input, ...debts });
  return input.createSettlement();
}
