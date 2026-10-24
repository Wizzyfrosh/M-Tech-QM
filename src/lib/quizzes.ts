import { notifyPublished } from "./notifications";
import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AccessError } from "./access";
import {
  quizDraftSchema,
  publishIssues,
  effectivelyClosed,
  type QuizDraft,
} from "./quiz-policy";
const detail = {
  questions: {
    orderBy: { position: "asc" as const },
    include: {
      options: { orderBy: { position: "asc" as const } },
      answerKey: true,
    },
  },
};
type DetailedQuiz = Prisma.QuizGetPayload<{ include: typeof detail }>;
export function editorData(quiz: DetailedQuiz) {
  return {
    id: quiz.id,
    shareSlug: quiz.shareSlug,
    status: quiz.status,
    revision: quiz.revision,
    publishedAt: quiz.publishedAt?.toISOString() ?? null,
    closedAt: quiz.closedAt?.toISOString() ?? null,
    archivedAt: quiz.archivedAt?.toISOString() ?? null,
    ...draftData(quiz),
  };
}
function lessonLinkValues(draft: { lessonUrl?: string | null; lessonUrls?: string[] }) {
  const urls = draft.lessonUrls?.length ? draft.lessonUrls : (draft.lessonUrl ? [draft.lessonUrl] : []);
  return { lessonUrl: urls[0] ?? null, lessonUrls: urls };
}
function draftData(quiz: DetailedQuiz): QuizDraft {
  return {
    title: quiz.title,
    lessonLabel: quiz.lessonLabel,
    description: quiz.description,
    lessonUrl: quiz.lessonUrl,
    lessonUrls: quiz.lessonUrls.length ? quiz.lessonUrls : (quiz.lessonUrl ? [quiz.lessonUrl] : []),
    deadline: quiz.deadline?.toISOString() ?? null,
    reviewMode: quiz.reviewMode,
    leaderboardEnabled: quiz.leaderboardEnabled,
    questions: quiz.questions.map((q) => ({
      prompt: q.prompt,
      explanation: q.explanation,
      marks: q.marks,
      options: q.options.map((o) => o.text),
      correctIndex: q.answerKey
        ? q.options.findIndex((o) => o.id === q.answerKey!.correctOptionId)
        : null,
      reviewed: !!q.reviewedAt,
    })),
  };
}
export async function getQuizEditor(
  db: PrismaClient,
  id: string,
  actorId: string,
) {
  const row = await db.quiz.findFirst({
    where: { id, createdBy: actorId },
    include: detail,
  });
  if (!row) throw new AccessError(404, "Quiz not found.");
  return editorData(row);
}
async function writeQuestions(
  tx: Prisma.TransactionClient,
  quizId: string,
  questions: QuizDraft["questions"],
  now: Date,
) {
  for (const [position, q] of questions.entries()) {
    const options = q.options.map((text, position) => ({
      id: crypto.randomUUID(),
      text,
      position,
    }));
    const question = await tx.question.create({
      data: {
        quizId,
        position,
        prompt: q.prompt,
        explanation: q.explanation,
        marks: q.marks,
        reviewedAt: q.reviewed ? now : null,
        options: { create: options },
      },
    });
    if (q.correctIndex !== null)
      await tx.answerKey.create({
        data: {
          questionId: question.id,
          correctOptionId: options[q.correctIndex].id,
        },
      });
  }
}
export async function createQuiz(
  db: PrismaClient,
  actorId: string,
  draft: QuizDraft,
) {
  return db.$transaction(
    async (tx) => {
      const { questions, ...values } = draft;
      const row = await tx.quiz.create({
        data: {
          ...values,
          lessonUrl: lessonLinkValues(values).lessonUrl,
          lessonUrls: lessonLinkValues(values).lessonUrls,
          createdBy: actorId,
        },
      });
      await writeQuestions(tx, row.id, questions, new Date());
      await tx.auditEvent.create({
        data: { actorId, action: "QUIZ_CREATED", entityId: row.id },
      });
      return { id: row.id };
    },
    { timeout: 15000 },
  );
}
async function lockQuiz(
  tx: Prisma.TransactionClient,
  id: string,
  actorId: string,
  revision: number,
) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "Quiz" WHERE "id"=${id} AND "createdBy"=${actorId} FOR UPDATE`;
  if (!rows.length) throw new AccessError(404, "Quiz not found.");
  const quiz = await tx.quiz.findUniqueOrThrow({
    where: { id },
    include: detail,
  });
  if (quiz.revision !== revision)
    throw new AccessError(
      409,
      "This quiz changed in another tab. Reload before continuing.",
    );
  const [clock] = await tx.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS "now"`;
  return { quiz, now: clock.now };
}
export async function saveQuiz(
  db: PrismaClient,
  actorId: string,
  id: string,
  revision: number,
  draft: QuizDraft,
) {
  return db.$transaction(
    async (tx) => {
      const { quiz, now } = await lockQuiz(tx, id, actorId, revision);
      if (quiz.status !== "DRAFT")
        throw new AccessError(
          409,
          "Published quiz content is locked. Duplicate the quiz to make changes.",
        );
      const { questions, ...values } = draft;
      await tx.quiz.update({
        where: { id },
        data: {
          ...values,
          lessonUrl: lessonLinkValues(values).lessonUrl,
          lessonUrls: lessonLinkValues(values).lessonUrls,
          revision: { increment: 1 },
        },
      });
      await tx.question.deleteMany({ where: { quizId: id } });
      await writeQuestions(tx, id, questions, now);
      return editorData(
        await tx.quiz.findUniqueOrThrow({ where: { id }, include: detail }),
      );
    },
    { timeout: 15000 },
  );
}
export type QuizAction =
  "publish" | "duplicate" | "close" | "archive" | "delete";
