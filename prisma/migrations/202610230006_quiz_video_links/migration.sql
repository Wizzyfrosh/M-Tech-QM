ALTER TABLE "Quiz" ADD COLUMN "lessonUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "Quiz"
SET "lessonUrls" = ARRAY["lessonUrl"]
WHERE "lessonUrl" IS NOT NULL AND length(trim("lessonUrl")) > 0;