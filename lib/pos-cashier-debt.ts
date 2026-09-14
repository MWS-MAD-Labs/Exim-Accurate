export interface DebtSettlementHttpResult {
  ok: boolean;
  data: {
    code?: string;
    error?: string;
    currentDebt?: { hasOutstanding: boolean };
    previousDebt?: { hasOutstanding: boolean };
  };
}

export type DebtSettlementRefreshResult<TAllowance> =
  | {
      kind: "refreshed";
      allowance: TAllowance;
      response: DebtSettlementHttpResult;
      debtClearedConcurrently: boolean;
    }
  | {
      kind: "refresh_required";
      paymentRecorded: boolean;
      response: DebtSettlementHttpResult;
    };

function acceptedConflict(result: DebtSettlementHttpResult, periodType: "current" | "previous") {
  const { code } = result.data;
  const promptedDebt = periodType === "current" ? result.data.currentDebt : result.data.previousDebt;
  const debtClearedConcurrently = code === "DEBT_ALREADY_PAID"
    || (code === "PAYMENT_EXCEEDS_DEBT" && promptedDebt !== undefined && !promptedDebt.hasOutstanding);
  return {
    accepted: result.ok || debtClearedConcurrently || code === "DEBT_PERIOD_CHANGED" || code === "PAYMENT_EXCEEDS_DEBT",
    debtClearedConcurrently,
  };
}

export async function settleDebtPaymentAndRefresh<TAllowance>(input: {
  periodType: "current" | "previous";
  settle: () => Promise<DebtSettlementHttpResult>;
  refresh: () => Promise<TAllowance>;
}): Promise<DebtSettlementRefreshResult<TAllowance>> {
  const response = await input.settle();
  const conflict = acceptedConflict(response, input.periodType);
  if (!conflict.accepted) throw new Error(response.data.error || "Unable to record payment");

  try {
    return {
      kind: "refreshed",
      allowance: await input.refresh(),
      response,
      debtClearedConcurrently: conflict.debtClearedConcurrently,
    };
  } catch {
    return { kind: "refresh_required", paymentRecorded: response.ok, response };
  }
}

export async function retryDebtAllowanceRefresh<TAllowance>(refresh: () => Promise<TAllowance>) {
  return refresh();
}
