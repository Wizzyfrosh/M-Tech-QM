CREATE TABLE "Assignment" (
 "id" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
 "title" TEXT NOT NULL DEFAULT 'Untitled assignment', "instructions" TEXT NOT NULL DEFAULT '',
 "rubric" TEXT NOT NULL DEFAULT '', "resources" TEXT[] DEFAULT ARRAY[]::TEXT[],
 "submissionType" TEXT NOT NULL DEFAULT 'PROJECT', "maxMarks" INTEGER NOT NULL DEFAULT 100,
 "deadline" TIMESTAMP(3), "allowLate" BOOLEAN NOT NULL DEFAULT false,
 "status" TEXT NOT NULL DEFAULT 'DRAFT', "revision" INTEGER NOT NULL DEFAULT 0,
 "publishedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Assignment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "Assignment_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','CLOSED','ARCHIVED')),
 CONSTRAINT "Assignment_type_check" CHECK ("submissionType" IN ('TEXT','PROJECT')),
 CONSTRAINT "Assignment_marks_check" CHECK ("maxMarks" BETWEEN 1 AND 1000)
);
CREATE INDEX "Assignment_createdBy_createdAt_idx" ON "Assignment"("createdBy", "createdAt");
CREATE INDEX "Assignment_status_createdAt_idx" ON "Assignment"("status", "createdAt");
CREATE TABLE "AssignmentSubmission" (
 "id" TEXT NOT NULL, "assignmentId" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'DRAFT', "revision" INTEGER NOT NULL DEFAULT 0,
 "responseText" TEXT NOT NULL DEFAULT '', "projectUrl" TEXT NOT NULL DEFAULT '',
 "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[], "version" INTEGER NOT NULL DEFAULT 0,
 "submittedAt" TIMESTAMP(3), "late" BOOLEAN NOT NULL DEFAULT false, "grade" INTEGER,
 "feedback" TEXT NOT NULL DEFAULT '', "changeRequest" TEXT NOT NULL DEFAULT '', "releasedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "AssignmentSubmission_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AssignmentSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "AssignmentSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "AssignmentSubmission_status_check" CHECK ("status" IN ('DRAFT','SUBMITTED','CHANGES_REQUESTED','GRADED')),
 CONSTRAINT "AssignmentSubmission_grade_check" CHECK (("status" = 'GRADED' AND "grade" IS NOT NULL AND "grade" >= 0 AND "submittedAt" IS NOT NULL) OR ("status" <> 'GRADED' AND "grade" IS NULL AND "releasedAt" IS NULL)),
 CONSTRAINT "AssignmentSubmission_submitted_check" CHECK ("status" <> 'SUBMITTED' OR "submittedAt" IS NOT NULL)
);
CREATE UNIQUE INDEX "AssignmentSubmission_assignmentId_userId_key" ON "AssignmentSubmission"("assignmentId", "userId");
CREATE INDEX "AssignmentSubmission_assignmentId_status_idx" ON "AssignmentSubmission"("assignmentId", "status");
CREATE INDEX "AssignmentSubmission_userId_updatedAt_idx" ON "AssignmentSubmission"("userId", "updatedAt");
CREATE TABLE "AssignmentVersion" (
 "id" TEXT NOT NULL, "submissionId" TEXT NOT NULL, "version" INTEGER NOT NULL,
 "responseText" TEXT NOT NULL, "projectUrl" TEXT NOT NULL, "evidenceUrls" TEXT[],
 "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "late" BOOLEAN NOT NULL,
 CONSTRAINT "AssignmentVersion_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AssignmentVersion_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "AssignmentSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssignmentVersion_submissionId_version_key" ON "AssignmentVersion"("submissionId", "version");
-- Submitted snapshots are append-only, including during later correction requests.
CREATE FUNCTION qms_guard_assignment_version() RETURNS trigger LANGUAGE plpgsql AS U&'BEGIN RAISE EXCEPTION ''Submitted assignment versions are immutable'' USING ERRCODE = ''23514''\003B END\003B';
CREATE TRIGGER "AssignmentVersion_immutable" BEFORE UPDATE OR DELETE ON "AssignmentVersion" FOR EACH ROW EXECUTE FUNCTION qms_guard_assignment_version();

-- Released grades cannot be silently rewritten. Marks must fit the published brief.
CREATE FUNCTION qms_guard_assignment_grade() RETURNS trigger LANGUAGE plpgsql AS U&'BEGIN
 IF TG_OP = ''UPDATE'' AND OLD."releasedAt" IS NOT NULL THEN RAISE EXCEPTION ''Released assignment grades are immutable'' USING ERRCODE = ''23514''\003B END IF\003B
 IF NEW."grade" > (SELECT "maxMarks" FROM "Assignment" WHERE "id" = NEW."assignmentId") THEN RAISE EXCEPTION ''Assignment grade exceeds maximum marks'' USING ERRCODE = ''23514''\003B END IF\003B
 RETURN NEW\003B
END\003B';
CREATE TRIGGER "AssignmentSubmission_grade_guard" BEFORE INSERT OR UPDATE ON "AssignmentSubmission" FOR EACH ROW EXECUTE FUNCTION qms_guard_assignment_grade();
