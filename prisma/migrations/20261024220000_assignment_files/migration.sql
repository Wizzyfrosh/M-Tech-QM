ALTER TABLE "AssignmentSubmission" ADD COLUMN "attachmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AssignmentVersion" ADD COLUMN "attachmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE TABLE "AssignmentFile" (
 "id" TEXT NOT NULL, "assignmentId" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "name" TEXT NOT NULL, "extension" TEXT NOT NULL, "size" INTEGER NOT NULL,
 "sha256" TEXT NOT NULL, "objectKey" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "AssignmentFile_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AssignmentFile_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "AssignmentFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "AssignmentFile_state_check" CHECK ("state" IN ('PENDING','READY','DELETED')),
 CONSTRAINT "AssignmentFile_size_check" CHECK ("size" > 0 AND "size" <= 3145728)
);
CREATE UNIQUE INDEX "AssignmentFile_objectKey_key" ON "AssignmentFile"("objectKey");
CREATE INDEX "AssignmentFile_userId_assignmentId_idx" ON "AssignmentFile"("userId", "assignmentId");
CREATE INDEX "AssignmentFile_state_createdAt_idx" ON "AssignmentFile"("state", "createdAt");
