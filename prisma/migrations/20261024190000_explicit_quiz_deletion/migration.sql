CREATE OR REPLACE FUNCTION qms_guard_quiz() RETURNS TRIGGER LANGUAGE plpgsql AS U&'
BEGIN
 IF TG_OP = ''DELETE'' AND current_setting(''qms.deleting_quiz'', true) = OLD.id THEN RETURN OLD\003B END IF\003B
 IF TG_OP = ''DELETE'' THEN
   IF OLD."status" <> ''DRAFT'' THEN RAISE EXCEPTION ''Published quizzes must be archived'' USING ERRCODE = ''23514''\003B END IF\003B
   RETURN OLD\003B
 END IF\003B
 IF OLD."status" <> ''DRAFT'' THEN
   IF ROW(NEW."id", NEW."shareSlug", NEW."title", NEW."lessonLabel", NEW."description", NEW."lessonUrl", NEW."reviewMode", NEW."createdBy", NEW."publishedAt") IS DISTINCT FROM
      ROW(OLD."id", OLD."shareSlug", OLD."title", OLD."lessonLabel", OLD."description", OLD."lessonUrl", OLD."reviewMode", OLD."createdBy", OLD."publishedAt") THEN
     RAISE EXCEPTION ''Published quiz content is immutable'' USING ERRCODE = ''23514''\003B
   END IF\003B
   IF NEW."status" = ''DRAFT'' OR (OLD."status" = ''CLOSED'' AND NEW."status" = ''PUBLISHED'') OR (OLD."status" = ''ARCHIVED'' AND NEW."status" <> ''ARCHIVED'') THEN
     RAISE EXCEPTION ''A published or closed quiz cannot be reopened as a draft'' USING ERRCODE = ''23514''\003B
   END IF\003B
 END IF\003B
 RETURN NEW\003B
END ';

CREATE OR REPLACE FUNCTION qms_guard_attempt_answer() RETURNS TRIGGER LANGUAGE plpgsql AS U&'
DECLARE current_status "AttemptStatus"\003B
BEGIN
  IF TG_OP = ''DELETE'' AND current_setting(''qms.deleting_quiz'', true) = OLD."quizId" THEN RETURN OLD\003B END IF\003B
  SELECT "status" INTO current_status FROM "Attempt"
    WHERE "id" = CASE WHEN TG_OP = ''INSERT'' THEN NEW."attemptId" ELSE OLD."attemptId" END
    FOR UPDATE\003B
  IF current_status <> ''IN_PROGRESS'' THEN
    RAISE EXCEPTION ''Submitted attempts are immutable'' USING ERRCODE = ''23514''\003B
  END IF\003B
  IF TG_OP = ''UPDATE'' AND NEW."attemptId" IS DISTINCT FROM OLD."attemptId" THEN
    RAISE EXCEPTION ''Cannot transfer assessment answers'' USING ERRCODE = ''23514''\003B
  END IF\003B
  IF TG_OP = ''DELETE'' THEN RETURN OLD\003B END IF\003B
  RETURN NEW\003B
END ';
