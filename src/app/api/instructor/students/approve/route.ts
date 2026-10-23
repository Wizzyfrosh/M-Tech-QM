import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { bulkApprovalSchema } from "@/lib/policy";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    const { ids } = await readJson(request, bulkApprovalSchema);
    const result = await getDb().$transaction(async tx => {
      // Confirm verified pending identities while holding their row locks.
      const records = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT r."id"
        FROM "RosterEntry" r
        JOIN "User" u ON u."id" = r."userId"
        WHERE r."id" = ANY(${ids}::text[])
          AND r."status" = 'PENDING'
          AND u."emailVerified" = true
          AND u."role" = 'STUDENT'
        ORDER BY r."id"
        FOR UPDATE OF r
      `;
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
      return { approved: eligible.length, skipped: ids.length - eligible.length };
    }, { timeout: 20000 });
    return json(result);
  } catch (error) { return failure(error); }
}
