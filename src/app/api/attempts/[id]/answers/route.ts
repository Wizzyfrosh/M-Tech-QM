import { getActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { saveAnswers } from "@/lib/attempts";
import { attemptChangeSchema } from "@/lib/attempt-policy";
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const actor = await getActor(request.headers);
    const { revision, answers } = await readJson(request, attemptChangeSchema);
    return json(await saveAnswers(getDb(), (await context.params).id, actor.id, actor.role, revision, answers));
  } catch (error) { return failure(error); }
}
