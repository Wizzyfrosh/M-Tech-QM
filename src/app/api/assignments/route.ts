import { getActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json } from "@/lib/http";
import { assignmentList } from "@/lib/assignments";
export async function GET(request: Request) {
  try {
    const actor = await getActor(request.headers);
    const page = Math.max(
      1,
      Math.min(
        10000,
        Math.floor(Number(new URL(request.url).searchParams.get("page")) || 1),
      ),
    );
    return json(
      await assignmentList(
        getDb(),
        actor.id,
        actor.role === "INSTRUCTOR",
        page,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
