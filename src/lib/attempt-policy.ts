import { z } from "zod";
export const answerSchema = z.object({
  questionId: z.string().uuid(),
  selectedOptionId: z.string().uuid().nullable(),
}).strict();
export const attemptChangeSchema = z.object({
  revision: z.number().int().nonnegative(),
  answers: z.array(answerSchema).max(50),
}).strict();
export const pageNumber = (url: string) => {
  const requested = Number(new URL(url).searchParams.get("page"));
  return Number.isInteger(requested) ? Math.min(10000, Math.max(1, requested)) : 1;
};
