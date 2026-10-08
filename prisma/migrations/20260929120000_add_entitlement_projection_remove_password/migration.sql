ALTER TABLE "Organization" ADD COLUMN "centralOrganizationId" TEXT;

ALTER TABLE "User"
ADD COLUMN "centralEntitlementId" TEXT,
ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "entitlementVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "entitlementSyncedAt" TIMESTAMP(3);

UPDATE "User"
SET "permissions" = CASE "role"
  WHEN 'admin' THEN ARRAY[
    'app.admin', 'dashboard.read', 'analytics.read', 'users.manage',
    'credentials.read', 'credentials.manage', 'accurate.manage',
    'inventory.export', 'inventory.import', 'borrowing.manage',
    'pos.catalog.read', 'pos.manage', 'pos.checkout', 'pos.sales.read',
    'pos.sales.void', 'allowance.manage', 'store.use'
  ]::TEXT[]
  WHEN 'resource' THEN ARRAY[
    'credentials.read', 'inventory.export', 'inventory.import',
    'borrowing.manage'
  ]::TEXT[]
  WHEN 'cashier' THEN ARRAY[
    'credentials.read', 'pos.catalog.read', 'pos.checkout',
    'pos.sales.read', 'allowance.collect'
  ]::TEXT[]
  WHEN 'staff' THEN ARRAY[
    'credentials.read', 'pos.catalog.read', 'store.use'
  ]::TEXT[]
  ELSE ARRAY[]::TEXT[]
END;

ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

CREATE UNIQUE INDEX "Organization_centralOrganizationId_key"
ON "Organization"("centralOrganizationId");

CREATE UNIQUE INDEX "User_centralEntitlementId_key"
ON "User"("centralEntitlementId");
