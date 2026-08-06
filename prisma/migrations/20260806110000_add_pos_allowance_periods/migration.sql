ALTER TABLE "PosSettings"
ADD COLUMN "allowanceCutoffDay" INTEGER NOT NULL DEFAULT 22;

CREATE TABLE "PosAllowancePeriodOverride" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosAllowancePeriodOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PosAllowancePeriodOverride_credentialId_startsAt_endsAt_idx"
ON "PosAllowancePeriodOverride"("credentialId", "startsAt", "endsAt");

ALTER TABLE "PosAllowancePeriodOverride"
ADD CONSTRAINT "PosAllowancePeriodOverride_credentialId_fkey"
FOREIGN KEY ("credentialId") REFERENCES "AccurateCredentials"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
