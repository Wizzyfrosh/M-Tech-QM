import { getActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json } from "@/lib/http";
import { studentQuizDetails } from "@/lib/quizzes";
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    await getActor(request.headers);
    return json(await studentQuizDetails(getDb(), (await context.params).slug));
  } catch (e) {
    return failure(e);
  }
}
