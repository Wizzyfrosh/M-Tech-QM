import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AccessError } from "./access";
import { effectivelyClosed } from "./quiz-policy";

export type AnswerInput = { questionId: string; selectedOptionId: string | null };

async function databaseNow(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
  return rows[0].now;
}
async function lockQuiz(tx: Prisma.TransactionClient, quizId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Quiz" WHERE "id" = ${quizId} FOR UPDATE`;
  if (!rows.length) throw new AccessError(404, "Quiz not found.");
  return tx.quiz.findUniqueOrThrow({ where: { id: quizId } });
}
async function lockAttempt(tx: Prisma.TransactionClient, id: string, userId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Attempt" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
  if (!rows.length) throw new AccessError(404, "Attempt not found.");
  return tx.attempt.findUniqueOrThrow({ where: { id } });
}
async function ownedAttempt(tx: Prisma.TransactionClient, id: string, userId: string) {
  const attempt = await tx.attempt.findFirst({ where: { id, userId } });
  if (!attempt) throw new AccessError(404, "Attempt not found.");
  return attempt;
}
function requireStudent(actorRole: string) {
  if (actorRole !== "STUDENT") throw new AccessError(403, "Student access required.");
}
async function ensureActiveStudent(tx: Prisma.TransactionClient, id: string) {
  const user = await tx.user.findUnique({ where: { id }, include: { roster: true } });
  if (!user || user.role !== "STUDENT" || !user.emailVerified || user.roster?.status !== "ACTIVE")
    throw new AccessError(403, "Your student access is unavailable.");
}
function accepting(quiz: { status: string; deadline: Date | null }, now: Date) {
  if (quiz.status !== "PUBLISHED" || effectivelyClosed(quiz, now))
    throw new AccessError(409, "This quiz no longer accepts submissions.");
}
async function validateAnswers(tx: Prisma.TransactionClient, quizId: string, input: AnswerInput[]) {
  const questions = await tx.question.findMany({
    where: { quizId }, select: { id: true, options: { select: { id: true } } },
  });
  const allowed = new Map(questions.map(q => [q.id, new Set(q.options.map(o => o.id))]));
  if (input.length > questions.length) throw new AccessError(400, "Too many answers.");
  const used = new Set<string>();
  for (const answer of input) {
    if (used.has(answer.questionId) || !allowed.has(answer.questionId) ||
        (answer.selectedOptionId !== null && !allowed.get(answer.questionId)!.has(answer.selectedOptionId)))
      throw new AccessError(400, "One or more answers do not belong to this quiz.");
    used.add(answer.questionId);
  }
}
async function writeAnswers(tx: Prisma.TransactionClient, attemptId: string, quizId: string, answers: AnswerInput[]) {
  await tx.attemptAnswer.deleteMany({ where: { attemptId } });
  if (answers.length) await tx.attemptAnswer.createMany({
    data: answers.filter(a => a.selectedOptionId !== null).map(a => ({
      attemptId, quizId, questionId: a.questionId, selectedOptionId: a.selectedOptionId,
    })),
  });
}
export async function startAttempt(db: PrismaClient, userId: string, role: string, slug: string) {
  requireStudent(role);
  return db.$transaction(async tx => {
    await ensureActiveStudent(tx, userId);
    const row = await tx.quiz.findUnique({ where: { shareSlug: slug }, select: { id: true, status: true } });
    if (!row || row.status === "DRAFT") throw new AccessError(404, "Quiz not found.");
    const quiz = await lockQuiz(tx, row.id);
    const old = await tx.attempt.findUnique({ where: { quizId_userId: { quizId: quiz.id, userId } } });
    if (old) return { id: old.id, status: old.status };
    accepting(quiz, await databaseNow(tx));
    const attempt = await tx.attempt.create({ data: { quizId: quiz.id, userId } });
    return { id: attempt.id, status: attempt.status };
  }, { timeout: 15000 });
}
export async function getAttempt(db: PrismaClient, id: string, userId: string, role: string) {
  requireStudent(role);
  const attempt = await db.attempt.findFirst({
    where: { id, userId },
    include: { answers: { select: { questionId: true, selectedOptionId: true } },
      quiz: { select: { id: true, title: true, shareSlug: true, deadline: true, status: true } } },
  });
  if (!attempt) throw new AccessError(404, "Attempt not found.");
  const questions = await db.question.findMany({
    where: { quizId: attempt.quizId },
    select: { id: true, position: true, prompt: true, marks: true,
      options: { select: { id: true, position: true, text: true }, orderBy: { position: "asc" } } },
    orderBy: { position: "asc" },
  });
  return {
    id: attempt.id, revision: attempt.revision, status: attempt.status,
    startedAt: attempt.startedAt, submittedAt: attempt.submittedAt,
    quiz: attempt.quiz, questions, answers: attempt.answers,
    canSubmit: attempt.status === "IN_PROGRESS" && !effectivelyClosed(attempt.quiz),
  };
}
export async function saveAnswers(
  db: PrismaClient, id: string, userId: string, role: string, revision: number, answers: AnswerInput[],
) {
  requireStudent(role);
  return db.$transaction(async tx => {
    await ensureActiveStudent(tx, userId);
    const existing = await ownedAttempt(tx, id, userId);
    const quiz = await lockQuiz(tx, existing.quizId);
    const attempt = await lockAttempt(tx, id, userId);
    accepting(quiz, await databaseNow(tx));
    if (attempt.status !== "IN_PROGRESS") throw new AccessError(409, "This attempt is already submitted.");
    if (revision !== attempt.revision) throw new AccessError(409, "Your answers changed in another tab. Reload before saving.");
    await validateAnswers(tx, quiz.id, answers);
    await writeAnswers(tx, attempt.id, quiz.id, answers);
    const changed = await tx.attempt.update({ where: { id }, data: { revision: { increment: 1 } } });
    return { id, revision: changed.revision, answers: answers.filter(a => a.selectedOptionId !== null) };
  }, { timeout: 15000 });
}
export async function submitAttempt(
  db: PrismaClient, id: string, userId: string, role: string, revision: number, answers: AnswerInput[],
) {
  requireStudent(role);
  return db.$transaction(async tx => {
    await ensureActiveStudent(tx, userId);
    const existing = await ownedAttempt(tx, id, userId);
    const quiz = await lockQuiz(tx, existing.quizId);
    const attempt = await lockAttempt(tx, id, userId);
    // Retry after a lost response must return the same immutable grade.
    if (attempt.status === "SUBMITTED") return { id, status: attempt.status, earnedMarks: attempt.earnedMarks, maxMarks: attempt.maxMarks };
    accepting(quiz, await databaseNow(tx));
    if (revision !== attempt.revision) throw new AccessError(409, "Your answers changed in another tab. Reload before submitting.");
    await validateAnswers(tx, quiz.id, answers);
    await writeAnswers(tx, attempt.id, quiz.id, answers);
    const questions = await tx.question.findMany({
      where: { quizId: quiz.id }, select: { id: true, marks: true, answerKey: { select: { correctOptionId: true } } },
    });
    const submitted = new Map(answers.map(a => [a.questionId, a.selectedOptionId]));
    const grade = new Map(questions.map(q => [q.id, submitted.get(q.id) === q.answerKey?.correctOptionId ? q.marks : 0]));
    const maxMarks = questions.reduce((n, q) => n + q.marks, 0);
    const earnedMarks = [...grade.values()].reduce((n, marks) => n + marks, 0);
    for (const [questionId, awardedMarks] of grade) {
      if (submitted.get(questionId)) await tx.attemptAnswer.update({
        where: { attemptId_questionId: { attemptId: id, questionId } }, data: { awardedMarks },
      });
    }
    const finished = await tx.attempt.update({
      where: { id }, data: { status: "SUBMITTED", revision: { increment: 1 },
        submittedAt: await databaseNow(tx), earnedMarks, maxMarks },
    });
    return { id, status: finished.status, earnedMarks, maxMarks };
  }, { timeout: 15000 });
}
export async function attemptResult(db: PrismaClient, id: string, userId: string, role: string) {
  requireStudent(role);
  const attempt = await db.attempt.findFirst({
    where: { id, userId },
    include: { quiz: true, answers: { select: { questionId: true, selectedOptionId: true, awardedMarks: true } } },
  });
  if (!attempt || attempt.status !== "SUBMITTED") throw new AccessError(404, "Submitted result not found.");
  const reviewAvailable = attempt.quiz.reviewReleasedAt !== null;
  const result = {
    id: attempt.id, quizId: attempt.quizId, quizTitle: attempt.quiz.title,
    shareSlug: attempt.quiz.shareSlug, earnedMarks: reviewAvailable ? attempt.earnedMarks : null, maxMarks: reviewAvailable ? attempt.maxMarks : null,
    submittedAt: attempt.submittedAt, reviewAvailable,
  };
  if (!reviewAvailable) return { ...result, questions: null };
  const questions = await db.question.findMany({
    where: { quizId: attempt.quizId }, orderBy: { position: "asc" },
    select: { id: true, prompt: true, explanation: true, marks: true,
      options: { orderBy: { position: "asc" }, select: { id: true, text: true } },
      answerKey: { select: { correctOptionId: true } },
    },
  });
  const chosen = new Map(attempt.answers.map(a => [a.questionId, a]));
  return { ...result, questions: questions.map(q => ({
    id: q.id, prompt: q.prompt, explanation: q.explanation, marks: q.marks, options: q.options,
    selectedOptionId: chosen.get(q.id)?.selectedOptionId ?? null,
    correctOptionId: q.answerKey?.correctOptionId ?? null,
    awardedMarks: chosen.get(q.id)?.awardedMarks ?? 0,
  })) };
}
export async function studentHistory(db: PrismaClient, userId: string, role: string, page: number) {
  requireStudent(role);
  const where = { userId, status: "SUBMITTED" as const };
  const [attempts, total] = await db.$transaction([
    db.attempt.findMany({ where, select: { id: true, earnedMarks: true, maxMarks: true,
      submittedAt: true, quiz: { select: { title: true, shareSlug: true, lessonLabel: true, reviewReleasedAt: true } } },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }),
    db.attempt.count({ where }),
  ]);
  return { attempts: attempts.map(a => ({ ...a, earnedMarks: a.quiz.reviewReleasedAt ? a.earnedMarks : null,
    maxMarks: a.quiz.reviewReleasedAt ? a.maxMarks : null })), total, page, pageSize: 20 };
}
