-- Staff are kept by the Central person id. The email stays on each row as a label.
ALTER TABLE "CheckoutSession" ADD COLUMN "staffPersonId" TEXT;
ALTER TABLE "PosAllowanceNotification" ADD COLUMN "staffPersonId" TEXT;
ALTER TABLE "PosReservation" ADD COLUMN "staffPersonId" TEXT;
ALTER TABLE "PosSale" ADD COLUMN "staffPersonId" TEXT;
ALTER TABLE "PosStaffAllowanceAdjustment" ADD COLUMN "staffPersonId" TEXT;
ALTER TABLE "PosStaffAllowanceDebtSettlement" ADD COLUMN "staffPersonId" TEXT;
ALTER TABLE "PosStaffDayOff" ADD COLUMN "staffPersonId" TEXT;

-- Fill the id for rows whose email belongs to a user with a Central identity.
UPDATE "CheckoutSession" t SET "staffPersonId" = u."centralPersonId" FROM "User" u WHERE u."centralPersonId" IS NOT NULL AND lower(u.email) = lower(t."staffEmail");
UPDATE "PosAllowanceNotification" t SET "staffPersonId" = u."centralPersonId" FROM "User" u WHERE u."centralPersonId" IS NOT NULL AND lower(u.email) = lower(t."staffEmail");
UPDATE "PosReservation" t SET "staffPersonId" = u."centralPersonId" FROM "User" u WHERE u."centralPersonId" IS NOT NULL AND lower(u.email) = lower(t."staffEmail");
UPDATE "PosSale" t SET "staffPersonId" = u."centralPersonId" FROM "User" u WHERE u."centralPersonId" IS NOT NULL AND t."staffEmail" IS NOT NULL AND lower(u.email) = lower(t."staffEmail");
UPDATE "PosStaffAllowanceAdjustment" t SET "staffPersonId" = u."centralPersonId" FROM "User" u WHERE u."centralPersonId" IS NOT NULL AND lower(u.email) = lower(t."staffEmail");
UPDATE "PosStaffAllowanceDebtSettlement" t SET "staffPersonId" = u."centralPersonId" FROM "User" u WHERE u."centralPersonId" IS NOT NULL AND lower(u.email) = lower(t."staffEmail");
UPDATE "PosStaffDayOff" t SET "staffPersonId" = u."centralPersonId" FROM "User" u WHERE u."centralPersonId" IS NOT NULL AND lower(u.email) = lower(t."staffEmail");

-- Emails a person had before Central changed it.
CREATE TABLE "UserEmailHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEmailHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserEmailHistory_email_idx" ON "UserEmailHistory"("email");
CREATE UNIQUE INDEX "UserEmailHistory_userId_email_key" ON "UserEmailHistory"("userId", "email");
ALTER TABLE "UserEmailHistory" ADD CONSTRAINT "UserEmailHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes and the unique keys that go by person. The email keys stay until nothing is left without an id.
CREATE INDEX "CheckoutSession_staffPersonId_idx" ON "CheckoutSession"("staffPersonId");
CREATE INDEX "PosReservation_credentialId_staffPersonId_idx" ON "PosReservation"("credentialId", "staffPersonId");
CREATE INDEX "PosSale_credentialId_staffPersonId_createdAt_idx" ON "PosSale"("credentialId", "staffPersonId", "createdAt");
CREATE INDEX "PosStaffAllowanceDebtSettlement_credentialId_staffPersonId__idx" ON "PosStaffAllowanceDebtSettlement"("credentialId", "staffPersonId", "periodStartsAt", "periodEndsAt");
CREATE INDEX "PosStaffDayOff_credentialId_staffPersonId_date_idx" ON "PosStaffDayOff"("credentialId", "staffPersonId", "date");
CREATE UNIQUE INDEX "PosAllowanceNotification_person_unique" ON "PosAllowanceNotification"("credentialId", "staffPersonId", "periodStartsAt", "periodEndsAt", "reminderDay");
CREATE UNIQUE INDEX "PosStaffAllowanceAdjustment_person_unique" ON "PosStaffAllowanceAdjustment"("credentialId", "staffPersonId", "periodStartsAt", "periodEndsAt");
CREATE UNIQUE INDEX "PosStaffDayOff_person_unique" ON "PosStaffDayOff"("credentialId", "staffPersonId", "date");
