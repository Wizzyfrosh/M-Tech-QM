import { getSignedInActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { z } from "zod";
import { after } from "next/server";
import { deliverNotifications } from "@/lib/notifications";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const actor = await getSignedInActor(request.headers);
    const db = getDb();
    const page = Math.max(
      1,
      Math.min(
        10000,
        Math.floor(Number(new URL(request.url).searchParams.get("page")) || 1),
      ),
    );
    const [items, unread, total] = await Promise.all([
      db.notification.findMany({
        where: { userId: actor.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
        skip: (page - 1) * 20,
        select: {
          id: true,
          title: true,
          message: true,
          href: true,
          readAt: true,
          createdAt: true,
        },
      }),
      db.notification.count({ where: { userId: actor.id, readAt: null } }),
      db.notification.count({ where: { userId: actor.id } }),
    ]);
    after(() => deliverNotifications(db));
    const delivery =
      actor.role === "INSTRUCTOR"
        ? await db.notification.groupBy({ by: ["emailStatus"], _count: true })
        : null;
    return json({ items, unread, total, page, delivery });
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    assertOrigin(request);
    const actor = await getSignedInActor(request.headers);
    const input = await readJson(
      request,
      z.object({ id: z.string().uuid().optional() }).strict(),
    );
    await getDb().notification.updateMany({
      where: {
        userId: actor.id,
        readAt: null,
        ...(input.id ? { id: input.id } : {}),
      },
      data: { readAt: new Date() },
    });
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
