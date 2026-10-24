import "server-only";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { AccessError } from "./access";
import { requestGemini } from "./ai-gemini";
import { aiProviderConfig, fromChatCompletions, type AiProvider } from "./ai-providers";
import { AiProviderError } from "./ai-errors";

const DAILY_LIMIT = 10;

async function reserve(
  db: PrismaClient,
  instructorId: string,
  quizId: string,
  count: number,
  model: string,
) {
  return db.$transaction(async tx => {
    const quiz = await tx.quiz.findFirst({
      where: { id: quizId, createdBy: instructorId },
      select: { id: true, status: true },
    });
    if (!quiz) throw new AccessError(404, "Quiz not found.");
    if (quiz.status !== "DRAFT")
      throw new AccessError(409, "AI drafts can only be added to unpublished quizzes.");
    const today = new Date();
    const key = `ai-generation:${instructorId}:${today.toISOString().slice(0, 10)}`;
    const midnight = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
    const quota = await tx.$queryRaw<{ count: number }[]>`
      INSERT INTO "RequestBucket" ("key", "count", "expiresAt")
      VALUES (${key}, 1, ${midnight})
      ON CONFLICT ("key") DO UPDATE
        SET "count" = "RequestBucket"."count" + 1
      WHERE "RequestBucket"."count" < ${DAILY_LIMIT}
      RETURNING "count"
    `;
    if (!quota.length) throw new AccessError(429, "Daily AI draft limit reached. Manual editing remains available.");
    return tx.aiGeneration.create({
      data: { id: randomUUID(), instructorId, quizId, count, model, status: "STARTED" },
      select: { id: true },
    });
  }, { timeout: 15000 });
}

export async function generateQuizDrafts(
  db: PrismaClient,
  actorId: string,
  quizId: string,
  input: { transcript: string; count: number; difficulty: "beginner"|"intermediate"|"advanced"; provider?: "auto"|"gemini"|"openrouter"|"grok" },
  fetcher: typeof fetch = fetch,
) {
  // Never send course content to an unconfigured provider.
  const preferred: AiProvider[] = input.provider && input.provider !== "auto"
    ? [input.provider]
    : ["gemini","openrouter","grok"];
  const configured = preferred.filter(provider => !!aiProviderConfig(provider).key);
  if (!configured.length) throw new AccessError(503, "No AI providers configured. Add a server-side Gemini, OpenRouter, or xAI key.");
  const record = await reserve(db, actorId, quizId, input.count, configured[0]);
  try {
    let finalError: unknown;
    const failures: string[] = [];
    for(const provider of configured){
      try {
        const result = provider === "gemini"
          ? { ...await requestGemini(input.transcript,input.count,input.difficulty,aiProviderConfig(provider).key!,fetcher), provider }
          : await fromChatCompletions(provider,input.transcript,input.count,input.difficulty,fetcher);
        await db.aiGeneration.update({where:{id:record.id},data:{
          status:"SUCCEEDED",completedAt:new Date(),model:provider+":"+result.model,
          inputTokens:result.inputTokens,outputTokens:result.outputTokens,
        }});
        return {questions:result.questions,provider,model:result.model,generatedCount:result.questions.length,reviewRequired:true};
      } catch(error) {
        finalError=error;
        failures.push(error instanceof AccessError ? error.message : `${provider}: generation failed.`);
        console.warn("QMS_AI_PROVIDER_FAILED", {
          provider,
          code: error instanceof AiProviderError ? error.code : error instanceof AccessError && error.status === 422 ? "OUTPUT_INVALID" : "UNEXPECTED",
        });
        // Unsupported content or badly-grounded output should be reviewed, not automatically sent to another provider.
        if(!(error instanceof AccessError) || error.status !== 503 || (input.provider && input.provider !== "auto")) break;
      }
    }
    if (finalError instanceof AccessError && finalError.status === 503 && failures.length > 1)
      throw new AccessError(503, `No configured AI provider could finish. ${failures.join(" ")} Your quiz is unchanged.`);
    if(finalError instanceof AccessError)throw finalError;
    throw new AccessError(503, "AI draft generation failed. Your quiz remains unchanged.");
  } catch(error) {
    await db.aiGeneration.update({where:{id:record.id},data:{status:"FAILED",completedAt:new Date()}});
    if(error instanceof AccessError)throw error;
    throw new AccessError(503, "AI draft generation failed. You can continue manually.");
  }
}
