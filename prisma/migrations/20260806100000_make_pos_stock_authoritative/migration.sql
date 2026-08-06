-- RenameColumn
ALTER TABLE "PosProduct" RENAME COLUMN "stockCache" TO "stock";

-- AlterTable
ALTER TABLE "PosProduct" ADD COLUMN "syncStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "syncError" TEXT,
ADD COLUMN "accurateItemId" INTEGER;

-- Existing catalog records must be pushed before they can be considered synchronized.
UPDATE "PosProduct" SET "syncStatus" = 'pending', "lastSyncedAt" = NULL;
