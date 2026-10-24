import { after } from "next/server";
import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json, assertOrigin, readJson } from "@/lib/http";
import { instructorSubmission, reviewSubmission } from "@/lib/assignments";
import { assignmentReviewSchema } from "@/lib/assignment-policy";
import { deliverNotifications } from "@/lib/notifications";
type Context = { params: Promise<{ id: string; sid: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireInstructor(request.headers);
    const { id, sid } = await context.params;
    return json(await instructorSubmission(getDb(), actor.id, id, sid));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    const { id, sid } = await context.params;
    const input = await readJson(request, assignmentReviewSchema, 50000);
    const result = await reviewSubmission(getDb(), actor.id, id, sid, input);
    if (input.action === "request_changes")
      after(() =>
        deliverNotifications(getDb()).catch(() => {
          console.error("QMS_ASSIGNMENT_NOTICE_FAILED");
        }),
      );
    return json(result);
  } catch (e) {
    return failure(e);
  }
}
