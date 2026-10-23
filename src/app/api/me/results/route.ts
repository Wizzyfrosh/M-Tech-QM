import { getActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json } from "@/lib/http";
import { studentHistory } from "@/lib/attempts";
import { pageNumber } from "@/lib/attempt-policy";
export async function GET(request: Request) {
  try {
    const actor = await getActor(request.headers);
    return json(await studentHistory(getDb(), actor.id, actor.role, pageNumber(request.url)));
  } catch (error) { return failure(error); }
}
