import { getActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json } from "@/lib/http";
import { assignmentDetail } from "@/lib/assignments";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor(request.headers);
    return json(
      await assignmentDetail(
        getDb(),
        actor.id,
        (await context.params).id,
        actor.role === "INSTRUCTOR",
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
