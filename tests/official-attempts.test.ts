import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { applyTestMigrations } from "../scripts/test-migrations";
import { createQuiz, actOnQuiz, getQuizEditor } from "../src/lib/quizzes";
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
  const pool = new Pool({ connectionString: url, max: lite ? 1 : 5 });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await applyTestMigrations(pool);
  // Keep the migrated connection: closing/reopening it races PGlite socket cleanup.
  db = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
  for (const role of ["INSTRUCTOR", "STUDENT", "STUDENT"] as const) {
    const id = crypto.randomUUID();
    const email = `assessment-${id}@example.test`;
    await db.user.create({ data: { id, name: role, email, role, emailVerified: true } });
    if (role === "INSTRUCTOR") { owner = id; continue; }
    await db.rosterEntry.create({ data: { normalizedEmail: email, name: role, userId: id, status: "ACTIVE" } });
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
  await actOnQuiz(db, owner, quizId, 0, "publish");
  slug = (await getQuizEditor(db, quizId, owner)).shareSlug;
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

// Real PostgreSQL only: PGlite's single connection cannot measure row-lock contention.
it.skipIf(!process.env.TEST_DATABASE_URL)("runs a 25-student concurrency pilot within a 100-student synthetic roster", async () => {
  const users = Array.from({ length: 100 }, (_, index) => ({
    id: crypto.randomUUID(), name: `Pilot student ${index}`, email: `pilot-${index}@example.test`,
    role: "STUDENT" as const, emailVerified: true,
  }));
  await db.user.createMany({ data: users });
  await db.rosterEntry.createMany({ data: users.map(user => ({
    normalizedEmail: user.email, name: user.name, userId: user.id, status: "ACTIVE" as const,
  })) });
  const quiz = await createQuiz(db, owner, { ...blankQuiz(), title: "Synthetic concurrency pilot", lessonLabel: "Reliability",
    questions: [{ prompt: "Which is two plus two?", explanation: "Two plus two is four.", marks: 3,
      reviewed: true, correctIndex: 0, options: ["4", "3", "2", "1"] }] });
  await actOnQuiz(db, owner, quiz.id, 0, "publish");
  const editor = await getQuizEditor(db, quiz.id, owner);
  const question = await db.question.findFirstOrThrow({ where: { quizId: quiz.id }, include: { options: true } });
  const selection = [{ questionId: question.id, selectedOptionId: question.options.find(option => option.text === "4")!.id }];
  const timings: Record<string, number[]> = { start: [], save: [], submit: [] };
  async function measure<T>(operation: string, work: () => Promise<T>): Promise<T> {
    const start = performance.now(); const result = await work();
    timings[operation].push(performance.now() - start); return result;
  }
  const active = users.slice(0, 25);
  const attempts = await Promise.all(active.map(user => measure("start", () => startAttempt(db, user.id, "STUDENT", editor.shareSlug))));
  const saved = await Promise.all(attempts.map((attempt, index) => measure("save", () => saveAnswers(db, attempt.id, active[index].id, "STUDENT", 0, selection))));
  const acknowledged = await db.attemptAnswer.findMany({ where: { attemptId: { in: attempts.map(attempt => attempt.id) } } });
  expect(acknowledged).toHaveLength(25);
  expect(acknowledged.every(answer => answer.selectedOptionId === selection[0].selectedOptionId)).toBe(true);
  const stale = await Promise.allSettled(attempts.map((attempt, index) => saveAnswers(db, attempt.id, active[index].id, "STUDENT", 0, [])));
  expect(stale.every(result => result.status === "rejected" && result.reason.status === 409)).toBe(true);
  // Simulate double taps / a replay after a lost submission response.
  const results = await Promise.all(attempts.flatMap((attempt, index) => [0, 1].map(() => measure("submit", () =>
    submitAttempt(db, attempt.id, active[index].id, "STUDENT", saved[index].revision, selection)))));
  expect(results).toHaveLength(50);
  expect(results.every(result => result.status === "SUBMITTED" && result.earnedMarks === 3 && result.maxMarks === 3)).toBe(true);
  expect(await db.attempt.count({ where: { quizId: quiz.id, status: "SUBMITTED" } })).toBe(25);
  expect(await db.attemptAnswer.count({ where: { quizId: quiz.id, awardedMarks: 3 } })).toBe(25);
  const summary = Object.fromEntries(Object.entries(timings).map(([operation, values]) => {
    const ordered = values.toSorted((a, b) => a - b);
    return [operation, { requests: values.length, p50Ms: Math.round(ordered[Math.ceil(values.length * 0.5) - 1]),
      p95Ms: Math.round(ordered[Math.ceil(values.length * 0.95) - 1]), maxMs: Math.round(ordered.at(-1)!) }];
  }));
  console.info("QMS_SYNTHETIC_DATABASE_PILOT", JSON.stringify({ roster: 100, active: 25, duplicateResults: 0, lostAcknowledgedAnswers: 0, operations: summary }));
}, 60000);
