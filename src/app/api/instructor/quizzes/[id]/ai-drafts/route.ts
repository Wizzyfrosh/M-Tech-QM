import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { aiDraftRequestSchema } from "@/lib/ai-quiz-policy";
import { generateQuizDrafts } from "@/lib/ai-quiz";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    const input = await readJson(request, aiDraftRequestSchema, 160_000);
    return json(await generateQuizDrafts(getDb(), actor.id, (await context.params).id, input));
  } catch (error) {
    return failure(error);
  }
}
