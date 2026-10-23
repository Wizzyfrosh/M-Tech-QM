import { getActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json } from "@/lib/http";
import { quizLeaderboard } from "@/lib/reports";
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const actor = await getActor(request.headers);
    return json(await quizLeaderboard(getDb(), (await context.params).slug, actor));
  } catch (e) { return failure(e); }
}
