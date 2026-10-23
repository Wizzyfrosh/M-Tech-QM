import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { AccessError } from "./access";
import { effectivelyClosed } from "./quiz-policy";
import { csvLine, scorePercent } from "./report-policy";

export async function ownedReportQuiz(db: PrismaClient, id: string, ownerId: string) {
  const quiz = await db.quiz.findFirst({
    where: { id, createdBy: ownerId },
    select: { id: true, title: true, lessonLabel: true, shareSlug: true,
      status: true, deadline: true, leaderboardEnabled: true },
  });
  if (!quiz) throw new AccessError(404, "Quiz not found.");
  return quiz;
}
export async function reportList(db: PrismaClient, ownerId: string, page: number) {
  const where = { createdBy: ownerId, status: { not: "DRAFT" as const } };
  const [quizzes, total] = await db.$transaction([
    db.quiz.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, title: true, lessonLabel: true, status: true, createdAt: true,
        _count: { select: { attempts: { where: { status: "SUBMITTED" } } } } },
      skip: (page - 1) * 20, take: 20 }),
    db.quiz.count({ where }),
  ]);
  return { quizzes, total, page, pageSize: 20 };
}
export async function instructorQuizReport(db: PrismaClient, quizId: string, ownerId: string, page: number) {
  const quiz = await ownedReportQuiz(db, quizId, ownerId);
  const submittedWhere = { quizId, status: "SUBMITTED" as const };
  const [activeStudents, started, submitted, marks, questions, answers, attempts, total] = await Promise.all([
    db.rosterEntry.count({ where: { status: "ACTIVE", user: { emailVerified: true } } }),
    db.attempt.count({ where: { quizId } }),
    db.attempt.count({ where: submittedWhere }),
    db.attempt.aggregate({ where: submittedWhere,
      _sum: { earnedMarks: true, maxMarks: true } }),
    db.question.findMany({ where: { quizId }, orderBy: { position: "asc" },
      select: { id: true, position: true, prompt: true, marks: true } }),
    db.attemptAnswer.groupBy({ by: ["questionId", "awardedMarks"],
      where: { quizId, attempt: { status: "SUBMITTED" } }, _count: { _all: true } }),
    db.attempt.findMany({ where: { quizId }, orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      select: { id: true, status: true, startedAt: true, submittedAt: true,
        earnedMarks: true, maxMarks: true,
        user: { select: { name: true, email: true, roster: { select: { status: true } } } } },
      skip: (page - 1) * 20, take: 20 }),
    db.attempt.count({ where: { quizId } }),
  ]);
  const answered = new Map<string, number>(), correct = new Map<string, number>();
  for (const a of answers) {
    answered.set(a.questionId, (answered.get(a.questionId) ?? 0) + a._count._all);
    if ((a.awardedMarks ?? 0) > 0)
      correct.set(a.questionId, (correct.get(a.questionId) ?? 0) + a._count._all);
  }
  return {
    quiz, page, pageSize: 20, total, activeStudents, started, submitted,
    inProgress: started - submitted,
    averagePercent: scorePercent(marks._sum.earnedMarks, marks._sum.maxMarks),
    attempts: attempts.map(a => ({ ...a, percent: scorePercent(a.earnedMarks, a.maxMarks) })),
    questions: questions.map(q => ({
      ...q, answered: answered.get(q.id) ?? 0, correct: correct.get(q.id) ?? 0,
      accuracyPercent: submitted ? Math.round(100 * (correct.get(q.id) ?? 0) / submitted) : null,
    })),
  };
}
export async function quizLeaderboard(
  db: PrismaClient, slug: string, actor: { id: string; role: "INSTRUCTOR" | "STUDENT" },
) {
  const quiz = await db.quiz.findUnique({
    where: { shareSlug: slug },
    select: { id: true, title: true, lessonLabel: true, status: true,
      deadline: true, leaderboardEnabled: true, createdBy: true },
  });
  if (!quiz || quiz.status === "DRAFT" || (actor.role === "INSTRUCTOR" && quiz.createdBy !== actor.id))
    throw new AccessError(404, "Leaderboard not available.");
  if (!quiz.leaderboardEnabled) throw new AccessError(404, "Leaderboard disabled.");
  if (!effectivelyClosed(quiz)) throw new AccessError(409, "Leaderboard opens when the quiz closes.");
  if (actor.role === "STUDENT") {
    const own = await db.attempt.findUnique({
      where: { quizId_userId: { quizId: quiz.id, userId: actor.id } },
      select: { status: true },
    });
    if (own?.status !== "SUBMITTED") throw new AccessError(403, "Submit this quiz before viewing rankings.");
  }
  const where = { quizId: quiz.id, status: "SUBMITTED" as const,
    user: { leaderboardOptOut: false, roster: { status: "ACTIVE" as const } } };
  const [rows, total] = await Promise.all([
    db.attempt.findMany({ where, orderBy: [{ earnedMarks: "desc" }, { submittedAt: "asc" }, { id: "asc" }],
      take: 50, select: { earnedMarks: true, maxMarks: true, user: { select: { name: true } } } }),
    db.attempt.count({ where }),
  ]);
  return { quiz: { title: quiz.title, lessonLabel: quiz.lessonLabel },
    total, entries: rows.map((a, i) => ({ rank: i + 1, name: a.user.name,
      earnedMarks: a.earnedMarks, maxMarks: a.maxMarks,
      percent: scorePercent(a.earnedMarks, a.maxMarks) })) };
}
export async function instructorResultsCsv(db: PrismaClient, quizId: string, ownerId: string) {
  const quiz = await ownedReportQuiz(db, quizId, ownerId);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode("\uFEFF" + csvLine([
          "Student name", "Email", "Account status", "Attempt status",
          "Started (UTC)", "Submitted (UTC)", "Marks earned", "Maximum marks", "Score (%)",
        ])));
        let cursor: string | undefined;
        while (true) {
          const batch = await db.attempt.findMany({
            where: { quizId: quiz.id }, orderBy: { id: "asc" }, take: 200,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: { id: true, status: true, startedAt: true, submittedAt: true,
              earnedMarks: true, maxMarks: true,
              user: { select: { name: true, email: true, roster: { select: { status: true } } } } },
          });
          if (!batch.length) break;
          controller.enqueue(encoder.encode(batch.map(a => csvLine([
            a.user.name, a.user.email, a.user.roster?.status ?? "UNASSIGNED",
            a.status, a.startedAt.toISOString(), a.submittedAt?.toISOString() ?? "",
            a.earnedMarks, a.maxMarks, scorePercent(a.earnedMarks, a.maxMarks),
          ])).join("")));
          cursor = batch[batch.length - 1].id;
          if (batch.length < 200) break;
        }
        controller.close();
      } catch { controller.error(new Error("CSV export failed.")); }
    },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="mtech-qms-results-${quiz.id}.csv"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
