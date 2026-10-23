import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { getDb } from "./db";
import { mayAccess } from "./policy";
export class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function getActor(requestHeaders: Headers) {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) throw new AccessError(401, "Sign in to continue.");
  // Always reload the role and roster; a session is identity, not current permission.
  const user = await getDb().user.findUnique({
    where: { id: session.user.id },
    include: { roster: true },
  });
  if (!user || !mayAccess(user))
    throw new AccessError(
      403,
      "Access is unavailable. Contact your instructor.",
    );
  return user;
}
export async function requireInstructor(requestHeaders: Headers) {
  const actor = await getActor(requestHeaders);
  if (actor.role !== "INSTRUCTOR")
    throw new AccessError(403, "Instructor access required.");
  return actor;
}
export async function pageActor(role?: "INSTRUCTOR" | "STUDENT") {
  let actor;
  try {
    actor = await getActor(await headers());
  } catch (error) {
    if (error instanceof AccessError)
      redirect(error.status === 401 ? "/sign-in" : "/access-denied");
    throw error;
  }
  if (role && actor.role !== role) redirect("/dashboard");
  return actor;
}
