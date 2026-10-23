-- Audit generation requests without retaining source transcripts or generated answer keys.
CREATE TABLE "AiGeneration" (
  "id" TEXT NOT NULL,
  "instructorId" TEXT NOT NULL,
  "quizId" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'STARTED',
  "count" INTEGER NOT NULL,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AiGeneration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiGeneration_status_valid" CHECK ("status" IN ('STARTED', 'SUCCEEDED', 'FAILED')),
  CONSTRAINT "AiGeneration_count_valid" CHECK ("count" BETWEEN 1 AND 20),
  CONSTRAINT "AiGeneration_tokens_valid" CHECK (("inputTokens" IS NULL OR "inputTokens" >= 0) AND ("outputTokens" IS NULL OR "outputTokens" >= 0))
);
CREATE INDEX "AiGeneration_instructorId_createdAt_idx" ON "AiGeneration"("instructorId", "createdAt");
CREATE INDEX "AiGeneration_quizId_createdAt_idx" ON "AiGeneration"("quizId", "createdAt");
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
