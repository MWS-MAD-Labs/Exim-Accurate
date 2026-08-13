CREATE TABLE "PosStaffDayOff" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "staffEmail" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosStaffDayOff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosStaffAllowanceAdjustment" (
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

    CONSTRAINT "PosStaffAllowanceAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosStaffDayOff_credentialId_staffEmail_date_key"
ON "PosStaffDayOff"("credentialId", "staffEmail", "date");

CREATE INDEX "PosStaffDayOff_credentialId_staffEmail_date_idx"
ON "PosStaffDayOff"("credentialId", "staffEmail", "date");

CREATE UNIQUE INDEX "PosStaffAllowanceAdjustment_credentialId_staffEmail_periodStartsAt_periodEndsAt_key"
ON "PosStaffAllowanceAdjustment"("credentialId", "staffEmail", "periodStartsAt", "periodEndsAt");


CREATE INDEX "PosStaffAllowanceAdjustment_createdById_idx"
ON "PosStaffAllowanceAdjustment"("createdById");

ALTER TABLE "PosStaffDayOff"
ADD CONSTRAINT "PosStaffDayOff_credentialId_fkey"
FOREIGN KEY ("credentialId") REFERENCES "AccurateCredentials"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PosStaffAllowanceAdjustment"
ADD CONSTRAINT "PosStaffAllowanceAdjustment_credentialId_fkey"
FOREIGN KEY ("credentialId") REFERENCES "AccurateCredentials"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PosStaffAllowanceAdjustment"
ADD CONSTRAINT "PosStaffAllowanceAdjustment_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
