import { z } from "zod";
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const nameSchema = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(80);
export const studentSchema = z
  .object({ email: emailSchema, name: nameSchema })
  .strict();
export const studentUpdateSchema = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED"]),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export const profileSchema = z
  .object({ name: nameSchema, leaderboardOptOut: z.boolean() })
  .strict();
export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x20]/.test(value)
  )
    return "/dashboard";
  try {
    const base = new URL("https://qms.invalid");
    const url = new URL(value, base);
    if (
      url.origin !== base.origin ||
      !/^\/(dashboard|instructor|student|q|attempts|leaderboard)(\/|$)/.test(url.pathname)
    )
      return "/dashboard";
    return url.pathname + url.search;
  } catch {
    return "/dashboard";
  }
}
export function mayAccess(
  user: {
    role: string;
    emailVerified: boolean;
    roster: { status: string } | null;
  } | null,
): boolean {
  return (
    !!user?.emailVerified &&
    (user.role === "INSTRUCTOR" ||
      (user.role === "STUDENT" && user.roster?.status === "ACTIVE"))
  );
}
