import { getActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { submitAttempt } from "@/lib/attempts";
import { attemptChangeSchema } from "@/lib/attempt-policy";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const actor = await getActor(request.headers);
    const { revision, answers } = await readJson(request, attemptChangeSchema);
    const result = await submitAttempt(getDb(), (await context.params).id, actor.id, actor.role, revision, answers);
    return json({ id: result.id, status: result.status });
  } catch (error) { return failure(error); }
}
