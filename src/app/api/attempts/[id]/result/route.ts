import { getActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json } from "@/lib/http";
import { attemptResult } from "@/lib/attempts";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor(request.headers);
    return json(await attemptResult(getDb(), (await context.params).id, actor.id, actor.role));
  } catch (error) { return failure(error); }
}
