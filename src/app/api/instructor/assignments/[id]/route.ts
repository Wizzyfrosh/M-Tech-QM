import { after } from "next/server";
import { requireInstructor, AccessError } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json, assertOrigin, readJson } from "@/lib/http";
import { saveAssignment, assignmentAction } from "@/lib/assignments";
import {
  assignmentSaveSchema,
  assignmentActionSchema,
} from "@/lib/assignment-policy";
import { deliverNotifications } from "@/lib/notifications";
import { z } from "zod";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    const { revision, ...draft } = await readJson(
      request,
      assignmentSaveSchema,
      150000,
    );
    return json(
      await saveAssignment(
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
export async function POST(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    const { revision, action } = await readJson(
      request,
      assignmentActionSchema,
    );
    const result = await assignmentAction(
      getDb(),
      actor.id,
      (await context.params).id,
      revision,
      action,
    );
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
export async function DELETE(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    const { revision, acknowledged } = await readJson(
      request,
      z
        .object({
          revision: z.number().int().min(0),
          acknowledged: z.literal(true),
        })
        .strict(),
    );
    const id = (await context.params).id;
    const result = await getDb().$transaction(async (tx) => {
      const deleted = await tx.assignment.deleteMany({
        where: { id, createdBy: actor.id, revision, status: "DRAFT" },
      });
      if (!deleted.count || !acknowledged)
        throw new AccessError(
          409,
          "Only an unchanged draft can be deleted. Reload and try again.",
        );
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: id,
          action: "ASSIGNMENT_DRAFT_DELETED",
        },
      });
      return { deleted: true };
    });
    return json(result);
  } catch (e) {
    return failure(e);
  }
}
