ALTER TABLE "User" ADD COLUMN "centralStatus" TEXT;
ALTER TABLE "CentralSyncState" ADD COLUMN "checkedAt" TIMESTAMP(3);
ALTER TABLE "CentralSyncState" ADD COLUMN "lastError" TEXT;
ALTER TABLE "CentralSyncState" ADD COLUMN "lastSummary" JSONB;

-- Accounts with a Central identity and permissions were active at the last sync.
UPDATE "User" SET "centralStatus" = 'active' WHERE "centralPersonId" IS NOT NULL AND cardinality("permissions") > 0;
UPDATE "User" SET "centralStatus" = 'unknown' WHERE "centralStatus" IS NULL AND ("centralPersonId" IS NULL OR cardinality("permissions") = 0);
