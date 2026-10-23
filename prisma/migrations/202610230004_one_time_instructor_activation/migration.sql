-- Allow exactly one administrator-provisioned invitation. No public signup is possible.
CREATE TABLE "InstructorInvitation" (
  "id" TEXT NOT NULL DEFAULT 'primary',
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "codeHash" TEXT,
  "expiresAt" TIMESTAMP(3),
  "requestedAt" TIMESTAMP(3),
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "redeemedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstructorInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InstructorInvitation_singleton" CHECK ("id" = 'primary'),
  CONSTRAINT "InstructorInvitation_tries" CHECK ("failedAttempts" BETWEEN 0 AND 5),
  CONSTRAINT "InstructorInvitation_normalized_email" CHECK ("email" = lower(trim("email"))),
  CONSTRAINT "InstructorInvitation_code_expires" CHECK (("codeHash" IS NULL AND "expiresAt" IS NULL) OR ("codeHash" IS NOT NULL AND "expiresAt" IS NOT NULL)),
  CONSTRAINT "InstructorInvitation_redeemed" CHECK ("redeemedAt" IS NULL OR ("codeHash" IS NULL AND "expiresAt" IS NULL))
);
CREATE UNIQUE INDEX "InstructorInvitation_email_key" ON "InstructorInvitation"("email");