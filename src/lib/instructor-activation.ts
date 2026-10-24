import "server-only";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { AccessError } from "./access";
import type { OtpMail } from "./mail";
import { consumeEmailQuota } from "./throttle";

// No endpoint can create an invitation. A trusted Neon admin creates the one
// allowlisted row, and redemption is irrevocable.
const generic = "If this email is eligible, an activation code will be sent.";
const unavailable = "The code is invalid, expired, or the invitation has already been used.";
function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("Activation is not configured.");
  return value;
}
function digest(email: string, code: string) {
  return createHmac("sha256", secret()).update("qms:instructor-activation:v1\0")
    .update(email).update("\0").update(code).digest("hex");
}
function constantTimeMatch(expected: string | null, calculated: string) {
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(calculated, "hex"));
}
export async function requestInstructorActivation(db: PrismaClient, email: string, scheduleMail: (message: OtpMail) => void) {
  const allowed = await consumeEmailQuota(db, email, "instructor-activation-request", secret(), 3);
  if (!allowed) return { message: generic };
  const invitation = await db.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "InstructorInvitation" WHERE "id"='primary' FOR UPDATE`;
    if (!rows.length) return null;
    const invite = await tx.instructorInvitation.findUnique({ where: { id: "primary" } });
    if (!invite || invite.email !== email || invite.redeemedAt
        || await tx.user.findFirst({ where: { role: "INSTRUCTOR" }, select: { id: true } })
        || await tx.user.findUnique({ where: { email }, select: { id: true } })) return null;
    const clock = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
    const now = clock[0].now;
    if (invite.requestedAt && now.getTime() - invite.requestedAt.getTime() < 60_000) return null;
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await tx.instructorInvitation.update({ where: { id: "primary" }, data: {
      codeHash: digest(email, code),
      expiresAt: new Date(now.getTime() + 600_000),
      requestedAt: now,
      failedAttempts: 0,
    } });
    return code;
  }, { timeout: 15000 });
  if (invitation) {
    scheduleMail({ email, otp: invitation, type: "instructor-activation" });
  }
  return { message: generic };
}
export async function redeemInstructorActivation(
  db: PrismaClient,
  email: string,
  code: string,
  password: string,
) {
  const allowed = await consumeEmailQuota(db, email, "instructor-activation-redeem", secret(), 10);
  if (!allowed) throw new AccessError(429, "Too many attempts. Try again later.");
  const outcome = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "InstructorInvitation" WHERE "id"='primary' FOR UPDATE`;
    if (!rows.length) return "denied" as const;
    const invite = await tx.instructorInvitation.findUnique({ where: { id: "primary" } });
    if (!invite || invite.email !== email || invite.redeemedAt || !invite.codeHash ||
        !invite.expiresAt || invite.failedAttempts >= 5 ||
        await tx.user.findFirst({ where: { role: "INSTRUCTOR" }, select: { id: true } })) return "denied" as const;
    const nowRows = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
    if (invite.expiresAt <= nowRows[0].now) return "denied" as const;
    if (!constantTimeMatch(invite.codeHash, digest(email, code))) {
      await tx.instructorInvitation.update({ where: { id: "primary" }, data: {
        failedAttempts: { increment: 1 },
        ...(invite.failedAttempts >= 4 ? { codeHash: null, expiresAt: null } : {}),
      } });
      return "denied" as const;
    }
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) return "denied" as const;
    // Hash only after a valid single-use code; unauthenticated callers cannot
    // force expensive password hashing with arbitrary email addresses.
    const passwordHash = await hashPassword(password);
    const id = randomUUID();
    await tx.user.create({ data: {
      id, name: invite.name, email, emailVerified: true, role: "INSTRUCTOR",
      accounts: { create: { id: randomUUID(), accountId: id,
        providerId: "credential", password: passwordHash } },
    } });
    await tx.auditEvent.create({ data: { actorId: id, action: "INSTRUCTOR_ACTIVATED", entityId: id } });
    await tx.instructorInvitation.update({ where: { id: "primary" }, data: {
      codeHash: null, expiresAt: null, redeemedAt: nowRows[0].now,
    } });
    return "success" as const;
  }, { timeout: 15000 });
  if (outcome !== "success") throw new AccessError(400, unavailable);
  return { activated: true };
}
