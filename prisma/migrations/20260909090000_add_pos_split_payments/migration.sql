-- Expand the POS payment model while preserving legacy compatibility fields.
ALTER TABLE "PosReservation"
  ADD COLUMN "paymentStrategy" TEXT NOT NULL DEFAULT 'allowance_then_external',
  ADD COLUMN "externalPaymentMethod" TEXT;

ALTER TABLE "PosSale"
  ADD COLUMN "paymentStrategy" TEXT NOT NULL DEFAULT 'external_only',
  ADD COLUMN "allowancePeriodStartsAt" TIMESTAMP(3),
  ADD COLUMN "allowancePeriodEndsAt" TIMESTAMP(3),
  ADD COLUMN "allowanceBalanceBefore" DECIMAL(14,2),
  ADD COLUMN "allowanceBalanceAfter" DECIMAL(14,2),
  ADD COLUMN "paymentVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "PosSalePayment" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PosSalePayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PosSalePayment_amount_positive" CHECK ("amount" > 0)
);

CREATE TABLE "PosSalePaymentRevision" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "changedById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "previousStrategy" TEXT NOT NULL,
  "newStrategy" TEXT NOT NULL,
  "previousPayments" JSONB NOT NULL,
  "newPayments" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosSalePaymentRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosSalePayment_saleId_method_key" ON "PosSalePayment"("saleId", "method");
CREATE INDEX "PosSalePayment_saleId_idx" ON "PosSalePayment"("saleId");
CREATE INDEX "PosSalePayment_method_createdAt_idx" ON "PosSalePayment"("method", "createdAt");
CREATE INDEX "PosSalePaymentRevision_saleId_createdAt_idx" ON "PosSalePaymentRevision"("saleId", "createdAt");
CREATE INDEX "PosSalePaymentRevision_changedById_idx" ON "PosSalePaymentRevision"("changedById");

ALTER TABLE "PosSalePayment"
  ADD CONSTRAINT "PosSalePayment_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosSalePaymentRevision"
  ADD CONSTRAINT "PosSalePaymentRevision_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosSalePaymentRevision"
  ADD CONSTRAINT "PosSalePaymentRevision_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Validate historical compatibility fields before creating payment rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "PosSale"
    WHERE "paymentMethod" NOT IN ('allowance', 'cash', 'qris')
  ) THEN
    RAISE EXCEPTION 'Cannot backfill POS payments: unsupported historical paymentMethod values exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "PosSale" sale
    JOIN (
      SELECT "saleId", SUM("unitPrice" * "quantity")::DECIMAL(14,2) AS "amount"
      FROM "PosSaleItem"
      GROUP BY "saleId"
    ) totals ON totals."saleId" = sale."id"
    WHERE sale."paymentMethod" = 'allowance'
      AND sale."allowanceUsed" <> totals."amount"
  ) THEN
    RAISE EXCEPTION 'Cannot backfill POS payments: legacy allowanceUsed differs from the sale item total';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "PosSale"
    WHERE "paymentMethod" IN ('cash', 'qris')
      AND "allowanceUsed" <> 0
  ) THEN
    RAISE EXCEPTION 'Cannot backfill POS payments: external legacy sales have non-zero allowanceUsed';
  END IF;
END $$;

-- Backfill historical single-method sales. Item totals remain authoritative.
INSERT INTO "PosSalePayment" ("id", "saleId", "method", "amount", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  sale."id",
  sale."paymentMethod",
  totals."amount",
  sale."createdAt",
  CURRENT_TIMESTAMP
FROM "PosSale" sale
JOIN (
  SELECT "saleId", SUM("unitPrice" * "quantity")::DECIMAL(14,2) AS "amount"
  FROM "PosSaleItem"
  GROUP BY "saleId"
) totals ON totals."saleId" = sale."id"
WHERE totals."amount" > 0;

UPDATE "PosSale"
SET "paymentStrategy" = CASE
  WHEN "paymentMethod" = 'allowance' THEN 'allowance_then_external'
  ELSE 'external_only'
END;

UPDATE "PosReservation"
SET
  "paymentStrategy" = CASE
    WHEN "preferredPaymentMethod" = 'allowance' THEN 'allowance_then_external'
    ELSE 'external_only'
  END,
  "externalPaymentMethod" = CASE
    WHEN "preferredPaymentMethod" IN ('cash', 'qris') THEN "preferredPaymentMethod"
    ELSE 'cash'
  END;
