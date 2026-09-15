export interface AllowanceSnapshotSale {
  id: string;
  createdAt: Date;
  allowanceUsed: number;
  allowanceBalanceBefore: number | null;
  allowanceBalanceAfter: number | null;
  splitExternalRemainder?: number;
  saleTotal?: number;
}

export function backfillSettledSplitSnapshots(
  sales: readonly AllowanceSnapshotSale[],
): AllowanceSnapshotSale[] {
  let cumulativeAdditionalCharge = 0;
  return [...sales]
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
    .map((sale) => {
      const additionalCharge = Math.max(0, sale.splitExternalRemainder ?? 0);
      const priorAdditionalCharge = cumulativeAdditionalCharge;
      cumulativeAdditionalCharge += additionalCharge;
      return {
        ...sale,
        allowanceUsed: additionalCharge > 0 && sale.saleTotal !== undefined
          ? sale.saleTotal
          : sale.allowanceUsed,
        allowanceBalanceBefore: sale.allowanceBalanceBefore === null
          ? null
          : sale.allowanceBalanceBefore - priorAdditionalCharge,
        allowanceBalanceAfter: sale.allowanceBalanceAfter === null
          ? null
          : sale.allowanceBalanceAfter - cumulativeAdditionalCharge,
      };
    });
}
