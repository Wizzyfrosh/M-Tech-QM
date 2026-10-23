import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { applyTestMigrations } from "../scripts/test-migrations";
import { requestInstructorActivation, redeemInstructorActivation } from "../src/lib/instructor-activation";
import { AccessError } from "../src/lib/access";
import { verifyPassword } from "better-auth/crypto";
import { redeemActivationSchema } from "../src/lib/instructor-activation-policy";
const sent: { email: string; otp: string; type: string }[] = [];

let db: PrismaClient;
let lite: PGlite | undefined;
let socket: PGLiteSocketServer | undefined;
const ownerEmail = "owner.activation@example.test";
const ownerPassword = "Secure8!";
beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = "synthetic-secret-for-one-time-instructor-tests-1234";
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    lite = await PGlite.create();
    socket = new PGLiteSocketServer({ db: lite, host: "127.0.0.1", port: 55442 });
    await socket.start();
    url = "postgresql://postgres:postgres@127.0.0.1:55442/postgres";
  } else {
    const p = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(p.hostname) || !p.pathname.endsWith("_test"))
      throw new Error("Use only an isolated local _test database.");
  }
  const pool = new Pool({ connectionString: url, max: lite ? 1 : 5 });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await applyTestMigrations(pool);
  // Keep the migrated connection: closing/reopening it races PGlite socket cleanup.
  db = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
  await db.instructorInvitation.create({ data: { email: ownerEmail, name: "Initial Instructor" } });
}, 60000);
afterAll(async () => {
  await db?.$disconnect(); await socket?.stop();
  await new Promise(r => setTimeout(r, 50)); await lite?.close();
});
describe("one-time instructor onboarding", () => {
  it("requires 8 characters, rejects 7, and allows longer passwords", () => {
    const body = { email: ownerEmail, code: "123456", password: ownerPassword };
    expect(redeemActivationSchema.safeParse(body).success).toBe(true);
    expect(redeemActivationSchema.safeParse({ ...body, password: "Seven7!" }).success).toBe(false);
    expect(redeemActivationSchema.safeParse({ ...body, password: "ThisPasswordHasMoreThanEightChars!" }).success).toBe(true);
  });
  it("does not send an activation code to an unapproved email or reveal eligibility", async () => {
    const unknown = await requestInstructorActivation(db, "unapproved@example.test", mail => { sent.push(mail); });
    const approved = await requestInstructorActivation(db, ownerEmail, mail => { sent.push(mail); });
    expect(unknown).toEqual(approved);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ email: ownerEmail, type: "instructor-activation" });
    expect(sent[0].otp).toMatch(/^\d{6}$/);
    const record = await db.instructorInvitation.findUniqueOrThrow({ where: { id: "primary" } });
    expect(record.codeHash).not.toContain(sent[0].otp);
  });
  it("rejects invalid codes and prevents redeeming unapproved addresses", async () => {
    const code = sent[0].otp;
    await expect(redeemInstructorActivation(db, "unapproved@example.test", code, ownerPassword))
      .rejects.toMatchObject({ status: 400 } satisfies Partial<AccessError>);
    const wrong = code === "000000" ? "111111" : "000000";
    await expect(redeemInstructorActivation(db, ownerEmail, wrong, ownerPassword))
      .rejects.toMatchObject({ status: 400 } satisfies Partial<AccessError>);
    expect((await db.instructorInvitation.findUniqueOrThrow({ where: { id: "primary" } })).failedAttempts).toBe(1);
    expect(await db.user.count({ where: { role: "INSTRUCTOR" } })).toBe(0);
  });
  it("creates a verified instructor and password only after mailbox proof", async () => {
    const code = sent[0].otp;
    expect(await redeemInstructorActivation(db, ownerEmail, code, ownerPassword)).toEqual({ activated: true });
    const owner = await db.user.findUniqueOrThrow({ where: { email: ownerEmail }, include: { accounts: true } });
    expect(owner.role).toBe("INSTRUCTOR");
    expect(owner.emailVerified).toBe(true);
    expect(owner.accounts).toHaveLength(1);
    expect(await verifyPassword({ hash: owner.accounts[0].password!, password: ownerPassword })).toBe(true);
    expect(await db.auditEvent.count({ where: { action: "INSTRUCTOR_ACTIVATED" } })).toBe(1);
    const invite = await db.instructorInvitation.findUniqueOrThrow({ where: { id: "primary" } });
    expect(invite.redeemedAt).not.toBeNull();
    expect(invite.codeHash).toBeNull();
  });
  it("rejects replay and will never issue a second invitation after activation", async () => {
    await expect(redeemInstructorActivation(db, ownerEmail, sent[0].otp, ownerPassword))
      .rejects.toMatchObject({ status: 400 } satisfies Partial<AccessError>);
    await requestInstructorActivation(db, ownerEmail, mail => { sent.push(mail); });
    expect(sent).toHaveLength(1);
    expect(await db.user.count({ where: { role: "INSTRUCTOR" } })).toBe(1);
  });
});
