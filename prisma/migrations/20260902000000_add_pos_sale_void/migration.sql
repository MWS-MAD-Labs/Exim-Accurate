-- Preserve every POS sale while recording an auditable, non-destructive void.
ALTER TABLE "PosSale" DROP CONSTRAINT "PosSale_userId_fkey";

ALTER TABLE "PosSale"
ADD CONSTRAINT "PosSale_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PosSale"
ADD COLUMN "voidReason" TEXT,
ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidedById" TEXT,
ADD COLUMN "voidAccurateId" INTEGER,
ADD COLUMN "voidSyncError" TEXT;

CREATE INDEX "PosSale_voidedById_idx" ON "PosSale"("voidedById");

ALTER TABLE "PosSale"
ADD CONSTRAINT "PosSale_voidedById_fkey"
FOREIGN KEY ("voidedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
