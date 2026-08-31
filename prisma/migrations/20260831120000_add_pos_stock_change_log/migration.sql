-- CreateTable
CREATE TABLE "PosStockChange" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "productId" TEXT,
    "saleId" TEXT,
    "userId" TEXT,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "previousStock" INTEGER NOT NULL,
    "newStock" INTEGER NOT NULL,
    "quantityChange" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosStockChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosStockChange_credentialId_itemCode_createdAt_idx" ON "PosStockChange"("credentialId", "itemCode", "createdAt");

-- CreateIndex
CREATE INDEX "PosStockChange_productId_createdAt_idx" ON "PosStockChange"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "PosStockChange_saleId_idx" ON "PosStockChange"("saleId");

-- AddForeignKey
ALTER TABLE "PosStockChange" ADD CONSTRAINT "PosStockChange_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AccurateCredentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosStockChange" ADD CONSTRAINT "PosStockChange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PosProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosStockChange" ADD CONSTRAINT "PosStockChange_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosStockChange" ADD CONSTRAINT "PosStockChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
