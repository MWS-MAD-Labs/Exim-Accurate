ALTER TABLE "PosStaffAllowanceDebtSettlement"
ADD COLUMN "saleId" TEXT;

ALTER TABLE "PosStaffAllowanceDebtSettlement"
ADD CONSTRAINT "PosStaffAllowanceDebtSettlement_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "PosSale"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PosStaffAllowanceDebtSettlement_saleId_key"
ON "PosStaffAllowanceDebtSettlement"("saleId");

WITH split_sales AS (
  SELECT
    sale."id",
    sale."credentialId",
    sale."staffEmail",
    sale."allowancePeriodStartsAt",
    sale."allowancePeriodEndsAt",
    sale."createdAt",
    external_payment."amount" AS "externalAmount",
    totals."saleTotal"
  FROM "PosSale" sale
  JOIN LATERAL (
    SELECT payment."amount"
    FROM "PosSalePayment" payment
    WHERE payment."saleId" = sale."id"
      AND payment."method" IN ('cash', 'qris')
    LIMIT 1
  ) external_payment ON TRUE
  JOIN LATERAL (
    SELECT COALESCE(SUM(item."quantity" * item."unitPrice"), 0)::numeric(14, 2) AS "saleTotal"
    FROM "PosSaleItem" item
    WHERE item."saleId" = sale."id"
  ) totals ON TRUE
  WHERE sale."paymentStrategy" = 'allowance_then_external'
    AND sale."staffEmail" IS NOT NULL
    AND sale."allowancePeriodStartsAt" IS NOT NULL
    AND sale."allowancePeriodEndsAt" IS NOT NULL
    AND sale."status" <> 'voided'
    AND external_payment."amount" > 0
),
snapshot_adjustments AS (
  SELECT
    target."id",
    MAX(CASE WHEN split."id" = target."id" THEN split."saleTotal" END) AS "migratedSaleTotal",
    COALESCE(SUM(split."externalAmount") FILTER (
      WHERE (split."createdAt", split."id") < (target."createdAt", target."id")
    ), 0)::numeric(14, 2) AS "priorAdditionalCharge",
    COALESCE(SUM(split."externalAmount") FILTER (
      WHERE (split."createdAt", split."id") <= (target."createdAt", target."id")
    ), 0)::numeric(14, 2) AS "throughAdditionalCharge"
  FROM "PosSale" target
  LEFT JOIN split_sales split
    ON split."credentialId" = target."credentialId"
    AND split."staffEmail" = target."staffEmail"
    AND split."allowancePeriodStartsAt" = target."allowancePeriodStartsAt"
    AND split."allowancePeriodEndsAt" = target."allowancePeriodEndsAt"
    AND (split."createdAt", split."id") <= (target."createdAt", target."id")
  WHERE target."staffEmail" IS NOT NULL
    AND target."allowancePeriodStartsAt" IS NOT NULL
    AND target."allowancePeriodEndsAt" IS NOT NULL
    AND (target."allowanceBalanceBefore" IS NOT NULL OR target."allowanceBalanceAfter" IS NOT NULL)
  GROUP BY target."id"
)
UPDATE "PosSale" sale
SET
  "allowanceUsed" = COALESCE(snapshot_adjustments."migratedSaleTotal", sale."allowanceUsed"),
  "allowanceBalanceBefore" = CASE
    WHEN sale."allowanceBalanceBefore" IS NULL THEN NULL
    ELSE sale."allowanceBalanceBefore" - snapshot_adjustments."priorAdditionalCharge"
  END,
  "allowanceBalanceAfter" = CASE
    WHEN sale."allowanceBalanceAfter" IS NULL THEN NULL
    ELSE sale."allowanceBalanceAfter" - snapshot_adjustments."throughAdditionalCharge"
  END
FROM snapshot_adjustments
WHERE sale."id" = snapshot_adjustments."id";

WITH split_sales AS (
  SELECT
    sale."id",
    sale."credentialId",
    sale."staffEmail",
    sale."userId",
    sale."allowancePeriodStartsAt",
    sale."allowancePeriodEndsAt",
    sale."createdAt",
    external_payment."method" AS "externalMethod",
    external_payment."amount" AS "externalAmount"
  FROM "PosSale" sale
  JOIN LATERAL (
    SELECT payment."method", payment."amount"
    FROM "PosSalePayment" payment
    WHERE payment."saleId" = sale."id"
      AND payment."method" IN ('cash', 'qris')
    LIMIT 1
  ) external_payment ON TRUE
  WHERE sale."paymentStrategy" = 'allowance_then_external'
    AND sale."staffEmail" IS NOT NULL
    AND sale."allowancePeriodStartsAt" IS NOT NULL
    AND sale."allowancePeriodEndsAt" IS NOT NULL
    AND sale."status" <> 'voided'
    AND external_payment."amount" > 0
)
INSERT INTO "PosStaffAllowanceDebtSettlement" (
  "id",
  "credentialId",
  "staffEmail",
  "periodStartsAt",
  "periodEndsAt",
  "amount",
  "paymentMethod",
  "note",
  "createdById",
  "saleId",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  split_sales."credentialId",
  split_sales."staffEmail",
  split_sales."allowancePeriodStartsAt",
  split_sales."allowancePeriodEndsAt",
  split_sales."externalAmount",
  split_sales."externalMethod",
  'Automatically settled external remainder from split POS sale',
  split_sales."userId",
  split_sales."id",
  split_sales."createdAt",
  CURRENT_TIMESTAMP
FROM split_sales
ON CONFLICT ("saleId") DO NOTHING;
