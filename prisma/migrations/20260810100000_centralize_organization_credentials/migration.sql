CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Organization" ("id", "name", "updatedAt")
VALUES ('default-organization', 'Default Organization', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "User" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AccurateCredentials" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "PosSettings" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "BorrowableItem" ADD COLUMN "organizationId" TEXT;

-- Credentials are now organization-owned; the legacy creator is audit metadata.
ALTER TABLE "AccurateCredentials" DROP CONSTRAINT "AccurateCredentials_userId_fkey";
ALTER TABLE "AccurateCredentials" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "AccurateCredentials"
ADD CONSTRAINT "AccurateCredentials_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "User"
SET "organizationId" = 'default-organization'
WHERE "organizationId" IS NULL;

UPDATE "AccurateCredentials"
SET "organizationId" = 'default-organization'
WHERE "organizationId" IS NULL;

UPDATE "PosSettings" AS settings
SET "organizationId" = credentials."organizationId"
FROM "AccurateCredentials" AS credentials
WHERE settings."credentialId" = credentials."id";

UPDATE "BorrowableItem"
SET "organizationId" = 'default-organization'
WHERE "organizationId" IS NULL;

ALTER TABLE "User" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "AccurateCredentials" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "PosSettings" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "BorrowableItem" ALTER COLUMN "organizationId" SET NOT NULL;

CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX "AccurateCredentials_organizationId_idx" ON "AccurateCredentials"("organizationId");
CREATE INDEX "PosSettings_organizationId_idx" ON "PosSettings"("organizationId");
CREATE INDEX "BorrowableItem_organizationId_idx" ON "BorrowableItem"("organizationId");

ALTER TABLE "User"
ADD CONSTRAINT "User_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccurateCredentials"
ADD CONSTRAINT "AccurateCredentials_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PosSettings"
ADD CONSTRAINT "PosSettings_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BorrowableItem"
ADD CONSTRAINT "BorrowableItem_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "BorrowableItem_itemCode_key";
CREATE UNIQUE INDEX "BorrowableItem_organizationId_itemCode_key"
ON "BorrowableItem"("organizationId", "itemCode");

-- Preserve historical disconnected connections, but retain only the newest
-- connected account before enforcing the one-active-credential invariant.
WITH ranked_active_credentials AS (
    SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "organizationId"
        ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rank
    FROM "AccurateCredentials"
    WHERE "disconnectedAt" IS NULL
)
UPDATE "AccurateCredentials"
SET "disconnectedAt" = CURRENT_TIMESTAMP,
    "host" = NULL,
    "session" = NULL,
    "refreshToken" = NULL
WHERE "id" IN (
    SELECT "id" FROM ranked_active_credentials WHERE rank > 1
);

-- Replace the legacy global POS-store invariant with one active store per organization.
DROP INDEX IF EXISTS "PosSettings_single_active_store_key";
CREATE UNIQUE INDEX "PosSettings_one_active_store_per_organization_key"
ON "PosSettings"("organizationId")
WHERE "isActive" = true;

-- Permit only one connected Accurate account for an organization at any time.
CREATE UNIQUE INDEX "AccurateCredentials_one_active_per_organization_key"
ON "AccurateCredentials"("organizationId")
WHERE "disconnectedAt" IS NULL;
