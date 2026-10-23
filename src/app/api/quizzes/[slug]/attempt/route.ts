import { getActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { startAttempt } from "@/lib/attempts";
import { z } from "zod";
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    assertOrigin(request);
    const actor = await getActor(request.headers);
    await readJson(request, z.object({}).strict());
    const result = await startAttempt(getDb(), actor.id, actor.role, (await context.params).slug);
    return json(result);
  } catch (error) { return failure(error); }
}
