import "server-only";
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AccessError } from "./access";
import {
  MAX_ASSIGNMENT_FILE,
  validFileName,
  validFileSignature,
  fileExtension,
} from "./assignment-file-policy";
import {
  assignmentFileStore,
  type AssignmentFileStore,
} from "./assignment-file-store";
export const fileInfoSelect = {
  id: true,
  name: true,
  size: true,
  extension: true,
} as const;
export async function assignmentFileInfos(
  tx: Prisma.TransactionClient,
  ids: string[],
  assignmentId: string,
  userId: string,
) {
  return ids.length
    ? tx.assignmentFile.findMany({
        where: { id: { in: ids }, assignmentId, userId, state: "READY" },
        select: fileInfoSelect,
      })
    : [];
}
async function activeStudent(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "RosterEntry" WHERE "userId" = ${userId} FOR SHARE`;
  const user = await tx.user.findUnique({
    where: { id: userId },
    include: { roster: true },
  });
  if (
    user?.role !== "STUDENT" ||
    !user.emailVerified ||
    user.roster?.status !== "ACTIVE"
  )
    throw new AccessError(403, "Approved student access required.");
}
async function writable(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  userId: string,
) {
  await activeStudent(tx, userId);
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "Assignment" WHERE "id" = ${assignmentId} FOR UPDATE`;
  if (!rows.length) throw new AccessError(404, "Assignment not found.");
  const assignment = await tx.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
  });
  if (assignment.status === "DRAFT")
    throw new AccessError(404, "Assignment not found.");
  const sub = await tx.assignmentSubmission.findUnique({
    where: { assignmentId_userId: { assignmentId, userId } },
  });
  const time = (
    await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`
  )[0].now;
  const requested = sub?.status === "CHANGES_REQUESTED";
  if (
    assignment.status === "ARCHIVED" ||
    (assignment.status !== "PUBLISHED" && !requested) ||
    (assignment.deadline &&
      time >= assignment.deadline &&
      !assignment.allowLate &&
      !requested) ||
    (sub && !["DRAFT", "CHANGES_REQUESTED"].includes(sub.status))
  )
    throw new AccessError(
      409,
      "Return ungraded work to draft, or ask for changes, before uploading files. The assignment must still accept submissions.",
    );
}
export async function uploadAssignmentFile(
  db: PrismaClient,
  userId: string,
  assignmentId: string,
  id: string,
  name: string,
  bytes: Uint8Array,
  store: AssignmentFileStore = assignmentFileStore(),
) {
  if (
    !validFileName(name) ||
    !bytes.length ||
    bytes.length > MAX_ASSIGNMENT_FILE ||
    !validFileSignature(name, bytes)
  )
    throw new AccessError(
      400,
      "Choose a valid ZIP, PDF, PNG, JPEG or WebP file no larger than 3 MB. The file contents must match its extension.",
    );
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const file = await db.$transaction(
    async (tx) => {
      await writable(tx, assignmentId, userId);
      const old = await tx.assignmentFile.findUnique({ where: { id } });
      if (old) {
        if (
          old.assignmentId !== assignmentId ||
          old.userId !== userId ||
          old.sha256 !== sha256 ||
          old.name !== name ||
          old.state === "DELETED"
        )
          throw new AccessError(
            409,
            "This upload identifier cannot be reused for a different file. Select the file again.",
          );
        // A recovered READY upload is active again, so cleanup must not retire it.
        return tx.assignmentFile.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
      }
      // Reservations count even when delivery is ambiguous, bounding storage growth.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(620244, 1)::text AS "locked"`;
      const [personal, total, daily] = await Promise.all([
        tx.assignmentFile.aggregate({
          where: { userId, assignmentId, state: { not: "DELETED" } },
          _sum: { size: true },
        }),
        tx.assignmentFile.aggregate({
          where: { state: { not: "DELETED" } },
          _sum: { size: true },
        }),
        tx.assignmentFile.count({
          where: { userId, createdAt: { gt: new Date(Date.now() - 86400000) } },
        }),
      ]);
      if (
        (personal._sum.size ?? 0) + bytes.length > 30 * 1024 * 1024 ||
        daily >= 20
      )
        throw new AccessError(
          429,
          "Your upload allowance is reached: 30 MB per assignment and 20 uploads per day. Keep project ZIPs small and reuse existing files.",
        );
      if ((total._sum.size ?? 0) + bytes.length > 2 * 1024 * 1024 * 1024)
        throw new AccessError(
          409,
          "Assignment storage is full. Contact your instructor; text and link submissions remain available.",
        );
      return tx.assignmentFile.create({
        data: {
          id,
          assignmentId,
          userId,
          name,
          extension: fileExtension(name),
          size: bytes.length,
          sha256,
          objectKey: `assignment-files/${id}`,
        },
      });
    },
    { timeout: 15000 },
  );
  if (file.state !== "READY") {
    // Retrying a PENDING reservation writes identical bytes only. Once READY, this key is never written again.
    await store.put(file.objectKey, bytes);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Assignment" WHERE "id" = ${assignmentId} FOR UPDATE`;
      const current = await tx.assignmentFile.findUniqueOrThrow({
        where: { id },
      });
      if (current.state === "DELETED")
        throw new AccessError(
          409,
          "This upload was discarded. Select the file again.",
        );
      if (current.state !== "READY")
        await tx.assignmentFile.update({
          where: { id },
          data: { state: "READY" },
        });
    });
  }
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    extension: file.extension,
  };
}
export async function downloadAssignmentFile(
  db: PrismaClient,
  actorId: string,
  id: string,
  store: AssignmentFileStore = assignmentFileStore(),
) {
  const file = await db.$transaction(async (tx) => {
    const actor = await tx.user.findUnique({
      where: { id: actorId },
      include: { roster: true },
    });
    if (
      !actor?.emailVerified ||
      (actor.role !== "INSTRUCTOR" && actor.roster?.status !== "ACTIVE")
    )
      throw new AccessError(403, "Your access is unavailable.");
    const file = await tx.assignmentFile.findFirst({
      where: { id, state: "READY" },
      include: { assignment: { select: { createdBy: true } } },
    });
    if (!file) throw new AccessError(404, "File not found.");
    if (actor.role === "STUDENT") {
      if (file.userId !== actorId)
        throw new AccessError(404, "File not found.");
    } else {
      if (
        file.assignment.createdBy !== actorId ||
        !(await tx.assignmentVersion.findFirst({
          where: {
            attachmentIds: { has: id },
            submission: {
              assignmentId: file.assignmentId,
              userId: file.userId,
            },
          },
          select: { id: true },
        }))
      )
        throw new AccessError(
          404,
          "Only formally submitted files are available for instructor review.",
        );
    }
    return file;
  });
  const bytes = await store.get(file.objectKey);
  if (
    bytes.length !== file.size ||
    createHash("sha256").update(bytes).digest("hex") !== file.sha256
  )
    throw new AccessError(
      503,
      "The file could not be verified. Please try again or contact your instructor.",
    );
  return { bytes, name: file.name, size: file.size };
}
/** Retire abandoned uploads only; saved drafts and every submitted version are preserved. */
export async function cleanupAssignmentFiles(
  db: PrismaClient,
  userId: string,
  assignmentId: string,
  store: AssignmentFileStore = assignmentFileStore(),
) {
  const cutoff = new Date(Date.now() - 86400000);
  const candidates = await db.assignmentFile.findMany({
    where: {
      userId,
      assignmentId,
      state: { not: "DELETED" },
      updatedAt: { lt: cutoff },
    },
    select: { id: true },
    take: 3,
  });
  for (const { id } of candidates)
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Assignment" WHERE "id" = ${assignmentId} FOR UPDATE`;
        const file = await tx.assignmentFile.findFirst({
          where: {
            id,
            userId,
            assignmentId,
            state: { not: "DELETED" },
            updatedAt: { lt: cutoff },
          },
        });
        if (!file) return;
        const [current, historic] = await Promise.all([
          tx.assignmentSubmission.findFirst({
            where: { assignmentId, userId, attachmentIds: { has: id } },
            select: { id: true },
          }),
          tx.assignmentVersion.findFirst({
            where: { attachmentIds: { has: id } },
            select: { id: true },
          }),
        ]);
        if (current || historic) return;
        await store.remove(file.objectKey);
        await tx.assignmentFile.update({
          where: { id },
          data: { state: "DELETED" },
        });
      },
      { timeout: 25000 },
    );
}
export async function readAssignmentUpload(request: Request) {
  if (request.headers.get("content-type") !== "application/octet-stream")
    throw new AccessError(415, "Upload the selected file as binary data.");
  if (Number(request.headers.get("content-length")) > MAX_ASSIGNMENT_FILE)
    throw new AccessError(413, "Files must be no larger than 3 MB.");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, "Select a file first.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ASSIGNMENT_FILE) {
      await reader.cancel();
      throw new AccessError(413, "Files must be no larger than 3 MB.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
