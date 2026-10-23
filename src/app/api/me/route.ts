import { getSignedInActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { profileSchema } from "@/lib/policy";
export async function GET(request: Request) {
  try {
    const actor = await getSignedInActor(request.headers);
    return json({
      id: actor.id,
      name: actor.name,
      email: actor.email,
      role: actor.role,
      accessStatus: actor.role === "STUDENT" ? actor.roster?.status ?? "PENDING" : "ACTIVE",
      leaderboardOptOut: actor.leaderboardOptOut,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    assertOrigin(request);
    const actor = await getSignedInActor(request.headers);
    const data = await readJson(request, profileSchema);
    await getDb().user.update({ where: { id: actor.id }, data });
    return json({ status: true });
  } catch (error) {
    return failure(error);
  }
}
