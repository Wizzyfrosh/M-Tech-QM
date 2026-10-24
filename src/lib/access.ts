import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { getDb } from "./db";
import { canSignIn, mayAccess } from "./policy";
export class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
/** Verified identity: pending students may open dashboard and account settings only. */
export async function getSignedInActor(requestHeaders: Headers) {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) throw new AccessError(401, "Sign in to continue.");
  const user = await getDb().user.findUnique({
    where: { id: session.user.id },
    include: { roster: true },
  });
  if (!user || !canSignIn(user))
    throw new AccessError(403, "Your account is unavailable.");
  return user;
}
/** Authorization boundary: all lesson, quiz, attempt, result and instructor routes use this. */
export async function getActor(requestHeaders: Headers) {
  const actor = await getSignedInActor(requestHeaders);
  if (!mayAccess(actor))
    throw new AccessError(403, "Your account is awaiting instructor approval.");
  return actor;
}
export async function pageIdentity(returnTo = "/dashboard") {
  try {
    return await getSignedInActor(await headers());
  } catch (error) {
    if (error instanceof AccessError)
      redirect(error.status === 401
        ? `/sign-in?next=${encodeURIComponent(returnTo)}`
        : "/access-denied");
    throw error;
  }
}
export async function requireInstructor(requestHeaders: Headers) {
  const actor = await getActor(requestHeaders);
  if (actor.role !== "INSTRUCTOR")
    throw new AccessError(403, "Instructor access required.");
  return actor;
}
export async function pageActor(
  role?: "INSTRUCTOR" | "STUDENT",
  returnTo = "/dashboard",
) {
  let actor;
  try {
    actor = await getActor(await headers());
  } catch (error) {
    if (error instanceof AccessError)
      redirect(
        error.status === 401
          ? `/sign-in?next=${encodeURIComponent(returnTo)}`
          : "/dashboard",
      );
    throw error;
  }
  if (role && actor.role !== role) redirect("/dashboard");
  return actor;
}
