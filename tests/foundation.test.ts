import { applyTestMigrations } from "../scripts/test-migrations";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";
import { createAuth } from "../src/lib/auth-core";
import type { OtpMail } from "../src/lib/mail";
import { consumeEmailQuota } from "../src/lib/throttle";
import { getActor, getSignedInActor } from "../src/lib/access";
import { POST as approveStudents } from "../src/app/api/instructor/students/approve/route";
import { recordEmailDelivery } from "../src/lib/otp-delivery-receipt";

let db: PrismaClient;
let auth: ReturnType<typeof createAuth>;
let socket: PGLiteSocketServer | undefined;
let lite: PGlite | undefined;
const mail: OtpMail[] = [];
const base = "http://localhost:3000";
const password = "Strong8!";
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/auth", () => ({ getAuth: () => auth }));
import { GET as meGet, PATCH as mePatch } from "../src/app/api/me/route";
import {
  POST as addStudent,
  GET as listStudents,
} from "../src/app/api/instructor/students/route";
import { PATCH as changeStudent } from "../src/app/api/instructor/students/[id]/route";
import { POST as authPost } from "../src/app/api/auth/[...all]/route";

function request(path: string, body?: unknown, cookie?: string, origin = base) {
  return new Request(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function call(path: string, body: unknown) {
  return auth.handler(request(`/api/auth${path}`, body));
}
async function signIn(email: string, pass = password) {
  const r = await call("/sign-in/email", { email, password: pass });
  expect(r.status, await r.clone().text()).toBe(200);
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
function code(email: string, type: OtpMail["type"]) {
  return mail.filter((m) => m.email === email && m.type === type).at(-1)!.otp;
}
let studentCookie = "";
let instructorCookie = "";
let studentId = "";
let rosterId = "";
beforeAll(async () => {
  process.env.BETTER_AUTH_URL = base;
  process.env.BETTER_AUTH_SECRET =
    "local-test-only-not-a-production-secret-123456789";
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    lite = await PGlite.create();
    socket = new PGLiteSocketServer({
      db: lite,
      host: "127.0.0.1",
      port: 55432,
    });
    await socket.start();
    url = "postgresql://postgres:postgres@127.0.0.1:55432/postgres";
  } else {
    const parsed = new URL(url);
    if (
      !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
      !parsed.pathname.endsWith("_test")
    )
      throw new Error(
        "Tests require a dedicated local database ending in _test.",
      );
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await applyTestMigrations(pool);
  await pool.end();
  db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: lite ? 1 : 5 }),
  });
  auth = createAuth(db, {
    url: base,
    secret: process.env.BETTER_AUTH_SECRET!,
    sendMail: async (m) => {
      mail.push(m);
      recordEmailDelivery(true);
    },
  });
  const id = crypto.randomUUID();
  await db.user.create({
    data: {
      id,
      name: "Test Instructor",
      email: "instructor@example.test",
      emailVerified: true,
      role: "INSTRUCTOR",
      accounts: {
        create: {
          id: crypto.randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
  instructorCookie = await signIn("instructor@example.test");
}, 60000);
afterAll(async () => {
  await db?.$disconnect();
  await socket?.stop();
  await new Promise((resolve) => setTimeout(resolve, 50));
  await lite?.close();
});
describe("foundation authorization and account flow", () => {
  it("blocks anonymous roster reads and cross-origin mutations", async () => {
    expect(
      (await listStudents(request("/api/instructor/students"))).status,
    ).toBe(401);
    expect(
      (
        await addStudent(
          request(
            "/api/instructor/students",
            { name: "Student", email: "student@example.test" },
            instructorCookie,
            "https://evil.test",
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("instructor can add a normalized email; duplicates fail", async () => {
    const r = await addStudent(
      request(
        "/api/instructor/students",
        { name: "Test Student", email: " Student@Example.TEST " },
        instructorCookie,
      ),
    );
    expect(r.status).toBe(201);
    rosterId = (await r.json()).id;
    expect(
      (
        await addStudent(
          request(
            "/api/instructor/students",
            { name: "Duplicate", email: "student@example.test" },
            instructorCookie,
          ),
        )
      ).status,
    ).toBe(409);
  });
  it("allows independent student signup but enforces pending access until approval", async () => {
    const r = await authPost(request("/api/auth/sign-up/email", {
      name: "Independent Student", email: "unknown@example.test", password,
    }));
    expect(r.status, await r.clone().text()).toBe(200);
    const unverified = await db.user.findUniqueOrThrow({
      where: { email: "unknown@example.test" }, include: { roster: true },
    });
    expect(unverified.role).toBe("STUDENT");
    expect(unverified.emailVerified).toBe(false);
    expect(unverified.roster?.status).toBe("PENDING");
    const otp = code("unknown@example.test", "email-verification");
    expect(otp).toMatch(/^\d{6}$/);
    expect((await call("/email-otp/verify-email", {
      email: "unknown@example.test", otp,
    })).status).toBe(200);
    const pendingCookie = await signIn("unknown@example.test");
    const header = new Headers({ cookie: pendingCookie });
    expect((await getSignedInActor(header)).roster?.status).toBe("PENDING");
    await expect(getActor(header)).rejects.toMatchObject({status:403});
    expect((await meGet(request("/api/me", undefined, pendingCookie))).status).toBe(200);
    expect((await listStudents(request("/api/instructor/students", undefined, pendingCookie))).status).toBe(403);
    expect((await approveStudents(request("/api/instructor/students/approve",
      { ids:[unverified.roster!.id] }, pendingCookie))).status).toBe(403);
    const approval = await approveStudents(request("/api/instructor/students/approve",
      { ids:[unverified.roster!.id] }, instructorCookie));
    expect(approval.status, await approval.clone().text()).toBe(200);
    expect(await approval.json()).toEqual({approved:1,skipped:0});
    expect((await getActor(header)).roster?.status).toBe("ACTIVE");
    const repeat = await approveStudents(request("/api/instructor/students/approve",
      { ids:[unverified.roster!.id] }, instructorCookie));
    expect(await repeat.json()).toEqual({approved:0,skipped:1});
    expect(await db.auditEvent.count({where:{action:"STUDENT_APPROVED"}})).toBe(1);
  });
  it("reports a failed Brevo signup send even when Better Auth catches that error", async () => {
    const original = auth;
    auth = createAuth(db, {
      url: base,
      secret: process.env.BETTER_AUTH_SECRET!,
      sendMail: async () => {
        recordEmailDelivery(false);
        throw new Error("Synthetic Brevo rejection");
      },
    });
    try {
      const response = await authPost(request("/api/auth/sign-up/email", {
        name: "Mail Failure Test", email: "mail-failure@example.test", password,
      }));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: expect.stringContaining("verification code"),
      });
      const record = await db.user.findUnique({
        where: { email: "mail-failure@example.test" }, include: { roster: true },
      });
      if (record) expect(record.roster?.status).toBe("PENDING");
    } finally {
      auth = original;
    }
  });
  it("registers a roster student without allowing role escalation", async () => {
    const r = await authPost(
      request("/api/auth/sign-up/email", {
        name: "Test Student",
        email: "student@example.test",
        password,
        role: "INSTRUCTOR",
        emailVerified: true,
      }),
    );
    expect(r.status, await r.clone().text()).toBe(200);
    const user = await db.user.findUniqueOrThrow({
      where: { email: "student@example.test" },
      include: { roster: true },
    });
    studentId = user.id;
    expect(user.role).toBe("STUDENT");
    expect(user.emailVerified).toBe(false);
    expect(user.roster?.id).toBe(rosterId);
    expect(mail.some((m) => m.email === user.email)).toBe(true);
    expect(
      (await call("/sign-in/email", { email: user.email, password })).status,
    ).toBe(403);
  });
  it("rejects wrong verification code, then verifies and signs in", async () => {
    const otp = code("student@example.test", "email-verification");
    expect(
      (
        await call("/email-otp/verify-email", {
          email: "student@example.test",
          otp: otp === "000000" ? "111111" : "000000",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await call("/email-otp/verify-email", {
          email: "student@example.test",
          otp,
        })
      ).status,
    ).toBe(200);
    studentCookie = await signIn("student@example.test");
    expect(
      (await meGet(request("/api/me", undefined, studentCookie))).status,
    ).toBe(200);
  });
  it("student cannot read roster, add students, set role or change email", async () => {
    expect(
      (
        await listStudents(
          request("/api/instructor/students", undefined, studentCookie),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await addStudent(
          request(
            "/api/instructor/students",
            { name: "Illegal Student", email: "illegal@example.test" },
            studentCookie,
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await mePatch(
          request(
            "/api/me",
            { name: "Escalated", leaderboardOptOut: false, role: "INSTRUCTOR" },
            studentCookie,
          ),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await authPost(
          request(
            "/api/auth/change-email",
            { newEmail: "evil@example.test" },
            studentCookie,
          ),
        )
      ).status,
    ).toBe(404);
  });
  it("student can update only their profile and ranking preference", async () => {
    expect(
      (
        await mePatch(
          request(
            "/api/me",
            { name: "Updated Student", leaderboardOptOut: true },
            studentCookie,
          ),
        )
      ).status,
    ).toBe(200);
    const r = await meGet(request("/api/me", undefined, studentCookie));
    expect(await r.json()).toMatchObject({
      name: "Updated Student",
      role: "STUDENT",
      leaderboardOptOut: true,
    });
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("suspension immediately revokes access and stale updates fail", async () => {
    expect(
      (
        await changeStudent(
          request(
            `/api/instructor/students/${rosterId}`,
            { status: "SUSPENDED", revision: 0 },
            instructorCookie,
          ),
          { params: Promise.resolve({ id: rosterId }) },
        )
      ).status,
    ).toBe(200);
    expect(
      (await meGet(request("/api/me", undefined, studentCookie))).status,
    ).toBe(401);
    expect(
      (
        await call("/sign-in/email", {
          email: "student@example.test",
          password,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await changeStudent(
          request(
            `/api/instructor/students/${rosterId}`,
            { status: "ACTIVE", revision: 0 },
            instructorCookie,
          ),
          { params: Promise.resolve({ id: rosterId }) },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await changeStudent(
          request(
            `/api/instructor/students/${rosterId}`,
            { status: "ACTIVE", revision: 1 },
            instructorCookie,
          ),
          { params: Promise.resolve({ id: rosterId }) },
        )
      ).status,
    ).toBe(200);
    studentCookie = await signIn("student@example.test");
  });
  it("recovery conceals unknown emails and consumes codes once", async () => {
    const known = await call("/email-otp/request-password-reset", {
      email: "student@example.test",
    });
    const unknown = await call("/email-otp/request-password-reset", {
      email: "missing@example.test",
    });
    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());
    const otp = code("student@example.test", "forget-password");
    const newPassword = "Renewed8";
    expect(
      (
        await call("/email-otp/reset-password", {
          email: "student@example.test",
          otp,
          password: newPassword,
        })
      ).status,
    ).toBe(200);
    expect(
      (await meGet(request("/api/me", undefined, studentCookie))).status,
    ).toBe(401);
    expect(
      (
        await call("/email-otp/reset-password", {
          email: "student@example.test",
          otp,
          password: newPassword,
        })
      ).ok,
    ).toBe(false);
    studentCookie = await signIn("student@example.test", newPassword);
  });
  it("expired recovery code cannot change credentials", async () => {
    await call("/email-otp/request-password-reset", {
      email: "student@example.test",
    });
    const otp = code("student@example.test", "forget-password");
    await db.verification.updateMany({ data: { expiresAt: new Date(0) } });
    expect(
      (
        await call("/email-otp/reset-password", {
          email: "student@example.test",
          otp,
          password,
        })
      ).ok,
    ).toBe(false);
  });
  it("enforces a shared per-email quota atomically", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        consumeEmailQuota(
          db,
          "quota@example.test",
          "test",
          process.env.BETTER_AUTH_SECRET!,
          5,
        ),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
  });
  it("database prevents a second instructor and preserves audit events", async () => {
    expect(await db.auditEvent.count()).toBe(4);
    expect(
      await db.user.findUnique({ where: { id: studentId } }),
    ).not.toBeNull();
    await expect(
      db.user.create({
        data: {
          id: crypto.randomUUID(),
          name: "Second Instructor",
          email: "second@example.test",
          role: "INSTRUCTOR",
        },
      }),
    ).rejects.toThrow();
  });
});
