import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { applyTestMigrations } from "../scripts/test-migrations";
import {
  createAssignment,
  assignmentList,
  assignmentDetail,
  saveAssignment,
  assignmentAction,
  writeSubmission,
  reviewSubmission,
  instructorSubmission,
  assignmentSubmissions,
} from "../src/lib/assignments";
import {
  assignmentDraftSchema,
  submissionSchema,
  pinnedGitHubLink,
  type AssignmentDraft,
} from "../src/lib/assignment-policy";
let db: PrismaClient,
  lite: PGlite | undefined,
  socket: PGLiteSocketServer | undefined;
let owner = "",
  pupil = "",
  other = "",
  pending = "",
  suspended = "",
  unverified = "";
let routeActor = "";
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/access", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/lib/access")>();
  return {
    ...original,
    getActor: async () => {
      if (!routeActor)
        throw new original.AccessError(401, "Sign in to continue.");
      const actor = await db.user.findUniqueOrThrow({
        where: { id: routeActor },
      });
      return actor;
    },
    requireInstructor: async () => {
      if (routeActor !== owner)
        throw new original.AccessError(403, "Instructor access required.");
      return { id: owner, role: "INSTRUCTOR" };
    },
  };
});
import { GET as getDetail } from "../src/app/api/assignments/[id]/route";
import { POST as postSubmission } from "../src/app/api/assignments/[id]/submission/route";
import { POST as postAction } from "../src/app/api/instructor/assignments/[id]/route";
const draft: AssignmentDraft = {
  title: "Build a Flutter login screen",
  instructions:
    "Create email and password fields with validation and responsive layout.",
  rubric: "Functionality 50, widgets 25, responsiveness 15, organization 10.",
  resources: ["https://flutter.dev"],
  submissionType: "PROJECT",
  maxMarks: 100,
  deadline: null,
  allowLate: false,
};
const commit = `https://github.com/synthetic/flutter-login/commit/${"a".repeat(40)}`;
const input = {
  revision: 0,
  responseText: "Built a responsive form and validated empty inputs.",
  projectUrl: commit,
  evidenceUrls: ["https://example.test/demo"],
};
async function fresh(overrides: Partial<AssignmentDraft> = {}) {
  const a = await createAssignment(db, owner);
  const saved = await saveAssignment(db, owner, a.id, 0, {
    ...draft,
    ...overrides,
  });
  await assignmentAction(db, owner, a.id, saved.revision, "publish");
  return (await assignmentDetail(db, owner, a.id, true)).assignment;
}
beforeAll(async () => {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    lite = await PGlite.create();
    socket = new PGLiteSocketServer({
      db: lite,
      host: "127.0.0.1",
      port: 55459,
    });
    await socket.start();
    url = "postgresql://postgres:postgres@127.0.0.1:55459/postgres";
  } else {
    const parsed = new URL(url);
    if (
      !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
      !parsed.pathname.endsWith("_test")
    )
      throw Error("Dedicated local test database required.");
  }
  const pool = new Pool({ connectionString: url, max: lite ? 1 : 5 });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await applyTestMigrations(pool);
  db = new PrismaClient({
    adapter: new PrismaPg(pool, { disposeExternalPool: true }),
  });
  owner = crypto.randomUUID();
  await db.user.create({
    data: {
      id: owner,
      name: "Instructor",
      email: "assignment-instructor@example.test",
      emailVerified: true,
      role: "INSTRUCTOR",
    },
  });
  for (const [name, status, verified] of [
    ["pupil", "ACTIVE", true],
    ["other", "ACTIVE", true],
    ["pending", "PENDING", true],
    ["suspended", "SUSPENDED", true],
    ["unverified", "ACTIVE", false],
  ] as const) {
    const u = await db.user.create({
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
    if (name === "pupil") pupil = u.id;
    if (name === "other") other = u.id;
    if (name === "pending") pending = u.id;
    if (name === "suspended") suspended = u.id;
    if (name === "unverified") unverified = u.id;
  }
}, 60000);
afterAll(async () => {
  await db?.$disconnect();
  await socket?.stop();
  await new Promise((r) => setTimeout(r, 50));
  await lite?.close();
});
describe("standalone assignments", () => {
  it("validates plain text, safe evidence links and fixed GitHub versions", () => {
    expect(pinnedGitHubLink(commit)).toBe(true);
    for (const value of [
      "https://github.com/user/repo",
      "https://github.com/user/repo/tree/main",
      "https://github.com.evil.test/u/r/commit/" + "a".repeat(40),
    ])
      expect(pinnedGitHubLink(value)).toBe(false);
    expect(
      submissionSchema.safeParse({
        ...input,
        action: "submit",
        evidenceUrls: ["javascript:alert(1)"],
      }).success,
    ).toBe(false);
    expect(
      assignmentDraftSchema.safeParse({
        ...draft,
        resources: ["https://user:secret@example.test"],
      }).success,
    ).toBe(false);
    expect(
      submissionSchema.safeParse({ ...input, action: "submit", grade: 100 })
        .success,
    ).toBe(false);
  });
  it("keeps drafts private, gates roles and publishes independently of quizzes", async () => {
    const a = await createAssignment(db, owner);
    expect(await db.quiz.count()).toBe(0);
    await expect(
      assignmentDetail(db, pupil, a.id, false),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await assignmentList(db, pupil, false, 1)).items.some(
        (x) => x.id === a.id,
      ),
    ).toBe(false);
    await expect(createAssignment(db, pupil)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      assignmentAction(db, owner, a.id, 0, "publish"),
    ).rejects.toMatchObject({ status: 409 });
    const saved = await saveAssignment(db, owner, a.id, 0, draft);
    await expect(
      saveAssignment(db, owner, a.id, 0, draft),
    ).rejects.toMatchObject({ status: 409 });
    await assignmentAction(db, owner, a.id, saved.revision, "publish");
    const notices = await db.notification.findMany({
      where: { eventKey: `assignment-published:${a.id}` },
    });
    expect(new Set(notices.map((n) => n.userId))).toEqual(
      new Set([pupil, other]),
    );
    await expect(
      saveAssignment(db, owner, a.id, 2, draft),
    ).rejects.toMatchObject({ status: 409 });
    for (const id of [pending, suspended, unverified])
      await expect(assignmentDetail(db, id, a.id, false)).rejects.toMatchObject(
        { status: 403 },
      );
  });
  it("saves private drafts and commits one snapshot on duplicate submission retries", async () => {
    const a = await fresh();
    const save = await writeSubmission(db, pupil, a.id, {
      ...input,
      action: "save",
    });
    expect(
      (await assignmentDetail(db, pupil, a.id, false)).submission?.status,
    ).toBe("DRAFT");
    const privateDraft = await instructorSubmission(db, owner, a.id, save.id);
    expect(privateDraft.responseText).toBe("");
    expect(privateDraft.projectUrl).toBe("");
    const submitted = {
      ...input,
      revision: save.revision,
      action: "submit" as const,
    };
    const results = await Promise.all([
      writeSubmission(db, pupil, a.id, submitted),
      writeSubmission(db, pupil, a.id, submitted),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(
      await db.assignmentVersion.count({ where: { submissionId: save.id } }),
    ).toBe(1);
    expect(
      await db.notification.count({
        where: { eventKey: `assignment-submitted:${save.id}:1` },
      }),
    ).toBe(1);
    await expect(
      writeSubmission(db, pupil, a.id, { ...input, action: "save" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await assignmentDetail(db, other, a.id, false)).submission,
    ).toBeNull();
    const snapshot = await db.assignmentVersion.findFirstOrThrow({
      where: { submissionId: save.id },
    });
    await expect(
      db.$transaction((tx) =>
        tx.assignmentVersion.update({
          where: { id: snapshot.id },
          data: { responseText: "tamper" },
        }),
      ),
    ).rejects.toThrow(/immutable/);
  });
  it("requires a fixed project version but accepts text-only assignments", async () => {
    const a = await fresh();
    await expect(
      writeSubmission(db, pupil, a.id, {
        ...input,
        projectUrl: "https://github.com/user/repo",
        action: "submit",
      }),
    ).rejects.toMatchObject({ status: 400 });
    const text = await fresh({ submissionType: "TEXT" });
    expect(
      (
        await writeSubmission(db, pupil, text.id, {
          ...input,
          projectUrl: "",
          evidenceUrls: [],
          action: "submit",
        })
      ).status,
    ).toBe("SUBMITTED");
  });
  it("preserves versions on edits and enforces deadline, closure, late and revision rules", async () => {
    const a = await fresh();
    const s = await writeSubmission(db, pupil, a.id, {
      ...input,
      action: "submit",
    });
    const edit = await writeSubmission(db, pupil, a.id, {
      ...input,
      revision: s.revision,
      action: "edit",
    });
    expect(edit.status).toBe("DRAFT");
    await writeSubmission(db, pupil, a.id, {
      ...input,
      revision: edit.revision,
      responseText: "Second version",
      action: "submit",
    });
    expect(
      await db.assignmentVersion.count({ where: { submissionId: s.id } }),
    ).toBe(2);
    const past = new Date(Date.now() - 60000);
    await db.assignment.update({
      where: { id: a.id },
      data: { deadline: past },
    });
    await expect(
      writeSubmission(db, other, a.id, { ...input, action: "submit" }),
    ).rejects.toMatchObject({ status: 409 });
    await db.assignment.update({
      where: { id: a.id },
      data: { allowLate: true },
    });
    const late = await writeSubmission(db, other, a.id, {
      ...input,
      action: "submit",
    });
    expect(
      (
        await db.assignmentSubmission.findUniqueOrThrow({
          where: { id: late.id },
        })
      ).late,
    ).toBe(true);
    await assignmentAction(db, owner, a.id, 2, "close");
    await expect(
      writeSubmission(db, other, a.id, {
        ...input,
        revision: late.revision,
        action: "edit",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("never exposes private grading feedback and only releases eligible graded submissions", async () => {
    const a = await fresh();
    const first = await writeSubmission(db, pupil, a.id, {
      ...input,
      action: "submit",
    });
    const second = await writeSubmission(db, other, a.id, {
      ...input,
      action: "submit",
    });
    await expect(
      reviewSubmission(db, pupil, a.id, first.id, {
        action: "grade",
        revision: first.revision,
        grade: 99,
        feedback: "x",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      reviewSubmission(db, owner, a.id, first.id, {
        action: "grade",
        revision: first.revision,
        grade: 101,
        feedback: "x",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await reviewSubmission(db, owner, a.id, first.id, {
      action: "grade",
      revision: first.revision,
      grade: 85,
      feedback: "PRIVATE_GRADE_FEEDBACK",
    });
    await reviewSubmission(db, owner, a.id, second.id, {
      action: "grade",
      revision: second.revision,
      grade: 70,
      feedback: "Suspended feedback",
    });
    const hidden = await assignmentDetail(db, pupil, a.id, false);
    expect(hidden.submission?.grade).toBeNull();
    expect(hidden.submission?.status).toBe("SUBMITTED");
    expect(JSON.stringify(hidden)).not.toContain("PRIVATE_GRADE_FEEDBACK");
    await db.rosterEntry.update({
      where: { userId: other },
      data: { status: "SUSPENDED" },
    });
    expect(await assignmentAction(db, owner, a.id, 2, "release")).toEqual({
      released: 1,
    });
    expect(await assignmentAction(db, owner, a.id, 3, "release")).toEqual({
      released: 0,
    });
    const visible = await assignmentDetail(db, pupil, a.id, false);
    expect(visible.submission?.grade).toBe(85);
    expect(visible.submission?.feedback).toBe("PRIVATE_GRADE_FEEDBACK");
    const notices = await db.notification.findMany({
      where: {
        eventKey: {
          in: [`assignment-grade:${first.id}`, `assignment-grade:${second.id}`],
        },
      },
    });
    expect(notices.map((n) => n.userId)).toEqual([pupil]);
    expect(notices[0].message).toContain("85/100");
    await expect(
      reviewSubmission(db, owner, a.id, first.id, {
        action: "grade",
        revision: visible.submission!.revision,
        grade: 5,
        feedback: "rewrite",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await db.rosterEntry.update({
      where: { userId: other },
      data: { status: "ACTIVE" },
    });
    expect(await assignmentAction(db, owner, a.id, 3, "release")).toEqual({
      released: 1,
    });
  });
  it("lets an explicit changes request reopen work after closure and keeps prior versions", async () => {
    const a = await fresh();
    const s = await writeSubmission(db, pupil, a.id, {
      ...input,
      action: "submit",
    });
    await assignmentAction(db, owner, a.id, 2, "close");
    const changed = await reviewSubmission(db, owner, a.id, s.id, {
      action: "request_changes",
      revision: s.revision,
      feedback: "Add empty-field validation.",
    });
    const detail = await assignmentDetail(db, pupil, a.id, false);
    expect(detail.canWrite).toBe(true);
    expect(detail.submission?.changeRequest).toContain("validation");
    await writeSubmission(db, pupil, a.id, {
      ...input,
      revision: changed.revision,
      responseText: "Validation added.",
      action: "submit",
    });
    expect(
      (await assignmentDetail(db, pupil, a.id, false)).versions,
    ).toHaveLength(2);
    const stats = await assignmentSubmissions(db, owner, a.id, 1);
    expect(stats.items).toHaveLength(1);
    expect(stats.notSubmitted).toBe(1);
    await assignmentAction(db, owner, a.id, 3, "archive");
    expect(
      (await assignmentList(db, other, false, 1)).items.some(
        (x) => x.id === a.id,
      ),
    ).toBe(false);
    expect(
      (await assignmentDetail(db, pupil, a.id, false)).versions,
    ).toHaveLength(2);
    await expect(
      assignmentDetail(db, other, a.id, false),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("rejects revoked writes, forged grades, cross-origin and unauthenticated requests", async () => {
    const a = await fresh();
    for (const id of [pending, suspended, unverified])
      await expect(
        writeSubmission(db, id, a.id, { ...input, action: "submit" }),
      ).rejects.toMatchObject({ status: 403 });
    const context = { params: Promise.resolve({ id: a.id }) };
    routeActor = "";
    expect(
      (
        await getDetail(
          new Request("http://localhost/api/assignments/" + a.id),
          context,
        )
      ).status,
    ).toBe(401);
    routeActor = pupil;
    process.env.BETTER_AUTH_URL = "http://localhost";
    const request = (body: unknown, origin = "http://localhost") =>
      new Request("http://localhost/api/assignments/" + a.id + "/submission", {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify(body),
      });
    expect(
      (
        await postSubmission(
          request({ ...input, action: "submit" }, "https://evil.test"),
          context,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await postSubmission(
          request({ ...input, action: "submit", grade: 100 }),
          context,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await postAction(
          request({ action: "release", revision: 2, acknowledged: true }),
          context,
        )
      ).status,
    ).toBe(403);
    expect(
      await db.assignmentSubmission.count({ where: { assignmentId: a.id } }),
    ).toBe(0);
  });
});

// File tests use an in-memory object store; no real files or credentials leave the test process.
import {
  uploadAssignmentFile,
  downloadAssignmentFile,
  cleanupAssignmentFiles,
  readAssignmentUpload,
} from "../src/lib/assignment-files";
import {
  MAX_ASSIGNMENT_FILE,
  validFileSignature,
} from "../src/lib/assignment-file-policy";
import type { AssignmentFileStore } from "../src/lib/assignment-file-store";
import { GET as downloadRoute } from "../src/app/api/assignment-files/[fileId]/route";
import { POST as uploadRoute } from "../src/app/api/assignments/[id]/files/route";
const objects = new Map<string, Uint8Array>();
let puts = 0;
const memoryStore: AssignmentFileStore = {
  async put(key, bytes) {
    puts++;
    objects.set(key, new Uint8Array(bytes));
  },
  async get(key) {
    const value = objects.get(key);
    if (!value) throw Error("missing");
    return value;
  },
  async remove(key) {
    objects.delete(key);
  },
};
const zipBytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...Array(18).fill(0)]);
describe("private assignment files", () => {
  it("checks actual signatures, names and streamed size rather than trusting request metadata", async () => {
    expect(validFileSignature("project.zip", zipBytes)).toBe(true);
    expect(validFileSignature("image.png", zipBytes)).toBe(false);
    const a = await fresh();
    for (const name of [
      "../project.zip",
      "picture.svg",
      "project.apk",
      "header\r\n.zip",
      "fake.png",
    ])
      await expect(
        uploadAssignmentFile(
          db,
          pupil,
          a.id,
          crypto.randomUUID(),
          name,
          zipBytes,
          memoryStore,
        ),
      ).rejects.toMatchObject({ status: 400 });
    const request = new Request("http://localhost/upload", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "content-length": "1",
      },
      body: new Uint8Array(MAX_ASSIGNMENT_FILE + 1),
    });
    await expect(readAssignmentUpload(request)).rejects.toMatchObject({
      status: 413,
    });
    await expect(
      readAssignmentUpload(
        new Request("http://localhost", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: "hello",
        }),
      ),
    ).rejects.toMatchObject({ status: 415 });
  });
  it("keeps unsubmitted files private, deduplicates retries and denies revoked students", async () => {
    const a = await fresh();
    const id = crypto.randomUUID();
    const before = puts;
    const first = await uploadAssignmentFile(
      db,
      pupil,
      a.id,
      id,
      "project.zip",
      zipBytes,
      memoryStore,
    );
    expect(
      await uploadAssignmentFile(
        db,
        pupil,
        a.id,
        id,
        "project.zip",
        zipBytes,
        memoryStore,
      ),
    ).toEqual(first);
    expect(puts - before).toBe(1);
    expect(
      (await downloadAssignmentFile(db, pupil, id, memoryStore)).bytes,
    ).toEqual(zipBytes);
    await expect(
      downloadAssignmentFile(db, owner, id, memoryStore),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      downloadAssignmentFile(db, other, id, memoryStore),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      uploadAssignmentFile(
        db,
        other,
        a.id,
        id,
        "project.zip",
        zipBytes,
        memoryStore,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      uploadAssignmentFile(
        db,
        pupil,
        a.id,
        id,
        "changed.zip",
        zipBytes,
        memoryStore,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await db.rosterEntry.update({
      where: { userId: pupil },
      data: { status: "SUSPENDED" },
    });
    await expect(
      downloadAssignmentFile(db, pupil, id, memoryStore),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      uploadAssignmentFile(
        db,
        pupil,
        a.id,
        crypto.randomUUID(),
        "project.zip",
        zipBytes,
        memoryStore,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await db.rosterEntry.update({
      where: { userId: pupil },
      data: { status: "ACTIVE" },
    });
  });
  it("recovers an interrupted provider upload without creating another reservation", async () => {
    const a = await fresh();
    const id = crypto.randomUUID();
    const failed: AssignmentFileStore = {
      ...memoryStore,
      async put() {
        throw Error("ambiguous provider result");
      },
    };
    await expect(
      uploadAssignmentFile(db, pupil, a.id, id, "retry.zip", zipBytes, failed),
    ).rejects.toThrow("ambiguous");
    expect(
      (await db.assignmentFile.findUniqueOrThrow({ where: { id } })).state,
    ).toBe("PENDING");
    const file = await uploadAssignmentFile(
      db,
      pupil,
      a.id,
      id,
      "retry.zip",
      zipBytes,
      memoryStore,
    );
    expect(file.id).toBe(id);
    expect(await db.assignmentFile.count({ where: { id } })).toBe(1);
  });
  it("accepts a ZIP instead of GitHub, preserves snapshots and rejects borrowed or pending attachments", async () => {
    const a = await fresh();
    const file = await uploadAssignmentFile(
      db,
      pupil,
      a.id,
      crypto.randomUUID(),
      "flutter.zip",
      zipBytes,
      memoryStore,
    );
    const otherFile = await uploadAssignmentFile(
      db,
      other,
      a.id,
      crypto.randomUUID(),
      "other.zip",
      zipBytes,
      memoryStore,
    );
    await expect(
      writeSubmission(db, pupil, a.id, {
        ...input,
        action: "save",
        attachmentIds: [otherFile.id],
      }),
    ).rejects.toMatchObject({ status: 400 });
    const work = await writeSubmission(db, pupil, a.id, {
      ...input,
      projectUrl: "",
      action: "submit",
      attachmentIds: [file.id],
    });
    expect(
      (await instructorSubmission(db, owner, a.id, work.id)).files,
    ).toEqual([file]);
    expect(
      (await downloadAssignmentFile(db, owner, file.id, memoryStore)).bytes,
    ).toEqual(zipBytes);
    const edited = await writeSubmission(db, pupil, a.id, {
      ...input,
      action: "edit",
      revision: work.revision,
    });
    await writeSubmission(db, pupil, a.id, {
      ...input,
      action: "submit",
      revision: edited.revision,
      attachmentIds: [],
    });
    const detail = await assignmentDetail(db, pupil, a.id, false);
    expect(detail.versions[1].files.map((f) => f.id)).toEqual([file.id]);
    expect(detail.versions[0].files).toEqual([]);
    const b = await fresh();
    await expect(
      writeSubmission(db, pupil, b.id, {
        ...input,
        action: "submit",
        attachmentIds: [file.id],
      }),
    ).rejects.toMatchObject({ status: 400 });
    const row = await db.assignmentFile.findUniqueOrThrow({
      where: { id: file.id },
    });
    objects.set(row.objectKey, new Uint8Array([1, 2, 3]));
    await expect(
      downloadAssignmentFile(db, owner, file.id, memoryStore),
    ).rejects.toMatchObject({ status: 503 });
    objects.set(row.objectKey, zipBytes);
  });
  it("cleans abandoned uploads while preserving saved drafts and historical files", async () => {
    const a = await fresh({ submissionType: "TEXT" });
    const keep = await uploadAssignmentFile(
      db,
      pupil,
      a.id,
      crypto.randomUUID(),
      "keep.zip",
      zipBytes,
      memoryStore,
    );
    const remove = await uploadAssignmentFile(
      db,
      pupil,
      a.id,
      crypto.randomUUID(),
      "unused.zip",
      zipBytes,
      memoryStore,
    );
    const recovered = await uploadAssignmentFile(
      db,
      pupil,
      a.id,
      crypto.randomUUID(),
      "recovered.zip",
      zipBytes,
      memoryStore,
    );
    await writeSubmission(db, pupil, a.id, {
      ...input,
      action: "save",
      attachmentIds: [keep.id],
    });
    await db.assignmentFile.updateMany({
      where: { id: { in: [keep.id, remove.id, recovered.id] } },
      data: { updatedAt: new Date(Date.now() - 2 * 86400000) },
    });
    await uploadAssignmentFile(
      db,
      pupil,
      a.id,
      recovered.id,
      "recovered.zip",
      zipBytes,
      memoryStore,
    );
    await cleanupAssignmentFiles(db, pupil, a.id, memoryStore);
    expect(
      (
        await db.assignmentFile.findUniqueOrThrow({
          where: { id: recovered.id },
        })
      ).state,
    ).toBe("READY");
    expect(
      (await db.assignmentFile.findUniqueOrThrow({ where: { id: keep.id } }))
        .state,
    ).toBe("READY");
    expect(
      (await db.assignmentFile.findUniqueOrThrow({ where: { id: remove.id } }))
        .state,
    ).toBe("DELETED");
    expect(objects.has(`assignment-files/${keep.id}`)).toBe(true);
    expect(objects.has(`assignment-files/${remove.id}`)).toBe(false);
  });
  it("bounds retained storage and protects upload/download HTTP routes", async () => {
    const a = await fresh();
    await db.assignmentFile.createMany({
      data: Array.from({ length: 10 }, () => {
        const id = crypto.randomUUID();
        return {
          id,
          assignmentId: a.id,
          userId: pupil,
          name: "quota.zip",
          extension: "zip",
          size: MAX_ASSIGNMENT_FILE,
          sha256: "synthetic",
          objectKey: `assignment-files/${id}`,
        };
      }),
    });
    await expect(
      uploadAssignmentFile(
        db,
        pupil,
        a.id,
        crypto.randomUUID(),
        "project.zip",
        zipBytes,
        memoryStore,
      ),
    ).rejects.toMatchObject({ status: 429 });
    routeActor = "";
    expect(
      (
        await downloadRoute(new Request("http://localhost/file"), {
          params: Promise.resolve({ fileId: crypto.randomUUID() }),
        })
      ).status,
    ).toBe(401);
    routeActor = pupil;
    process.env.BETTER_AUTH_URL = "http://localhost";
    expect(
      (
        await uploadRoute(
          new Request("http://localhost/upload", {
            method: "POST",
            headers: { origin: "https://evil.test" },
            body: zipBytes,
          }),
          { params: Promise.resolve({ id: a.id }) },
        )
      ).status,
    ).toBe(403);
  });
});
