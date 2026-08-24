CREATE TABLE "ResourceSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "warehouseName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResourceSettings_organizationId_key"
ON "ResourceSettings"("organizationId");

ALTER TABLE "ResourceSettings"
ADD CONSTRAINT "ResourceSettings_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ResourceSettings" (
    "id",
    "organizationId",
    "warehouseId",
    "warehouseName",
    "createdAt",
    "updatedAt"
)
SELECT
    md5(settings."organizationId" || ':resource-settings'),
    settings."organizationId",
    settings."warehouseId",
    settings."warehouseName",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON ("organizationId")
        "organizationId",
        "warehouseId",
        "warehouseName"
    FROM "PosSettings"
    WHERE "isActive" = true
    ORDER BY "organizationId", "updatedAt" DESC
) AS settings;