export async function actOnQuiz(
  db: PrismaClient,
  actorId: string,
  id: string,
  revision: number,
  action: QuizAction,
) {
  return db.$transaction(
    async (tx) => {
      const { quiz, now } = await lockQuiz(tx, id, actorId, revision);
      if (action === "delete") {
        if (quiz.status !== "DRAFT")
          throw new AccessError(
            409,
            "Only drafts can be deleted. Archive a published quiz.",
          );
        await tx.quiz.delete({ where: { id } });
        await tx.auditEvent.create({
          data: { actorId, action: "QUIZ_DELETED", entityId: id },
        });
        return { deleted: true };
      }
      if (action === "duplicate") {
        const original = draftData(quiz);
        const { questions, ...values } = original;
        const copy = await tx.quiz.create({
          data: {
            ...values,
            title: quiz.title.slice(0, 113) + " (copy)",
            deadline: null,
            createdBy: actorId,
          },
        });
        await writeQuestions(
          tx,
          copy.id,
          questions.map((q) => ({ ...q, reviewed: false })),
          now,
        );
        await tx.auditEvent.create({
          data: { actorId, action: "QUIZ_DUPLICATED", entityId: copy.id },
        });
        return { id: copy.id };
      }
      if (action === "publish") {
        if (quiz.status !== "DRAFT")
          throw new AccessError(409, "Only a draft can be published.");
        const parsed = quizDraftSchema.safeParse(draftData(quiz));
        const issues = parsed.success
          ? publishIssues(parsed.data, now)
          : ["Check the quiz fields and answer key."];
        if (issues.length) throw new AccessError(400, issues.join(" "));
        await tx.quiz.update({
          where: { id },
          data: {
            status: "PUBLISHED",
            publishedAt: now,
            revision: { increment: 1 },
          },
        });
        await notifyPublished(tx,quiz);
      } else if (action === "close") {
        if (quiz.status !== "PUBLISHED")
          throw new AccessError(409, "Only a published quiz can be closed.");
        await tx.quiz.update({
          where: { id },
          data: { status: "CLOSED", closedAt: now, revision: { increment: 1 } },
        });
      } else {
        if (quiz.status === "DRAFT")
          throw new AccessError(
            409,
            "Delete a draft or publish it before archiving.",
          );
        if (quiz.status === "ARCHIVED")
          throw new AccessError(409, "This quiz is already archived.");
        await tx.quiz.update({
          where: { id },
          data: {
            status: "ARCHIVED",
            closedAt: quiz.closedAt ?? now,
            archivedAt: now,
            revision: { increment: 1 },
          },
        });
      }
      await tx.auditEvent.create({
        data: { actorId, action: `QUIZ_${action.toUpperCase()}`, entityId: id },
      });
      return editorData(
        await tx.quiz.findUniqueOrThrow({ where: { id }, include: detail }),
      );
    },
    { timeout: 15000 },
  );
}
export async function updateQuizSettings(
  db: PrismaClient,
  actorId: string,
  id: string,
  input: {
    revision: number;
    deadline: string | null;
    leaderboardEnabled: boolean;
  },
) {
  return db.$transaction(async (tx) => {
    const { quiz, now } = await lockQuiz(tx, id, actorId, input.revision);
    if (quiz.status === "DRAFT")
      throw new AccessError(
        409,
        "Use the draft editor to change these settings.",
      );
    const deadline = input.deadline ? new Date(input.deadline) : null;
    if (effectivelyClosed(quiz, now)) {
      if ((deadline?.getTime() ?? null) !== (quiz.deadline?.getTime() ?? null))
        throw new AccessError(
          409,
          "The deadline is locked after the quiz closes.",
        );
    } else {
      if (quiz.deadline && (!deadline || deadline < quiz.deadline))
        throw new AccessError(400, "The deadline can only be extended.");
      if (deadline && deadline <= now)
        throw new AccessError(400, "Choose a future deadline.");
    }
    await tx.quiz.update({
      where: { id },
      data: {
        deadline,
        leaderboardEnabled: input.leaderboardEnabled,
        revision: { increment: 1 },
      },
    });
    await tx.auditEvent.create({
      data: { actorId, action: "QUIZ_SETTINGS_UPDATED", entityId: id },
    });
    return editorData(
      await tx.quiz.findUniqueOrThrow({ where: { id }, include: detail }),
    );
  });
}
export const quizSummarySelect = {
  id: true,
  shareSlug: true,
  title: true,
  lessonLabel: true,
  description: true,
  lessonUrl: true,
  lessonUrls: true,
  status: true,
  deadline: true,
  leaderboardEnabled: true,
  reviewMode: true,
  createdAt: true,
  publishedAt: true,
  revision: true,
  _count: { select: { questions: true } },
} satisfies Prisma.QuizSelect;
export async function studentQuizDetails(db: PrismaClient, slug: string) {
  const row = await db.quiz.findFirst({
    where: { shareSlug: slug, status: { not: "DRAFT" } },
    select: { ...quizSummarySelect, questions: { select: { marks: true } } },
  });
  if (!row) throw new AccessError(404, "Quiz not found.");
  const { questions, _count, ...metadata } = row;
  return {
    ...metadata,
    questionCount: _count.questions,
    maxMarks: questions.reduce((n, q) => n + q.marks, 0),
    acceptingAttempts: row.status === "PUBLISHED" && !effectivelyClosed(row),
  };
}
