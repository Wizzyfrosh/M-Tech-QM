import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { applyTestMigrations } from "../scripts/test-migrations";
import {
  notify,
  notifyPublished,
  notifyRegistration,
  notifyAccess,
  deliverNotifications,
} from "../src/lib/notifications";
vi.mock("next/server", () => ({ after: () => {} }));
let actorId = "";
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/access", () => ({
  getSignedInActor: async () => ({ id: actorId, role: "STUDENT" }),
}));
import { GET, PATCH } from "../src/app/api/notifications/route";
let db: PrismaClient;
let lite: PGlite | undefined, socket: PGLiteSocketServer | undefined;
let instructorId = "",
  quizId = "";
beforeAll(async () => {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    lite = await PGlite.create();
    socket = new PGLiteSocketServer({
      db: lite,
      host: "127.0.0.1",
      port: 55449,
    });
    await socket.start();
    url = "postgresql://postgres:postgres@127.0.0.1:55449/postgres";
  } else {
    const parsed = new URL(url);
    if (
      !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
      !parsed.pathname.endsWith("_test")
    )
      throw new Error("AI tests require an isolated local _test database");
  }
  const pool = new Pool({ connectionString: url, max: lite ? 1 : 5 });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await applyTestMigrations(pool);
  // Keep the migrated connection: closing/reopening it races PGlite socket cleanup.
  db = new PrismaClient({
    adapter: new PrismaPg(pool, { disposeExternalPool: true }),
  });
  instructorId = crypto.randomUUID();
  await db.user.create({
    data: {
      id: instructorId,
      name: "AI Test Instructor",
      email: "ai-instructor@example.test",
      role: "INSTRUCTOR",
      emailVerified: true,
    },
  });
  const quiz = await db.quiz.create({
    data: {
      title: "AI draft sandbox",
      lessonLabel: "JavaScript",
      createdBy: instructorId,
    },
  });
  quizId = quiz.id;
}, 60000);

afterAll(async () => {
  delete process.env.MAIL_TRANSPORT;
  await db?.$disconnect();
  await socket?.stop();
  await new Promise((resolve) => setTimeout(resolve, 50));
  await lite?.close();
});

describe("activity notifications", () => {
  it("deduplicates registration and targets quiz alerts only to verified approved students", async () => {
    await notifyRegistration(db, {
      id: "synthetic-new",
      name: "New learner",
      email: "new@example.test",
    });
    await notifyRegistration(db, {
      id: "synthetic-new",
      name: "New learner",
      email: "new@example.test",
    });
    expect(
      await db.notification.count({ where: { userId: instructorId } }),
    ).toBe(1);
    for (const [name, status, verified] of [
      ["active", "ACTIVE", true],
      ["pending", "PENDING", true],
      ["revoked", "SUSPENDED", true],
      ["unverified", "ACTIVE", false],
    ] as const) {
      const user = await db.user.create({
        data: {
          id: crypto.randomUUID(),
          name,
          email: `${name}@example.test`,
          emailVerified: verified,
          roster: {
            create: { name, normalizedEmail: `${name}@example.test`, status },
          },
        },
      });
      if (name === "active") actorId = user.id;
    }
    const quiz = await db.quiz.findUniqueOrThrow({ where: { id: quizId } });
    await notifyPublished(db, quiz);
    await notifyPublished(db, quiz);
    const rows = await db.notification.findMany({
      where: { kind: "QUIZ_PUBLISHED" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(actorId);
  });
  it("keeps inbox data and read receipts private to the signed-in recipient", async () => {
    const response = await GET(
      new Request("http://localhost/api/notifications"),
    );
    const data = await response.json();
    expect(data.items).toHaveLength(1);
    expect(data.unread).toBe(1);
    expect(JSON.stringify(data)).not.toContain("new@example.test");
    const other = await db.notification.findFirstOrThrow({
      where: { userId: instructorId },
    });
    process.env.BETTER_AUTH_URL = "http://localhost";
    const mark = () =>
      PATCH(
        new Request("http://localhost/api/notifications", {
          method: "PATCH",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: JSON.stringify({ id: other.id }),
        }),
      );
    expect((await mark()).status).toBe(200);
    expect(
      (await db.notification.findUniqueOrThrow({ where: { id: other.id } }))
        .readAt,
    ).toBeNull();
    await PATCH(
      new Request("http://localhost/api/notifications", {
        method: "PATCH",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    expect(
      await db.notification.count({ where: { userId: actorId, readAt: null } }),
    ).toBe(0);
  });
  it("delivers privately once and excludes revoked recipients before sending", async () => {
    process.env.MAIL_TRANSPORT = "file";
    await deliverNotifications(db);
    const first = await db.notification.findMany();
    expect(first.every((n) => n.emailStatus === "SENT")).toBe(true);
    await deliverNotifications(db);
    expect(
      await db.notification.count({ where: { emailStatus: "SENT" } }),
    ).toBe(first.length);
    await notify(db, [
      {
        userId: actorId,
        eventKey: "another-quiz",
        kind: "QUIZ_PUBLISHED",
        title: "Next quiz",
        message: "A quiz is available",
        href: "/dashboard",
      },
    ]);
    await db.rosterEntry.update({
      where: { userId: actorId },
      data: { status: "SUSPENDED" },
    });
    await deliverNotifications(db);
    expect(
      (
        await db.notification.findFirstOrThrow({
          where: { eventKey: "another-quiz" },
        })
      ).emailStatus,
    ).toBe("SKIPPED");
    const roster = await db.rosterEntry.findUniqueOrThrow({
      where: { userId: actorId },
    });
    await notifyAccess(db, roster);
    await deliverNotifications(db);
    expect(
      (await db.notification.findFirstOrThrow({ where: { kind: "ACCESS" } }))
        .emailStatus,
    ).toBe("SENT");
  });
});
it("does not blindly resend ambiguous provider responses and uses private idempotent sends", async () => {
  const id = crypto.randomUUID();
  await db.notification.create({
    data: {
      id,
      userId: actorId,
      eventKey: "uncertain",
      kind: "ACCESS",
      title: "Access update",
      message: "<private & content>",
      href: "/dashboard",
    },
  });
  process.env.MAIL_TRANSPORT = "brevo";
  process.env.BREVO_API_KEY = "synthetic-key";
  process.env.MAIL_FROM_EMAIL = "sender@example.test";
  process.env.BETTER_AUTH_URL = "https://example.test";
  const fetcher = vi.fn(
    async () => new Response("private provider response", { status: 503 }),
  );
  vi.stubGlobal("fetch", fetcher);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await Promise.all([deliverNotifications(db), deliverNotifications(db)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.to).toHaveLength(1);
    expect(body.headers.idempotencyKey).toBe(id);
    expect(body.htmlContent).toContain("&lt;private &amp; content&gt;");
    expect(
      (await db.notification.findUniqueOrThrow({ where: { id } })).emailStatus,
    ).toBe("UNKNOWN");
    await deliverNotifications(db);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /synthetic-key|private provider response|example.test/,
    );
  } finally {
    vi.unstubAllGlobals();
    log.mockRestore();
    delete process.env.BREVO_API_KEY;
    delete process.env.MAIL_FROM_EMAIL;
  }
});
