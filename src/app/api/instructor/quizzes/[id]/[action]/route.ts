export const maxDuration = 60;
import { after } from "next/server";
import { deliverNotifications } from "@/lib/notifications";
import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import {
  revisionSchema,
  acknowledgeSchema,
  quizSettingsSchema,
} from "@/lib/quiz-policy";
import { actOnQuiz, updateQuizSettings } from "@/lib/quizzes";
type Context = { params: Promise<{ id: string; action: string }> };
export async function POST(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    after(()=>deliverNotifications(getDb()));
    const { id, action } = await context.params;
    if (!["publish", "duplicate", "close", "archive"].includes(action))
      return json({ error: "Not found." }, 404);
    const { revision } = await readJson(
      request,
      action === "duplicate" ? revisionSchema : acknowledgeSchema,
    );
    return json(
      await actOnQuiz(
        getDb(),
        actor.id,
        id,
        revision,
        action as "publish" | "duplicate" | "close" | "archive",
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    after(()=>deliverNotifications(getDb()));
    const { id, action } = await context.params;
    if (action !== "settings") return json({ error: "Not found." }, 404);
    return json(
      await updateQuizSettings(
        getDb(),
        actor.id,
        id,
        await readJson(request, quizSettingsSchema),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
