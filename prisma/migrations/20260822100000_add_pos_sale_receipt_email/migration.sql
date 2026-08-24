ALTER TABLE "PosSale"
ADD COLUMN "receiptEmailStatus" TEXT NOT NULL DEFAULT 'disabled',
ADD COLUMN "receiptEmailAttemptedAt" TIMESTAMP(3),
ADD COLUMN "receiptEmailSentAt" TIMESTAMP(3),
ADD COLUMN "receiptEmailError" TEXT;

ALTER TABLE "PosSale"
ALTER COLUMN "receiptEmailStatus" SET DEFAULT 'pending';

CREATE INDEX "PosSale_receiptEmailStatus_receiptEmailAttemptedAt_idx"
ON "PosSale"("receiptEmailStatus", "receiptEmailAttemptedAt");
