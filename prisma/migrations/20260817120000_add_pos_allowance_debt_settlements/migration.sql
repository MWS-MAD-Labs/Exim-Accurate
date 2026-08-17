CREATE TABLE "PosStaffAllowanceDebtSettlement" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "staffEmail" TEXT NOT NULL,
    "periodStartsAt" TIMESTAMP(3) NOT NULL,
    "periodEndsAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosStaffAllowanceDebtSettlement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PosStaffAllowanceDebtSettlement_credentialId_staffEmail_periodStartsAt_periodEndsAt_idx"
ON "PosStaffAllowanceDebtSettlement"("credentialId", "staffEmail", "periodStartsAt", "periodEndsAt");

CREATE INDEX "PosStaffAllowanceDebtSettlement_createdById_idx"
ON "PosStaffAllowanceDebtSettlement"("createdById");

ALTER TABLE "PosStaffAllowanceDebtSettlement"
ADD CONSTRAINT "PosStaffAllowanceDebtSettlement_credentialId_fkey"
FOREIGN KEY ("credentialId") REFERENCES "AccurateCredentials"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PosStaffAllowanceDebtSettlement"
ADD CONSTRAINT "PosStaffAllowanceDebtSettlement_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
