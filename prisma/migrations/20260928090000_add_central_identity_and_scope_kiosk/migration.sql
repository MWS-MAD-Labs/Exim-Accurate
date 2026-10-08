ALTER TABLE "User"
ADD COLUMN "centralPersonId" TEXT,
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "User_centralPersonId_key" ON "User"("centralPersonId");

ALTER TABLE "KioskSyncData" ADD COLUMN "organizationId" TEXT;

UPDATE "KioskSyncData" AS cache
SET "organizationId" = users."organizationId"
FROM "User" AS users
WHERE cache."userId" = users."id";

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId", "year", "month"
      ORDER BY "totalCheckouts" DESC, "uniqueUsers" DESC, "lastSyncAt" DESC, "id" ASC
    ) AS row_number
  FROM "KioskSyncData"
)
DELETE FROM "KioskSyncData"
WHERE "id" IN (SELECT "id" FROM ranked WHERE row_number > 1);

ALTER TABLE "KioskSyncData" ALTER COLUMN "organizationId" SET NOT NULL;

DROP INDEX "KioskSyncData_userId_year_month_key";
ALTER TABLE "KioskSyncData" DROP CONSTRAINT "KioskSyncData_userId_fkey";
ALTER TABLE "KioskSyncData" DROP COLUMN "userId";

CREATE UNIQUE INDEX "KioskSyncData_organizationId_year_month_key"
ON "KioskSyncData"("organizationId", "year", "month");

ALTER TABLE "KioskSyncData"
ADD CONSTRAINT "KioskSyncData_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
