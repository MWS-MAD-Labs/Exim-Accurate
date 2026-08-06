CREATE TABLE IF NOT EXISTS "BorrowableItem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "itemCode" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "totalStock" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BorrowableItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BorrowableItem_credentialId_itemCode_key"
ON "BorrowableItem"("credentialId", "itemCode");

CREATE TABLE IF NOT EXISTS "BorrowingSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "borrowerEmail" TEXT NOT NULL,
  "borrowerName" TEXT,
  "borrowerDept" TEXT,
  "type" TEXT NOT NULL DEFAULT 'borrow',
  "status" TEXT NOT NULL DEFAULT 'active',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMP(3),
  "borrowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "returnedAt" TIMESTAMP(3),
  "notes" TEXT,
  "adjustmentOutId" INTEGER,
  "adjustmentInId" INTEGER,
  CONSTRAINT "BorrowingSession_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BorrowingSession"
  ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'borrow';

ALTER TABLE "BorrowingSession"
  ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "BorrowingSession"
  ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "BorrowingItem" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "itemCode" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "returnedQty" INTEGER NOT NULL DEFAULT 0,
  "returnedAt" TIMESTAMP(3),
  CONSTRAINT "BorrowingItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BorrowingActivity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "sessionId" TEXT,
  "itemCode" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "borrowerEmail" TEXT NOT NULL,
  "borrowerName" TEXT,
  "borrowerDept" TEXT,
  "activityType" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduleStart" TIMESTAMP(3),
  "scheduleEnd" TIMESTAMP(3),
  "details" TEXT,
  CONSTRAINT "BorrowingActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BorrowingActivity_credentialId_occurredAt_idx"
ON "BorrowingActivity"("credentialId", "occurredAt");

CREATE INDEX IF NOT EXISTS "BorrowingActivity_credentialId_itemCode_occurredAt_idx"
ON "BorrowingActivity"("credentialId", "itemCode", "occurredAt");

ALTER TABLE "BorrowableItem"
  ADD CONSTRAINT "BorrowableItem_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BorrowableItem"
  ADD CONSTRAINT "BorrowableItem_credentialId_fkey"
  FOREIGN KEY ("credentialId") REFERENCES "AccurateCredentials"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BorrowingSession"
  ADD CONSTRAINT "BorrowingSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BorrowingSession"
  ADD CONSTRAINT "BorrowingSession_credentialId_fkey"
  FOREIGN KEY ("credentialId") REFERENCES "AccurateCredentials"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BorrowingItem"
  ADD CONSTRAINT "BorrowingItem_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "BorrowingSession"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BorrowingActivity"
  ADD CONSTRAINT "BorrowingActivity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BorrowingActivity"
  ADD CONSTRAINT "BorrowingActivity_credentialId_fkey"
  FOREIGN KEY ("credentialId") REFERENCES "AccurateCredentials"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BorrowingActivity"
  ADD CONSTRAINT "BorrowingActivity_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "BorrowingSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
