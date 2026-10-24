import { z } from "zod";

export const aiDraftRequestSchema = z.object({
  transcript: z.string().trim().min(160, "Paste more lesson material.").max(40_000),
  count: z.number().int().min(1).max(20),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  provider: z.enum(["gemini", "openrouter", "grok", "auto"]).default("auto"),
}).strict();

const questionSchema = z.object({
  prompt: z.string().trim().min(12).max(4000),
  options: z.array(z.string().trim().min(1).max(2000)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(12).max(4000),
  sourceExcerpt: z.string().trim().min(12).max(350),
}).strict();

export const aiDraftResponseSchema = z.object({
  questions: z.array(questionSchema).min(1).max(20),
}).strict();

export type GeneratedQuestion = z.infer<typeof questionSchema>;
export function validateGeneratedQuestions(value: unknown, transcript: string, requested: number): GeneratedQuestion[] {
  const parsed = aiDraftResponseSchema.safeParse(value);
  if (!parsed.success || parsed.data.questions.length !== requested) throw new Error("AI_OUTPUT_INVALID");
  const canonical = (v: string) => v.replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
  const source = canonical(transcript);
  const seen = new Set<string>();
  for (const question of parsed.data.questions) {
    const key = canonical(question.prompt);
    const options = question.options.map(canonical);
    if (seen.has(key) || new Set(options).size !== 4 || !source.includes(canonical(question.sourceExcerpt))) {
      throw new Error("AI_OUTPUT_INVALID");
    }
    seen.add(key);
  }
  return parsed.data.questions;
}
