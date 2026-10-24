import { z } from "zod";
import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { saveQuizSchema, acknowledgeSchema } from "@/lib/quiz-policy";
import { getQuizEditor, saveQuiz, actOnQuiz } from "@/lib/quizzes";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireInstructor(request.headers);
    return json(
      await getQuizEditor(getDb(), (await context.params).id, actor.id),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    const { revision, ...draft } = await readJson(
      request,
      saveQuizSchema,
      1_048_576,
    );
    return json(
      await saveQuiz(
        getDb(),
        actor.id,
        (await context.params).id,
        revision,
        draft,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    const { revision, confirmTitle } = await readJson(request, acknowledgeSchema.extend({confirmTitle:z.string().max(120).optional()}));
    return json(
      await actOnQuiz(
        getDb(),
        actor.id,
        (await context.params).id,
        revision,
        "delete", confirmTitle,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
