export type CashierPaymentChoice =
  | "cash"
  | "qris"
  | "allowance_first_cash"
  | "allowance_first_qris"
  | "allowance_debt";

export function isAllowanceFirstChoice(
  choice: CashierPaymentChoice | null,
): choice is "allowance_first_cash" | "allowance_first_qris" {
  return choice?.startsWith("allowance_first") ?? false;
}

export function selectExternalPaymentMethod(
  currentChoice: CashierPaymentChoice | null,
  method: "cash" | "qris",
  canUseAllowanceFirst = true,
): CashierPaymentChoice {
  return canUseAllowanceFirst && isAllowanceFirstChoice(currentChoice)
    ? `allowance_first_${method}`
    : method;
}

export function canToggleAllowanceFirst(
  currentChoice: CashierPaymentChoice | null,
  canUseAllowanceFirst: boolean,
) {
  return canUseAllowanceFirst || isAllowanceFirstChoice(currentChoice);
}

export function toggleAllowanceFirst(
  currentChoice: CashierPaymentChoice | null,
): CashierPaymentChoice | null {
  return isAllowanceFirstChoice(currentChoice)
    ? null
    : "allowance_first_cash";
}

export function getCashierPaymentBreakdown(input: {
  choice: CashierPaymentChoice;
  total: number;
  allowanceBalance: number;
}) {
  const total = Math.max(0, input.total);
  if (input.choice === "allowance_debt") {
    return {
      allowanceAmount: total,
      externalAmount: 0,
      externalMethod: null,
      allowanceBalanceAfter: input.allowanceBalance - total,
      immediatelySettledDebt: 0,
    } as const;
  }
  if (input.choice.startsWith("allowance_first")) {
    const allowanceAmount = Math.min(total, Math.max(0, input.allowanceBalance));
    const externalAmount = total - allowanceAmount;
    return {
      allowanceAmount,
      externalAmount,
      externalMethod: input.choice === "allowance_first_qris" ? "qris" : "cash",
      allowanceBalanceAfter: input.allowanceBalance - total,
      immediatelySettledDebt: externalAmount,
    } as const;
  }
  return {
    allowanceAmount: 0,
    externalAmount: total,
    externalMethod: input.choice,
    allowanceBalanceAfter: input.allowanceBalance,
    immediatelySettledDebt: 0,
  } as const;
}
