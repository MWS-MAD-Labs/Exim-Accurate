UPDATE "User"
SET "role" = 'staff'
WHERE "role" = 'user';

ALTER TABLE "User"
ALTER COLUMN "role" SET DEFAULT 'staff';
