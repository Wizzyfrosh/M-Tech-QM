export const maxDuration = 60;
import { after } from "next/server";
import { deliverNotifications } from "@/lib/notifications";
import { notifyAccess } from "@/lib/notifications";
import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { bulkApprovalSchema } from "@/lib/policy";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    after(()=>deliverNotifications(getDb()));
    const { ids } = await readJson(request, bulkApprovalSchema);
    const result = await getDb().$transaction(async tx => {
      // Optimistically select only verified pending students and verify the
      // affected count in the same transaction to reject concurrent approvals.
      const records = await tx.rosterEntry.findMany({
        where: { id: { in: ids }, status: "PENDING",
          user: { emailVerified: true, role: "STUDENT" } },
        select: { id: true },
      });
      const eligible = records.map(r => r.id);
      if (eligible.length) {
        const changed = await tx.rosterEntry.updateMany({
          where: { id: { in: eligible }, status: "PENDING" },
          data: { status: "ACTIVE", revision: { increment: 1 } },
        });
        if (changed.count !== eligible.length) throw new Error("APPROVAL_CONFLICT");
        await tx.auditEvent.createMany({
          data: eligible.map(id => ({ actorId: actor.id, action: "STUDENT_APPROVED", entityId: id })),
        });
      }
      for(const row of await tx.rosterEntry.findMany({where:{id:{in:eligible}}})) await notifyAccess(tx,row);
      return { approved: eligible.length, skipped: ids.length - eligible.length };
    }, { timeout: 20000 });
    return json(result);
  } catch (error) { return failure(error); }
}
