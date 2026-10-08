-- CreateTable
CREATE TABLE "CentralSyncState" (
    "id" TEXT NOT NULL,
    "application" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentralSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CentralSyncState_application_key" ON "CentralSyncState"("application");
