ALTER TABLE "PosSettings"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false;

UPDATE "PosSettings"
SET "isActive" = true
WHERE "id" = (
  SELECT "id"
  FROM "PosSettings"
  ORDER BY "updatedAt" DESC
  LIMIT 1
);

CREATE UNIQUE INDEX "PosSettings_single_active_store_key"
ON "PosSettings" ("isActive")
WHERE "isActive" = true;
