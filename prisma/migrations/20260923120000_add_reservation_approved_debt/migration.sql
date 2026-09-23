-- Existing reservations have no verifiable staff-approved debt bound.
ALTER TABLE "PosReservation"
  ADD COLUMN "approvedResultingDebt" DECIMAL(14,2);

ALTER TABLE "PosReservation"
  ADD CONSTRAINT "PosReservation_approvedResultingDebt_nonnegative"
  CHECK ("approvedResultingDebt" IS NULL OR "approvedResultingDebt" >= 0);
