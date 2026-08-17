CREATE TABLE "PosAllowanceNotification" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "staffEmail" TEXT NOT NULL,
    "periodStartsAt" TIMESTAMP(3) NOT NULL,
    "periodEndsAt" TIMESTAMP(3) NOT NULL,
    "reminderDay" INTEGER NOT NULL,
    "scenario" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosAllowanceNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosAllowanceNotification_credentialId_staffEmail_periodStartsAt_periodEndsAt_reminderDay_key"
ON "PosAllowanceNotification"("credentialId", "staffEmail", "periodStartsAt", "periodEndsAt", "reminderDay");

CREATE INDEX "PosAllowanceNotification_status_updatedAt_idx"
ON "PosAllowanceNotification"("status", "updatedAt");

ALTER TABLE "PosAllowanceNotification"
ADD CONSTRAINT "PosAllowanceNotification_credentialId_fkey"
FOREIGN KEY ("credentialId") REFERENCES "AccurateCredentials"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
