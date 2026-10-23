import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { applyTestMigrations } from "../scripts/test-migrations";
import { createAuth } from "../src/lib/auth-core";
import { hashPassword } from "better-auth/crypto";
import {
  createQuiz,
  getQuizEditor,
  saveQuiz,
  actOnQuiz,
  updateQuizSettings,
} from "../src/lib/quizzes";
import { blankQuiz, type QuizDraft } from "../src/lib/quiz-policy";
let db: PrismaClient;
let auth: ReturnType<typeof createAuth>;
let lite: PGlite | undefined;
let socket: PGLiteSocketServer | undefined;
let owner = "";
let student = "";
let ownerCookie = "";
let studentCookie = "";
const base = "http://localhost:3000";
const pass = "Synthetic-quiz-policy-password-123!";
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/auth", () => ({ getAuth: () => auth }));
import { POST as createEndpoint } from "../src/app/api/instructor/quizzes/route";
import {
  GET as getEditor,
  PATCH as saveEndpoint,
} from "../src/app/api/instructor/quizzes/[id]/route";
import { POST as actionEndpoint } from "../src/app/api/instructor/quizzes/[id]/[action]/route";
import { GET as getStudentQuiz } from "../src/app/api/quizzes/[slug]/route";
import { GET as listStudentQuizzes } from "../src/app/api/quizzes/route";
function req(path: string, cookie = "", body?: unknown) {
  return new Request(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: base, "content-type": "application/json", cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const complete = (): QuizDraft => ({
  ...blankQuiz(),
  title: "JavaScript lesson",
  lessonLabel: "Variables",
  questions: [
    {
      prompt: "PRIVATE_PROMPT: Which declaration prevents reassignment?",
      options: ["const", "let", "var", "None"],
      correctIndex: 0,
      explanation:
        "PRIVATE_EXPLANATION: const creates a binding that cannot be reassigned.",
      marks: 3,
      reviewed: true,
    },
  ],
});
async function rejectsSql(
  sql: string,
  parameters: string[],
  expectedCode = "23514",
) {
  if (lite) {
    await expect(lite.query(sql, parameters)).rejects.toMatchObject({
      code: expectedCode,
    });
    return;
  }
  const pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    max: 1,
  });
  try {
    await expect(pool.query(sql, parameters)).rejects.toMatchObject({
      code: expectedCode,
    });
  } finally {
    await pool.end();
  }
}
beforeAll(async () => {
  process.env.BETTER_AUTH_URL = base;
  process.env.BETTER_AUTH_SECRET = "synthetic-quiz-test-only-secret-123456789";
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    lite = await PGlite.create();
    socket = new PGLiteSocketServer({
      db: lite,
      host: "127.0.0.1",
      port: 55434,
    });
    await socket.start();
    url = "postgresql://postgres:postgres@127.0.0.1:55434/postgres";
  } else {
    const p = new URL(url);
    if (
      !["localhost", "127.0.0.1"].includes(p.hostname) ||
      !p.pathname.endsWith("_test")
    )
      throw new Error("Use a dedicated local _test database.");
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await applyTestMigrations(pool);
  await pool.end();
  db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: lite ? 1 : 5 }),
  });
  auth = createAuth(db, {
    url: base,
    secret: process.env.BETTER_AUTH_SECRET!,
    sendMail: async () => {},
  });
  for (const role of ["INSTRUCTOR", "STUDENT"] as const) {
    const id = crypto.randomUUID();
    const email = role.toLowerCase() + "@example.test";
    await db.user.create({
      data: {
        id,
        email,
        name: role,
        emailVerified: true,
        role,
        accounts: {
          create: {
            id: crypto.randomUUID(),
            accountId: id,
            providerId: "credential",
            password: await hashPassword(pass),
          },
        },
      },
    });
    if (role === "STUDENT") {
      student = id;
      await db.rosterEntry.create({
        data: { normalizedEmail: email, name: role, userId: id },
      });
    } else owner = id;
    const response = await auth.handler(
      req("/api/auth/sign-in/email", "", { email, password: pass }),
    );
    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    if (role === "STUDENT") studentCookie = cookie;
    else ownerCookie = cookie;
  }
}, 60000);
afterAll(async () => {
  await db?.$disconnect();
  await socket?.stop();
  await new Promise((r) => setTimeout(r, 50));
  await lite?.close();
});
describe("quiz authoring and publication", () => {
  it("requires instructor access and same-origin requests", async () => {
    expect(
      (await createEndpoint(req("/api/instructor/quizzes", "", {}))).status,
    ).toBe(401);
    expect(
      (await createEndpoint(req("/api/instructor/quizzes", studentCookie, {})))
        .status,
    ).toBe(403);
    const bad = req("/api/instructor/quizzes", ownerCookie, {});
    bad.headers.set("origin", "https://evil.test");
    expect((await createEndpoint(bad)).status).toBe(403);
  });
  it("keeps drafts invisible even with the share slug and editor ID", async () => {
    const { id } = await createQuiz(db, owner, blankQuiz());
    const editor = await getQuizEditor(db, id, owner);
    expect(
      (
        await getStudentQuiz(
          req("/api/quizzes/" + editor.shareSlug, studentCookie),
          { params: Promise.resolve({ slug: editor.shareSlug }) },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await getEditor(req("/api/instructor/quizzes/" + id, studentCookie), {
          params: Promise.resolve({ id }),
        })
      ).status,
    ).toBe(403);
    const list = await listStudentQuizzes(req("/api/quizzes", studentCookie));
    expect((await list.json()).quizzes).toHaveLength(0);
  });
  it("allows incomplete saves but blocks incomplete or unreviewed publication", async () => {
    const { id } = await createQuiz(db, owner, blankQuiz());
    await expect(actOnQuiz(db, owner, id, 0, "publish")).rejects.toMatchObject({
      status: 400,
    });
    const unreviewed = complete();
    unreviewed.questions[0].reviewed = false;
    const saved = await saveQuiz(db, owner, id, 0, unreviewed);
    await expect(
      actOnQuiz(db, owner, id, saved.revision, "publish"),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("saves and reorders questions without mismatching their correct answers", async () => {
    const input = complete();
    input.questions.push({
      ...input.questions[0],
      prompt: "Second question",
      correctIndex: 2,
    });
    const { id } = await createQuiz(db, owner, input);
    let q = await getQuizEditor(db, id, owner);
    expect(q.questions.map((x) => x.correctIndex)).toEqual([0, 2]);
    q = await saveQuiz(db, owner, id, 0, {
      ...input,
      questions: [...input.questions].reverse(),
    });
    expect(q.questions.map((x) => x.correctIndex)).toEqual([2, 0]);
    expect(q.questions[0].prompt).toBe("Second question");
  });
  it("rejects stale writes and serializes save-vs-publish", async () => {
    const { id } = await createQuiz(db, owner, complete());
    const outcomes = await Promise.allSettled([
      saveQuiz(db, owner, id, 0, { ...complete(), title: "Edited title" }),
      actOnQuiz(db, owner, id, 0, "publish"),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((x) => x.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    await expect(saveQuiz(db, owner, id, 0, complete())).rejects.toMatchObject({
      status: 409,
    });
  });
  it("publishes a safe metadata page without prompts, keys or explanations", async () => {
    const { id } = await createQuiz(db, owner, complete());
    const q = await actOnQuiz(db, owner, id, 0, "publish");
    expect(q).toMatchObject({ status: "PUBLISHED", revision: 1 });
    const editor = await getQuizEditor(db, id, owner);
    const response = await getStudentQuiz(
      req("/api/quizzes/" + editor.shareSlug, studentCookie),
      { params: Promise.resolve({ slug: editor.shareSlug }) },
    );
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toContain("PRIVATE_");
    expect(text).not.toContain("correctIndex");
    expect(text).not.toContain("answerKey");
    expect(JSON.parse(text)).toMatchObject({
      questionCount: 1,
      maxMarks: 3,
      acceptingAttempts: true,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("locks published content at service and database layers and refuses deletion", async () => {
    const { id } = await createQuiz(db, owner, complete());
    await actOnQuiz(db, owner, id, 0, "publish");
    await expect(saveQuiz(db, owner, id, 1, complete())).rejects.toMatchObject({
      status: 409,
    });
    await expect(actOnQuiz(db, owner, id, 1, "delete")).rejects.toMatchObject({
      status: 409,
    });
    await rejectsSql('UPDATE "Quiz" SET "title"=$1 WHERE id=$2', [
      "Tampered",
      id,
    ]);
    const question = await db.question.findFirstOrThrow({
      where: { quizId: id },
      include: { options: true, answerKey: true },
    });
    await rejectsSql('UPDATE "Question" SET "marks"=9 WHERE id=$1', [
      question.id,
    ]);
    await rejectsSql('UPDATE "Option" SET "text"=$1 WHERE id=$2', [
      "Tampered",
      question.options[0].id,
    ]);
    await rejectsSql(
      'UPDATE "AnswerKey" SET "correctOptionId"=$1 WHERE "questionId"=$2',
      [question.options[1].id, question.id],
    );
  });
  it("duplicates into an independent, unreviewed draft without a deadline", async () => {
    const { id } = await createQuiz(db, owner, {
      ...complete(),
      deadline: "2099-01-01T00:00:00Z",
    });
    await actOnQuiz(db, owner, id, 0, "publish");
    const result = await actOnQuiz(db, owner, id, 1, "duplicate");
    expect("id" in result).toBe(true);
    const copy = await getQuizEditor(db, (result as { id: string }).id, owner);
    const source = await getQuizEditor(db, id, owner);
    expect(copy.status).toBe("DRAFT");
    expect(copy.deadline).toBeNull();
    expect(copy.shareSlug).not.toBe(source.shareSlug);
    expect(copy.questions[0]).toMatchObject({
      correctIndex: 0,
      reviewed: false,
    });
  });
  it("only extends deadlines and cannot reopen effectively closed quizzes", async () => {
    const { id } = await createQuiz(db, owner, {
      ...complete(),
      deadline: "2099-01-01T00:00:00Z",
    });
    await actOnQuiz(db, owner, id, 0, "publish");
    await expect(
      updateQuizSettings(db, owner, id, {
        revision: 1,
        deadline: "2098-01-01T00:00:00Z",
        leaderboardEnabled: true,
      }),
    ).rejects.toMatchObject({ status: 400 });
    const extended = await updateQuizSettings(db, owner, id, {
      revision: 1,
      deadline: "2099-02-01T00:00:00Z",
      leaderboardEnabled: false,
    });
    expect(extended.leaderboardEnabled).toBe(false);
    await db.quiz.update({ where: { id }, data: { deadline: new Date(0) } });
    await expect(
      updateQuizSettings(db, owner, id, {
        revision: 2,
        deadline: "2099-03-01T00:00:00Z",
        leaderboardEnabled: false,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("requires explicit acknowledgement for closing and archiving retains content", async () => {
    const { id } = await createQuiz(db, owner, complete());
    await actOnQuiz(db, owner, id, 0, "publish");
    const noAck = await actionEndpoint(
      req(`/api/instructor/quizzes/${id}/close`, ownerCookie, { revision: 1 }),
      { params: Promise.resolve({ id, action: "close" }) },
    );
    expect(noAck.status).toBe(400);
    const closed = await actOnQuiz(db, owner, id, 1, "close");
    expect(closed).toMatchObject({ status: "CLOSED" });
    const hidden = await updateQuizSettings(db, owner, id, {
      revision: 2,
      deadline: null,
      leaderboardEnabled: false,
    });
    expect(hidden.leaderboardEnabled).toBe(false);
    await expect(
      updateQuizSettings(db, owner, id, {
        revision: 3,
        deadline: "2099-03-01T00:00:00Z",
        leaderboardEnabled: false,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const archived = await actOnQuiz(db, owner, id, 3, "archive");
    expect(archived).toMatchObject({
      status: "ARCHIVED",
      questions: [{ marks: 3 }],
    });
    expect(await db.question.count({ where: { quizId: id } })).toBe(1);
    await rejectsSql(`UPDATE "Quiz" SET "status"='PUBLISHED' WHERE id=$1`, [
      id,
    ]);
  });
  it("deletes only drafts and rolls back invalid input without partial changes", async () => {
    const { id } = await createQuiz(db, owner, complete());
    const response = await saveEndpoint(
      req("/api/instructor/quizzes/" + id, ownerCookie, {
        ...complete(),
        revision: 0,
        questions: [{ ...complete().questions[0], marks: 99 }],
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(400);
    expect((await getQuizEditor(db, id, owner)).revision).toBe(0);
    await actOnQuiz(db, owner, id, 0, "delete");
    expect(await db.quiz.findUnique({ where: { id } })).toBeNull();
  });
  it("enforces that a correct option belongs to its own question", async () => {
    const draft = complete();
    draft.questions.push({ ...draft.questions[0], prompt: "Other question" });
    const { id } = await createQuiz(db, owner, draft);
    const questions = await db.question.findMany({
      where: { quizId: id },
      include: { options: true },
      orderBy: { position: "asc" },
    });
    await rejectsSql(
      'UPDATE "AnswerKey" SET "correctOptionId"=$1 WHERE "questionId"=$2',
      [questions[1].options[1].id, questions[0].id],
      "23503",
    );
  });
  it("suspended students cannot access published quiz metadata", async () => {
    const { id } = await createQuiz(db, owner, complete());
    await actOnQuiz(db, owner, id, 0, "publish");
    const quiz = await getQuizEditor(db, id, owner);
    await db.rosterEntry.update({
      where: { userId: student },
      data: { status: "SUSPENDED" },
    });
    expect(
      (
        await getStudentQuiz(
          req("/api/quizzes/" + quiz.shareSlug, studentCookie),
          { params: Promise.resolve({ slug: quiz.shareSlug }) },
        )
      ).status,
    ).toBe(403);
  });
});
