-- Existing ACTIVE and SUSPENDED students retain their statuses.
ALTER TABLE "RosterEntry" ALTER COLUMN "status" SET DEFAULT 'PENDING';