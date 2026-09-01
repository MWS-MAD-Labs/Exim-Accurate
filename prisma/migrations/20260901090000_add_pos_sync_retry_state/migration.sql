ALTER TABLE "PosSale"
  ADD COLUMN "syncAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastSyncAttemptAt" TIMESTAMP(3),
  ADD COLUMN "nextSyncAttemptAt" TIMESTAMP(3);

CREATE INDEX "PosSale_status_nextSyncAttemptAt_idx"
  ON "PosSale"("status", "nextSyncAttemptAt");
