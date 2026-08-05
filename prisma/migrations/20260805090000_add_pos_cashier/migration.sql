CREATE TABLE "PosSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "warehouseName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PosSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "warehouseName" TEXT NOT NULL,
    "staffEmail" TEXT NOT NULL,
    "staffName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "pickupAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PosReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosReservationItem" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "PosReservationItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosSale" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "reservationId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "warehouseName" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_sync',
    "accurateId" INTEGER,
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    CONSTRAINT "PosSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosStockAllocation" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "warehouseName" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "stockSnapshot" INTEGER NOT NULL,
    "heldQuantity" INTEGER NOT NULL DEFAULT 0,
    "soldQuantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "PosStockAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosSaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "PosSaleItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosSettings_credentialId_key" ON "PosSettings"("credentialId");
CREATE INDEX "PosSettings_userId_idx" ON "PosSettings"("userId");
CREATE UNIQUE INDEX "PosReservation_reference_key" ON "PosReservation"("reference");
CREATE UNIQUE INDEX "PosReservation_userId_idempotencyKey_key" ON "PosReservation"("userId", "idempotencyKey");
CREATE INDEX "PosReservation_credentialId_status_expiresAt_idx" ON "PosReservation"("credentialId", "status", "expiresAt");
CREATE INDEX "PosReservation_userId_createdAt_idx" ON "PosReservation"("userId", "createdAt");
CREATE INDEX "PosReservationItem_reservationId_itemCode_idx" ON "PosReservationItem"("reservationId", "itemCode");
CREATE UNIQUE INDEX "PosSale_userId_idempotencyKey_key" ON "PosSale"("userId", "idempotencyKey");
CREATE UNIQUE INDEX "PosStockAllocation_credentialId_warehouseId_itemCode_key" ON "PosStockAllocation"("credentialId", "warehouseId", "itemCode");
CREATE INDEX "PosStockAllocation_credentialId_warehouseId_idx" ON "PosStockAllocation"("credentialId", "warehouseId");
CREATE UNIQUE INDEX "PosSale_reservationId_key" ON "PosSale"("reservationId");
CREATE INDEX "PosSale_credentialId_createdAt_idx" ON "PosSale"("credentialId", "createdAt");
CREATE INDEX "PosSale_credentialId_status_idx" ON "PosSale"("credentialId", "status");
CREATE INDEX "PosSaleItem_saleId_itemCode_idx" ON "PosSaleItem"("saleId", "itemCode");

ALTER TABLE "PosSettings" ADD CONSTRAINT "PosSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosSettings" ADD CONSTRAINT "PosSettings_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AccurateCredentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosReservation" ADD CONSTRAINT "PosReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosReservation" ADD CONSTRAINT "PosReservation_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AccurateCredentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosReservationItem" ADD CONSTRAINT "PosReservationItem_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "PosReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosStockAllocation" ADD CONSTRAINT "PosStockAllocation_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AccurateCredentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosStockAllocation" ADD CONSTRAINT "PosStockAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AccurateCredentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "PosReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosSaleItem" ADD CONSTRAINT "PosSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
