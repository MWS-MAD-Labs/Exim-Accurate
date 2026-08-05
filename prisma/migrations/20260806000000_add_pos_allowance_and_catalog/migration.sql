-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "allowanceUsed" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "buyerType" TEXT NOT NULL DEFAULT 'guest',
ADD COLUMN     "staffEmail" TEXT,
ADD COLUMN     "staffName" TEXT;

-- AlterTable
ALTER TABLE "PosSettings" ADD COLUMN     "allowancePerWorkingDay" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[];

-- CreateTable
CREATE TABLE "PosProduct" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT,
    "buyPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sellPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "stockCache" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosProduct_credentialId_isActive_idx" ON "PosProduct"("credentialId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PosProduct_credentialId_itemCode_key" ON "PosProduct"("credentialId", "itemCode");

-- CreateIndex
CREATE INDEX "PosSale_credentialId_staffEmail_createdAt_idx" ON "PosSale"("credentialId", "staffEmail", "createdAt");

-- AddForeignKey
ALTER TABLE "PosProduct" ADD CONSTRAINT "PosProduct_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AccurateCredentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
