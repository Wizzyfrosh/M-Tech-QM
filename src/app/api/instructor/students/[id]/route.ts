export const maxDuration = 60;
import { after } from "next/server";
import { deliverNotifications } from "@/lib/notifications";
import { notifyAccess } from "@/lib/notifications";
import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { studentUpdateSchema } from "@/lib/policy";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    after(()=>deliverNotifications(getDb()));
    const { id } = await context.params;
    const data = await readJson(request, studentUpdateSchema);
    const db = getDb();
    const changed = await db.$transaction(async (tx) => {
      const result = await tx.rosterEntry.updateMany({
        where: {
          id, revision: data.revision,
          ...(data.status === "ACTIVE" ? { user: { emailVerified: true, role: "STUDENT" as const } } : {}),
        },
        data: { status: data.status, revision: { increment: 1 } },
      });
      if (!result.count) return false;
      const row = await tx.rosterEntry.findUniqueOrThrow({ where: { id } });
      if (data.status === "SUSPENDED" && row.userId)
        await tx.session.deleteMany({ where: { userId: row.userId } });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: `ROSTER_${data.status}`,
          entityId: id,
        },
      });
      await notifyAccess(tx,row);
      return true;
    });
    return changed
      ? json({ status: true })
      : json({ error: "This record changed. Refresh and try again." }, 409);
  } catch (error) {
    return failure(error);
  }
}
