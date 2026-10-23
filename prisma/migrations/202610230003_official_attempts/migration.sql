-- Official one-attempt-per-student assessment ledger.
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');
CREATE TABLE "Attempt" (
  "id" TEXT NOT NULL,
  "quizId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "earnedMarks" INTEGER,
  "maxMarks" INTEGER,
  CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Attempt_revision_nonnegative" CHECK ("revision" >= 0),
  CONSTRAINT "Attempt_submitted_consistency" CHECK (
    ("status" = 'IN_PROGRESS' AND "submittedAt" IS NULL AND "earnedMarks" IS NULL AND "maxMarks" IS NULL)
    OR ("status" = 'SUBMITTED' AND "submittedAt" IS NOT NULL AND "earnedMarks" IS NOT NULL AND "maxMarks" IS NOT NULL
        AND "earnedMarks" >= 0 AND "maxMarks" >= "earnedMarks")
  )
);
CREATE UNIQUE INDEX "Attempt_quizId_userId_key" ON "Attempt"("quizId","userId");
CREATE UNIQUE INDEX "Attempt_id_quizId_key" ON "Attempt"("id","quizId");
CREATE INDEX "Attempt_quizId_status_idx" ON "Attempt"("quizId","status");
CREATE INDEX "Attempt_userId_submittedAt_idx" ON "Attempt"("userId","submittedAt");
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Question_id_quizId_key" ON "Question"("id","quizId");

CREATE TABLE "AttemptAnswer" (
  "attemptId" TEXT NOT NULL,
  "quizId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "selectedOptionId" TEXT,
  "awardedMarks" INTEGER,
  CONSTRAINT "AttemptAnswer_pkey" PRIMARY KEY ("attemptId","questionId"),
  CONSTRAINT "AttemptAnswer_awarded_nonnegative" CHECK ("awardedMarks" IS NULL OR "awardedMarks" >= 0)
);
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Composite ownership boundaries prevent mixing answers from other quizzes.
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_same_quiz_attempt_fkey" FOREIGN KEY ("attemptId","quizId") REFERENCES "Attempt"("id","quizId") ON DELETE CASCADE;
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_same_quiz_question_fkey" FOREIGN KEY ("questionId","quizId") REFERENCES "Question"("id","quizId") ON DELETE RESTRICT;
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_option_membership_fkey" FOREIGN KEY ("questionId","selectedOptionId") REFERENCES "Option"("questionId","id") ON DELETE RESTRICT;

-- Submitted snapshots cannot be rewritten even through direct SQL.
CREATE FUNCTION qms_guard_attempt_answer() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE current_status "AttemptStatus";
BEGIN
  SELECT "status" INTO current_status FROM "Attempt"
    WHERE "id" = CASE WHEN TG_OP = 'INSERT' THEN NEW."attemptId" ELSE OLD."attemptId" END
    FOR UPDATE;
  IF current_status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Submitted attempts are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."attemptId" IS DISTINCT FROM OLD."attemptId" THEN
    RAISE EXCEPTION 'Cannot transfer assessment answers' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AttemptAnswer_guard" BEFORE INSERT OR UPDATE OR DELETE ON "AttemptAnswer"
  FOR EACH ROW EXECUTE FUNCTION qms_guard_attempt_answer();
CREATE FUNCTION qms_guard_attempt() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'SUBMITTED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Submitted attempt is immutable' USING ERRCODE = '23514';
  END IF;
  IF ROW(NEW."id",NEW."quizId",NEW."userId",NEW."startedAt") IS DISTINCT FROM
     ROW(OLD."id",OLD."quizId",OLD."userId",OLD."startedAt") THEN
    RAISE EXCEPTION 'Attempt ownership is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Attempt_guard" BEFORE UPDATE ON "Attempt"
  FOR EACH ROW EXECUTE FUNCTION qms_guard_attempt();
