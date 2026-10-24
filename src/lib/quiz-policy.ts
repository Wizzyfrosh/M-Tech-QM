import { z } from "zod";
export const reviewModes = [
  "AFTER_SUBMISSION",
  "AFTER_CLOSE",
  "INSTRUCTOR_RELEASE",
] as const;
const lessonUrl = z
  .union([
    z.literal(""),
    z
      .string()
      .url()
      .max(2000)
      .refine((value) => {
        const u = new URL(value);
        return u.protocol === "https:" && !u.username && !u.password;
      }, "Use an HTTPS lesson link without credentials."),
  ])
  .nullable();
export const questionDraftSchema = z
  .object({
    prompt: z.string().max(4000),
    explanation: z.string().max(4000),
    marks: z.number().int().min(1).max(10),
    options: z.array(z.string().max(2000)).length(4),
    correctIndex: z.number().int().min(0).max(3).nullable(),
    reviewed: z.boolean(),
  })
  .strict();
export const quizDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    lessonLabel: z.string().trim().max(120),
    description: z.string().max(2000),
    lessonUrl,
    lessonUrls: z.array(lessonUrl.refine((url): url is string => typeof url === "string" && url.length > 0)).max(20).optional(),
    deadline: z.string().datetime({ offset: true }).nullable(),
    reviewMode: z.enum(reviewModes),
    leaderboardEnabled: z.boolean(),
    questions: z.array(questionDraftSchema).max(50),
  })
  .strict();
export const saveQuizSchema = quizDraftSchema
  .extend({ revision: z.number().int().nonnegative() })
  .strict();
export const revisionSchema = z
  .object({ revision: z.number().int().nonnegative() })
  .strict();
export const acknowledgeSchema = revisionSchema
  .extend({ acknowledged: z.literal(true) })
  .strict();
export const quizSettingsSchema = revisionSchema
  .extend({
    deadline: z.string().datetime({ offset: true }).nullable(),
    leaderboardEnabled: z.boolean(),
  })
  .strict();
export type QuizDraft = z.infer<typeof quizDraftSchema>;
export type QuestionDraft = z.infer<typeof questionDraftSchema>;
export const blankQuestion = (): QuestionDraft => ({
  prompt: "",
  explanation: "",
  marks: 1,
  options: ["", "", "", ""],
  correctIndex: null,
  reviewed: false,
});
export const blankQuiz = (): QuizDraft => ({
  title: "Untitled quiz",
  lessonLabel: "",
  description: "",
  lessonUrl: "",
  lessonUrls: [],
  deadline: null,
  reviewMode: "INSTRUCTOR_RELEASE",
  leaderboardEnabled: true,
  questions: [],
});
export function publishIssues(draft: QuizDraft, now = new Date()): string[] {
  const issues: string[] = [];
  if (!draft.lessonLabel.trim()) issues.push("Add a lesson name.");
  if (draft.deadline && new Date(draft.deadline) <= now)
    issues.push("Choose a future deadline or remove it.");
  if (!draft.questions.length) issues.push("Add at least one question.");
  for (const [index, q] of draft.questions.entries()) {
    const prefix = `Question ${index + 1}: `;
    if (!q.prompt.trim()) issues.push(prefix + "add the question text.");
    if (
      q.options.some((o) => !o.trim()) ||
      new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4
    )
      issues.push(prefix + "provide four different, non-empty options.");
    if (q.correctIndex === null)
      issues.push(prefix + "choose the correct answer.");
    if (!q.explanation.trim())
      issues.push(prefix + "add an answer explanation.");
    if (!q.reviewed)
      issues.push(
        prefix + "confirm that you reviewed the question and answer.",
      );
  }
  return issues;
}
export function effectivelyClosed(
  quiz: { status: string; deadline: Date | null },
  now = new Date(),
) {
  return (
    quiz.status === "CLOSED" ||
    quiz.status === "ARCHIVED" ||
    (quiz.status === "PUBLISHED" && !!quiz.deadline && quiz.deadline <= now)
  );
}
export function lagosInput(iso: string | null) {
  return iso
    ? new Date(new Date(iso).getTime() + 3600000).toISOString().slice(0, 16)
    : "";
}
export function fromLagosInput(value: string) {
  return value ? new Date(value + ":00+01:00").toISOString() : null;
}
export function formatDeadline(value: string | Date | null) {
  return value
    ? new Intl.DateTimeFormat("en-NG", {
        timeZone: "Africa/Lagos",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value)) + " WAT"
    : "No deadline";
}
export type EditorQuiz = QuizDraft & {
  id: string;
  shareSlug: string;
  revision: number;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  publishedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
};
