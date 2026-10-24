import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json } from "@/lib/http";
import { assignmentSubmissions } from "@/lib/assignments";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireInstructor(request.headers);
    const page = Math.max(
      1,
      Math.min(
        10000,
        Math.floor(Number(new URL(request.url).searchParams.get("page")) || 1),
      ),
    );
    return json(
      await assignmentSubmissions(
        getDb(),
        actor.id,
        (await context.params).id,
        page,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
