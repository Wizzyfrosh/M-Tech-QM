import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure } from "@/lib/http";
import { instructorResultsCsv } from "@/lib/reports";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireInstructor(request.headers);
    return await instructorResultsCsv(getDb(), (await context.params).id, actor.id);
  } catch (e) { return failure(e); }
}
