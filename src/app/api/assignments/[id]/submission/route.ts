import { after } from "next/server";
import { getActor, AccessError } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json, assertOrigin, readJson } from "@/lib/http";
import { writeSubmission } from "@/lib/assignments";
import { submissionSchema } from "@/lib/assignment-policy";
import { deliverNotifications } from "@/lib/notifications";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const actor = await getActor(request.headers);
    if (actor.role !== "STUDENT")
      throw new AccessError(403, "Student access required.");
    const input = await readJson(request, submissionSchema, 100000);
    const result = await writeSubmission(
      getDb(),
      actor.id,
      (await context.params).id,
      input,
    );
    if (input.action === "submit")
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
