import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { applyTestMigrations } from "../scripts/test-migrations";
import { createQuiz, actOnQuiz, getQuizEditor } from "../src/lib/quizzes";
import { blankQuiz } from "../src/lib/quiz-policy";
import { startAttempt, submitAttempt } from "../src/lib/attempts";
import { csvCell, scorePercent } from "../src/lib/report-policy";
import { instructorQuizReport, instructorResultsCsv, quizLeaderboard, reportList, ownedReportQuiz } from "../src/lib/reports";

let db: PrismaClient;
let lite: PGlite | undefined;
let socket: PGLiteSocketServer | undefined;
let instructorId: string, studentId: string, optOutId: string, quizId: string, slug: string;
let questionId: string, correctOption: string;
beforeAll(async () => {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    lite = await PGlite.create();
    socket = new PGLiteSocketServer({ db: lite, host: "127.0.0.1", port: 55445 });
    await socket.start();
    url = "postgresql://postgres:postgres@127.0.0.1:55445/postgres";
  } else {
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test"))
      throw new Error("Use only an isolated local _test database.");
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await applyTestMigrations(pool);
  await pool.end();
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: lite ? 1 : 5 }) });
  for (const name of ["INSTRUCTOR", "STUDENT", "STUDENT"] as const) {
    const id = crypto.randomUUID(), email = `report-${id}@example.test`;
    await db.user.create({ data: { id, name: name === "INSTRUCTOR" ? "Instructor" :
      instructorId ? 'Normal Student' : 'Student', email, role: name, emailVerified: true } });
    if (name === "INSTRUCTOR") { instructorId = id; continue; }
    await db.rosterEntry.create({ data: { name: "Student", normalizedEmail: email, userId: id, status: "ACTIVE" } });
    if (!studentId) studentId = id;
    else { optOutId = id; await db.user.update({ where: { id }, data: { leaderboardOptOut: true } }); }
  }
  const draft = { ...blankQuiz(), title: "Results quiz", lessonLabel: "Testing", questions: [{
    prompt: "Answer one?", options: ["yes", "no", "maybe", "never"],
    explanation: "yes is correct", marks: 4, correctIndex: 0, reviewed: true,
  }] };
  const created = await createQuiz(db, instructorId, draft);
  quizId = created.id;
  await actOnQuiz(db, instructorId, quizId, 0, "publish");
  slug = (await getQuizEditor(db, quizId, instructorId)).shareSlug;
  const question = await db.question.findFirstOrThrow({
    where: { quizId }, include: { options: true },
  });
  questionId = question.id;
  correctOption = question.options.find(o => o.text === "yes")!.id;
}, 60000);
afterAll(async () => {
  await db?.$disconnect();
  await socket?.stop();
  await new Promise(resolve => setTimeout(resolve, 50));
  await lite?.close();
});
describe("instructor reports, CSV and leaderboard privacy", () => {
  it("escapes spreadsheet formulas and handles grades", () => {
    expect(csvCell(" =HYPERLINK(\"bad\")")).toBe('"\' =HYPERLINK(""bad"")"');
    expect(csvCell("+1+2")).toBe('"\'+1+2"');
    expect(csvCell("student\nname")).toBe('"student name"');
    expect(scorePercent(3, 4)).toBe(75);
    expect(scorePercent(null, 4)).toBeNull();
  });
  it("restricts instructor reports and locks early leaderboards", async () => {
    await expect(ownedReportQuiz(db, quizId, studentId)).rejects.toMatchObject({ status: 404 });
    await expect(quizLeaderboard(db, slug, { id: studentId, role: "STUDENT" }))
      .rejects.toMatchObject({ status: 409 });
    const before = await instructorQuizReport(db, quizId, instructorId, 1);
    expect(before.submitted).toBe(0);
    expect(before.activeStudents).toBe(2);
    expect((await reportList(db, instructorId, 1)).quizzes).toHaveLength(1);
  });
  it("grades multiple students and counts question correctness", async () => {
    const first = await startAttempt(db, studentId, "STUDENT", slug);
    const second = await startAttempt(db, optOutId, "STUDENT", slug);
    await submitAttempt(db, first.id, studentId, "STUDENT", 0,
      [{ questionId, selectedOptionId: correctOption }]);
    await submitAttempt(db, second.id, optOutId, "STUDENT", 0, []);
    const report = await instructorQuizReport(db, quizId, instructorId, 1);
    expect(report.submitted).toBe(2);
    expect(report.inProgress).toBe(0);
    expect(report.averagePercent).toBe(50);
    expect(report.questions[0]).toMatchObject({ correct: 1, answered: 1, accuracyPercent: 50 });
    const response = await instructorResultsCsv(db, quizId, instructorId);
    expect(response.headers.get("content-type")).toContain("text/csv");
    const csv = await response.text();
    expect(csv).toContain("Submitted (UTC)");
    expect(csv).toContain("Normal Student");
    expect(csv).not.toContain("correctOptionId");
  });
  it("shows only opted-in students after closure and enforces submission", async () => {
    const outsider = crypto.randomUUID();
    const email = `report-${outsider}@example.test`;
    await db.user.create({ data: { id: outsider, name: "Other", email, role: "STUDENT", emailVerified: true } });
    await db.rosterEntry.create({ data: { name: "Other", normalizedEmail: email, userId: outsider, status: "ACTIVE" } });
    const current = await db.quiz.findUniqueOrThrow({ where: { id: quizId } });
    await actOnQuiz(db, instructorId, quizId, current.revision, "close");
    await expect(quizLeaderboard(db, slug, { id: outsider, role: "STUDENT" }))
      .rejects.toMatchObject({ status: 403 });
    const leaderboard = await quizLeaderboard(db, slug, { id: studentId, role: "STUDENT" });
    expect(leaderboard.total).toBe(1);
    expect(leaderboard.entries).toHaveLength(1);
    expect(leaderboard.entries[0]).toMatchObject({ rank: 1, earnedMarks: 4 });
    expect(JSON.stringify(leaderboard)).not.toContain("@example.test");
    await db.user.update({ where: { id: studentId }, data: { leaderboardOptOut: true } });
    const empty = await quizLeaderboard(db, slug, { id: instructorId, role: "INSTRUCTOR" });
    expect(empty.total).toBe(0);
  });
});
