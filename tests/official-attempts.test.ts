import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { applyTestMigrations } from "../scripts/test-migrations";
import { createQuiz, saveQuiz, actOnQuiz } from "../src/lib/quizzes";
import { blankQuiz } from "../src/lib/quiz-policy";
import { startAttempt, getAttempt, saveAnswers, submitAttempt, attemptResult, studentHistory } from "../src/lib/attempts";

let db: PrismaClient;
let lite: PGlite | undefined;
let socket: PGLiteSocketServer | undefined;
let owner = "";
let student = "";
let otherStudent = "";
let quizId = "";
let slug = "";
let firstQuestion = "";
let firstOption = "";
const driverPort = 55439;

beforeAll(async () => {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    lite = await PGlite.create();
    socket = new PGLiteSocketServer({ db: lite, host: "127.0.0.1", port: driverPort });
    await socket.start();
    url = `postgresql://postgres:postgres@127.0.0.1:${driverPort}/postgres`;
  } else {
    const parsed = new URL(url);
    if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test"))
      throw new Error("Tests require an isolated local _test database.");
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await applyTestMigrations(pool);
  await pool.end();
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: lite ? 1 : 5 }) });
  for (const role of ["INSTRUCTOR", "STUDENT", "STUDENT"] as const) {
    const id = crypto.randomUUID();
    const email = `assessment-${id}@example.test`;
    await db.user.create({ data: { id, name: role, email, role, emailVerified: true } });
    if (role === "INSTRUCTOR") { owner = id; continue; }
    await db.rosterEntry.create({ data: { normalizedEmail: email, name: role, userId: id } });
    if (!student) student = id; else otherStudent = id;
  }
  const draft = {
    ...blankQuiz(), title: "Secure JavaScript assessment", lessonLabel: "JS Fundamentals",
    questions: [{ prompt: "Which declaration prevents reassignment?",
      explanation: "Const prevents rebinding.", marks: 3, reviewed: true, correctIndex: 0,
      options: ["const", "let", "var", "none"] }],
  };
  const row = await createQuiz(db, owner, draft);
  quizId = row.id;
  const published = await actOnQuiz(db, owner, quizId, 0, "publish");
  slug = published.shareSlug;
  const question = await db.question.findFirstOrThrow({ where: { quizId }, include: { options: true } });
  firstQuestion = question.id;
  firstOption = question.options.find(o => o.text === "const")!.id;
}, 60000);
afterAll(async () => {
  await db?.$disconnect();
  await socket?.stop();
  await new Promise(resolve => setTimeout(resolve, 50));
  await lite?.close();
});

describe("official assessment lifecycle", () => {
  it("resumes one attempt and never discloses answer keys while in progress", async () => {
    const first = await startAttempt(db, student, "STUDENT", slug);
    const repeated = await startAttempt(db, student, "STUDENT", slug);
    expect(first.id).toBe(repeated.id);
    const payload = await getAttempt(db, first.id, student, "STUDENT");
    expect(payload.questions).toHaveLength(1);
    expect(JSON.stringify(payload)).not.toContain("correctOptionId");
    expect(JSON.stringify(payload)).not.toContain("Const prevents rebinding");
    expect(await db.attempt.count({ where: { quizId, userId: student } })).toBe(1);
  });
  it("blocks other users, invalid selections and stale writes", async () => {
    const { id } = await startAttempt(db, student, "STUDENT", slug);
    await expect(getAttempt(db, id, otherStudent, "STUDENT")).rejects.toMatchObject({ status: 404 });
    await expect(startAttempt(db, owner, "INSTRUCTOR", slug)).rejects.toMatchObject({ status: 403 });
    await expect(saveAnswers(db, id, student, "STUDENT", 0, [{ questionId: firstQuestion, selectedOptionId: crypto.randomUUID() }]))
      .rejects.toMatchObject({ status: 400 });
    const saved = await saveAnswers(db, id, student, "STUDENT", 0, [{ questionId: firstQuestion, selectedOptionId: firstOption }]);
    expect(saved.revision).toBe(1);
    await expect(saveAnswers(db, id, student, "STUDENT", 0, [])).rejects.toMatchObject({ status: 409 });
    const resumed = await getAttempt(db, id, student, "STUDENT");
    expect(resumed.answers).toEqual([{ questionId: firstQuestion, selectedOptionId: firstOption }]);
  });
  it("grades on the server, locks submission and replays the same result", async () => {
    const { id } = await startAttempt(db, student, "STUDENT", slug);
    const finished = await submitAttempt(db, id, student, "STUDENT", 1, [{ questionId: firstQuestion, selectedOptionId: firstOption }]);
    expect(finished).toMatchObject({ earnedMarks: 3, maxMarks: 3, status: "SUBMITTED" });
    const replay = await submitAttempt(db, id, student, "STUDENT", 0, []);
    expect(replay.earnedMarks).toBe(3);
    await expect(saveAnswers(db, id, student, "STUDENT", 2, [])).rejects.toMatchObject({ status: 409 });
    const hidden = await attemptResult(db, id, student, "STUDENT");
    expect(hidden.reviewAvailable).toBe(false);
    expect(JSON.stringify(hidden)).not.toContain("correctOptionId");
    expect(JSON.stringify(hidden)).not.toContain("Const prevents rebinding");
    const history = await studentHistory(db, student, "STUDENT", 1);
    expect(history.total).toBe(1);
    expect(history.attempts[0].earnedMarks).toBe(3);
    await expect(attemptResult(db, id, otherStudent, "STUDENT")).rejects.toMatchObject({ status: 404 });
  });
  it("rejects fresh attempts after closure but keeps the submitted grade", async () => {
    const current = await db.quiz.findUniqueOrThrow({ where: { id: quizId } });
    await actOnQuiz(db, owner, quizId, current.revision, "close");
    await expect(startAttempt(db, otherStudent, "STUDENT", slug)).rejects.toMatchObject({ status: 409 });
    const existing = await startAttempt(db, student, "STUDENT", slug);
    expect(existing.status).toBe("SUBMITTED");
    const disclosed = await attemptResult(db, existing.id, student, "STUDENT");
    expect(disclosed.reviewAvailable).toBe(true);
    expect(disclosed.questions?.[0].correctOptionId).toBe(firstOption);
  });
});
