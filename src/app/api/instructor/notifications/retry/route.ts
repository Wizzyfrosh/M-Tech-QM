import { after } from "next/server";
import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { deliverNotifications } from "@/lib/notifications";
import { z } from "zod";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    await requireInstructor(request.headers);
    await readJson(
      request,
      z.object({ acknowledged: z.literal(true) }).strict(),
    );
    const result = await getDb().notification.updateMany({
      where: { emailStatus: "FAILED" },
      data: { emailStatus: "PENDING" },
    });
    after(() => deliverNotifications(getDb()));
    return json({ queued: result.count });
  } catch (error) {
    return failure(error);
  }
}
