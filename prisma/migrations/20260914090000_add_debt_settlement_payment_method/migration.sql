ALTER TABLE "PosStaffAllowanceDebtSettlement"
ADD COLUMN "paymentMethod" TEXT;

ALTER TABLE "PosStaffAllowanceDebtSettlement"
ADD CONSTRAINT "PosStaffAllowanceDebtSettlement_paymentMethod_check"
CHECK ("paymentMethod" IS NULL OR "paymentMethod" IN ('cash', 'qris'));

CREATE INDEX "PosStaffAllowanceDebtSettlement_credentialId_createdAt_idx"
ON "PosStaffAllowanceDebtSettlement"("credentialId", "createdAt");
