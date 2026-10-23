import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { applyTestMigrations } from "../scripts/test-migrations";
import { aiDraftRequestSchema, validateGeneratedQuestions } from "../src/lib/ai-quiz-policy";
import { generateQuizDrafts } from "../src/lib/ai-quiz";

const transcript = (
  "In JavaScript, const declares a block-scoped binding that cannot be reassigned. " +
  "The let keyword declares a block-scoped binding that can be reassigned. " +
  "The var keyword is function-scoped rather than block-scoped. " +
  "An array stores an ordered collection of values. "
).repeat(2);
const excerpt = "const declares a block-scoped binding that cannot be reassigned";
const generatedQuestion = {
  prompt: "Which JavaScript declaration cannot be reassigned?",
  options: ["const", "let", "var", "function"],
  correctIndex: 0,
  explanation: "The const keyword creates a binding that cannot be reassigned.",
  sourceExcerpt: excerpt,
};
const providerPayload = { candidates: [{ content: { parts: [{ text: JSON.stringify({
  questions: [generatedQuestion],
}) }] } }], usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 80 } };

let db: PrismaClient;
let lite: PGlite | undefined, socket: PGLiteSocketServer | undefined;
let instructorId = "", quizId = "";
const fakeFetch = (async () => Response.json(providerPayload)) as typeof fetch;

beforeAll(async () => {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    lite = await PGlite.create();
    socket = new PGLiteSocketServer({ db: lite, host: "127.0.0.1", port: 55446 });
    await socket.start();
    url = "postgresql://postgres:postgres@127.0.0.1:55446/postgres";
  } else {
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test"))
      throw new Error("AI tests require an isolated local _test database");
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await applyTestMigrations(pool);
  await pool.end();
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: lite ? 1 : 5 }) });
  instructorId = crypto.randomUUID();
  await db.user.create({ data: { id: instructorId, name: "AI Test Instructor",
    email: "ai-instructor@example.test", role: "INSTRUCTOR", emailVerified: true } });
  const quiz = await db.quiz.create({ data: {
    title: "AI draft sandbox", lessonLabel: "JavaScript", createdBy: instructorId,
  } });
  quizId = quiz.id;
}, 60000);

afterAll(async () => {
  delete process.env.GEMINI_API_KEY;
  await db?.$disconnect();
  await socket?.stop();
  await new Promise(resolve => setTimeout(resolve, 50));
  await lite?.close();
});

describe("AI transcript question generation", () => {
  it("validates the input, exact output count, four distinct options and source grounding", () => {
    expect(aiDraftRequestSchema.safeParse({ transcript, count: 1, difficulty: "beginner" }).success).toBe(true);
    expect(aiDraftRequestSchema.safeParse({ transcript: "too short", count: 1, difficulty: "beginner" }).success).toBe(false);
    expect(aiDraftRequestSchema.safeParse({ transcript, count: 21, difficulty: "beginner" }).success).toBe(false);
    expect(validateGeneratedQuestions({ questions: [generatedQuestion] }, transcript, 1)).toHaveLength(1);
    expect(() => validateGeneratedQuestions({ questions: [generatedQuestion] }, transcript, 2)).toThrow("AI_OUTPUT_INVALID");
    expect(() => validateGeneratedQuestions({ questions: [{ ...generatedQuestion, sourceExcerpt: "unrelated fabricated claim" }] }, transcript, 1)).toThrow("AI_OUTPUT_INVALID");
    expect(() => validateGeneratedQuestions({ questions: [{ ...generatedQuestion, options: ["const", "const", "var", "let"] }] }, transcript, 1)).toThrow("AI_OUTPUT_INVALID");
  });
  it("requires configured server-only key before using the provider", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(generateQuizDrafts(db, instructorId, quizId,
      { transcript, count: 1, difficulty: "beginner" }, fakeFetch)).rejects.toMatchObject({ status: 503 });
    expect(await db.aiGeneration.count()).toBe(0);
  });
  it("blocks edits to foreign or published quizzes even with a valid key", async () => {
    process.env.GEMINI_API_KEY = "synthetic-test-key";
    await expect(generateQuizDrafts(db, crypto.randomUUID(), quizId,
      { transcript, count: 1, difficulty: "beginner" }, fakeFetch)).rejects.toMatchObject({ status: 404 });
    await db.quiz.update({ where: { id: quizId }, data: { status: "PUBLISHED" } });
    await expect(generateQuizDrafts(db, instructorId, quizId,
      { transcript, count: 1, difficulty: "beginner" }, fakeFetch)).rejects.toMatchObject({ status: 409 });
    await db.quiz.update({ where: { id: quizId }, data: { status: "DRAFT" } });
  });
  it("records token usage but never stores transcript, and limits daily consumption", async () => {
    process.env.GEMINI_API_KEY = "synthetic-test-key";
    for (let i=0; i<10; i++) {
      const result = await generateQuizDrafts(db, instructorId, quizId,
        { transcript, count: 1, difficulty: "intermediate" }, fakeFetch);
      expect(result.questions[0].correctIndex).toBe(0);
      expect(result.reviewRequired).toBe(true);
    }
    const rows = await db.aiGeneration.findMany();
    expect(rows).toHaveLength(10);
    expect(rows.every(row => row.status==="SUCCEEDED" && row.inputTokens===200 && row.outputTokens===80)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("block-scoped binding");
    await expect(generateQuizDrafts(db, instructorId, quizId,
      { transcript, count: 1, difficulty: "beginner" }, fakeFetch)).rejects.toMatchObject({ status: 429 });
  });
});
