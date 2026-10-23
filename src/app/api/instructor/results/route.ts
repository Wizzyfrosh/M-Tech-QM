import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json } from "@/lib/http";
import { reportList } from "@/lib/reports";
export async function GET(request: Request) {
  try {
    const actor = await requireInstructor(request.headers);
    const raw = Number(new URL(request.url).searchParams.get("page") || "1");
    const page = Number.isInteger(raw) ? Math.min(10000, Math.max(1, raw)) : 1;
    return json(await reportList(getDb(), actor.id, page));
  } catch (e) { return failure(e); }
}
