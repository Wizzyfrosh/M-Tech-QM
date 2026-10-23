-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReviewMode" AS ENUM ('AFTER_SUBMISSION', 'AFTER_CLOSE', 'INSTRUCTOR_RELEASE');

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "shareSlug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lessonLabel" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "lessonUrl" TEXT,
    "deadline" TIMESTAMP(3),
    "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "reviewMode" "ReviewMode" NOT NULL DEFAULT 'AFTER_CLOSE',
    "leaderboardEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reviewReleasedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL DEFAULT '',
    "explanation" TEXT NOT NULL DEFAULT '',
    "marks" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerKey" (
    "questionId" TEXT NOT NULL,
    "correctOptionId" TEXT NOT NULL,

    CONSTRAINT "AnswerKey_pkey" PRIMARY KEY ("questionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_shareSlug_key" ON "Quiz"("shareSlug");

-- CreateIndex
CREATE INDEX "Quiz_status_createdAt_idx" ON "Quiz"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Quiz_createdBy_createdAt_idx" ON "Quiz"("createdBy", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Question_quizId_position_key" ON "Question"("quizId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Option_questionId_position_key" ON "Option"("questionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Option_questionId_id_key" ON "Option"("questionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerKey_correctOptionId_key" ON "AnswerKey"("correctOptionId");

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerKey" ADD CONSTRAINT "AnswerKey_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerKey" ADD CONSTRAINT "AnswerKey_correctOptionId_fkey" FOREIGN KEY ("correctOptionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Keep answer keys bound to an option from the same question.
ALTER TABLE "AnswerKey" ADD CONSTRAINT "AnswerKey_same_question_fkey"
  FOREIGN KEY ("questionId", "correctOptionId") REFERENCES "Option"("questionId", "id") ON DELETE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_marks_range" CHECK ("marks" BETWEEN 1 AND 10);
ALTER TABLE "Question" ADD CONSTRAINT "Question_position_range" CHECK ("position" BETWEEN 0 AND 49);
ALTER TABLE "Option" ADD CONSTRAINT "Option_position_range" CHECK ("position" BETWEEN 0 AND 3);
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_revision_nonnegative" CHECK ("revision" >= 0);

-- Lock the parent row before any content mutation, including direct database writes.
CREATE FUNCTION qms_require_draft(quiz_id TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE current_status "QuizStatus";
BEGIN
 SELECT "status" INTO current_status FROM "Quiz" WHERE "id" = quiz_id FOR UPDATE;
 IF current_status IS NOT NULL AND current_status <> 'DRAFT' THEN
   RAISE EXCEPTION 'Published quiz content is immutable' USING ERRCODE = '23514';
 END IF;
END $$;
CREATE FUNCTION qms_guard_content() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE old_quiz TEXT; new_quiz TEXT;
BEGIN
 IF TG_TABLE_NAME = 'Question' THEN
   IF TG_OP <> 'INSERT' THEN old_quiz := to_jsonb(OLD)->>'quizId'; END IF;
   IF TG_OP <> 'DELETE' THEN new_quiz := to_jsonb(NEW)->>'quizId'; END IF;
 ELSE
   IF TG_OP <> 'INSERT' THEN SELECT "quizId" INTO old_quiz FROM "Question" WHERE "id" = to_jsonb(OLD)->>'questionId'; END IF;
   IF TG_OP <> 'DELETE' THEN SELECT "quizId" INTO new_quiz FROM "Question" WHERE "id" = to_jsonb(NEW)->>'questionId'; END IF;
 END IF;
 IF old_quiz IS NOT NULL THEN PERFORM qms_require_draft(old_quiz); END IF;
 IF new_quiz IS NOT NULL AND new_quiz IS DISTINCT FROM old_quiz THEN PERFORM qms_require_draft(new_quiz); END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Question_draft_only" BEFORE INSERT OR UPDATE OR DELETE ON "Question" FOR EACH ROW EXECUTE FUNCTION qms_guard_content();
CREATE TRIGGER "Option_draft_only" BEFORE INSERT OR UPDATE OR DELETE ON "Option" FOR EACH ROW EXECUTE FUNCTION qms_guard_content();
CREATE TRIGGER "AnswerKey_draft_only" BEFORE INSERT OR UPDATE OR DELETE ON "AnswerKey" FOR EACH ROW EXECUTE FUNCTION qms_guard_content();
CREATE FUNCTION qms_guard_quiz() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
   IF OLD."status" <> 'DRAFT' THEN RAISE EXCEPTION 'Published quizzes must be archived' USING ERRCODE = '23514'; END IF;
   RETURN OLD;
 END IF;
 IF OLD."status" <> 'DRAFT' THEN
   IF ROW(NEW."id", NEW."shareSlug", NEW."title", NEW."lessonLabel", NEW."description", NEW."lessonUrl", NEW."reviewMode", NEW."createdBy", NEW."publishedAt") IS DISTINCT FROM
      ROW(OLD."id", OLD."shareSlug", OLD."title", OLD."lessonLabel", OLD."description", OLD."lessonUrl", OLD."reviewMode", OLD."createdBy", OLD."publishedAt") THEN
     RAISE EXCEPTION 'Published quiz content is immutable' USING ERRCODE = '23514';
   END IF;
   IF NEW."status" = 'DRAFT' OR (OLD."status" = 'CLOSED' AND NEW."status" = 'PUBLISHED') OR (OLD."status" = 'ARCHIVED' AND NEW."status" <> 'ARCHIVED') THEN
     RAISE EXCEPTION 'A published or closed quiz cannot be reopened as a draft' USING ERRCODE = '23514';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Quiz_content_immutable" BEFORE UPDATE OR DELETE ON "Quiz" FOR EACH ROW EXECUTE FUNCTION qms_guard_quiz();
