-- AlterTable
ALTER TABLE "PosSettings" ADD COLUMN "holidayDates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
