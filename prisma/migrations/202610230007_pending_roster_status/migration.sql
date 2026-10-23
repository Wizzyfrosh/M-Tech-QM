-- Add a safe pending state without changing existing approved students.
ALTER TYPE "RosterStatus" ADD VALUE IF NOT EXISTS 'PENDING';