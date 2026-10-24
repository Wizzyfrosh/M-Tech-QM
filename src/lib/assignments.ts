import "server-only";
import type {
  Prisma,
  PrismaClient,
  AssignmentSubmission,
} from "@/generated/prisma/client";
import { AccessError } from "./access";
import { notify } from "./notifications";
import {
  assignmentDraftSchema,
  pinnedGitHubLink,
  type AssignmentDraft,
  type SubmissionInput,
  type ReviewInput,
} from "./assignment-policy";
type Tx = Prisma.TransactionClient;
async function instructor(tx: Tx, id: string) {
  const user = await tx.user.findUnique({
    where: { id },
    select: { role: true, emailVerified: true },
  });
  if (user?.role !== "INSTRUCTOR" || !user.emailVerified)
    throw new AccessError(403, "Instructor access required.");
}
async function student(tx: Tx, id: string) {
  // Serialize access revocation with assignment writes.
  await tx.$queryRaw`SELECT "id" FROM "RosterEntry" WHERE "userId" = ${id} FOR SHARE`;
  const user = await tx.user.findUnique({
    where: { id },
    include: { roster: true },
  });
  if (
    user?.role !== "STUDENT" ||
    !user.emailVerified ||
    user.roster?.status !== "ACTIVE"
  )
    throw new AccessError(403, "Approved student access required.");
  return user;
}
async function lockAssignment(tx: Tx, id: string, owner?: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "Assignment" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows.length) throw new AccessError(404, "Assignment not found.");
  const row = await tx.assignment.findUniqueOrThrow({ where: { id } });
  if (owner && row.createdBy !== owner)
    throw new AccessError(404, "Assignment not found.");
  return row;
}
async function now(tx: Tx) {
  return (
    await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`
  )[0].now;
}
function revision(actual: number, expected: number) {
  if (actual !== expected)
    throw new AccessError(
      409,
      "This record changed. Reload before trying again. Your unsaved text remains on this page.",
    );
}
const active = {
  role: "STUDENT" as const,
  emailVerified: true,
  roster: { status: "ACTIVE" as const },
};
function ownSubmission(s: AssignmentSubmission | null) {
  if (!s) return null;
  // Draft marks, feedback and grading state are never sent to a student.
  const { grade, feedback, ...safe } = s;
  return {
    ...safe,
    status: s.status === "GRADED" && !s.releasedAt ? "SUBMITTED" : s.status,
    grade: s.releasedAt ? grade : null,
    feedback: s.releasedAt ? feedback : "",
  };
}
export async function createAssignment(db: PrismaClient, owner: string) {
  return db.$transaction(async (tx) => {
    await instructor(tx, owner);
    return tx.assignment.create({ data: { createdBy: owner } });
  });
}
export async function assignmentList(
  db: PrismaClient,
  actor: string,
  isInstructor: boolean,
  page: number,
) {
  return db.$transaction(async (tx) => {
    if (isInstructor) await instructor(tx, actor);
    else await student(tx, actor);
    const where: Prisma.AssignmentWhereInput = isInstructor
      ? { createdBy: actor }
      : {
          OR: [
            { status: { in: ["PUBLISHED", "CLOSED"] } },
            {
              status: "ARCHIVED",
              submissions: { some: { userId: actor, version: { gt: 0 } } },
            },
          ],
        };
    const [items, total] = await Promise.all([
      tx.assignment.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 20,
        take: 20,
        select: {
          id: true,
          title: true,
          submissionType: true,
          maxMarks: true,
          deadline: true,
          status: true,
          submissions: {
            where: { userId: actor },
            select: { status: true, releasedAt: true, grade: true },
          },
        },
      }),
      tx.assignment.count({ where }),
    ]);
    return {
      items: items.map(({ submissions, ...a }) => ({
        ...a,
        submissionStatus: submissions[0]
          ? submissions[0].releasedAt
            ? "Grade released"
            : submissions[0].status === "GRADED"
              ? "Submitted"
              : submissions[0].status
          : "Not submitted",
      })),
      total,
      page,
    };
  });
}
export async function assignmentDetail(
  db: PrismaClient,
  actor: string,
  id: string,
  isInstructor: boolean,
) {
  return db.$transaction(async (tx) => {
    if (isInstructor) await instructor(tx, actor);
    else await student(tx, actor);
    const a = await tx.assignment.findFirst({
      where: {
        id,
        ...(isInstructor ? { createdBy: actor } : { status: { not: "DRAFT" } }),
      },
    });
    if (!a) throw new AccessError(404, "Assignment not found.");
    const sub = !isInstructor
      ? await tx.assignmentSubmission.findUnique({
          where: { assignmentId_userId: { assignmentId: id, userId: actor } },
        })
      : null;
    if (!isInstructor && a.status === "ARCHIVED" && !sub?.version)
      throw new AccessError(404, "Assignment not found.");
    const versions = sub
      ? await tx.assignmentVersion.findMany({
          where: { submissionId: sub.id },
          orderBy: { version: "desc" },
          take: 20,
        })
      : [];
    const time = await now(tx);
    const eligible =
      a.status === "PUBLISHED" &&
      (!a.deadline || a.allowLate || a.deadline > time);
    return {
      assignment: a,
      submission: ownSubmission(sub),
      versions,
      canWrite:
        (eligible && (!sub || sub.status === "DRAFT")) ||
        (sub?.status === "CHANGES_REQUESTED" &&
          ["PUBLISHED", "CLOSED"].includes(a.status)),
      canEdit: eligible && sub?.status === "SUBMITTED",
    };
  });
}
export async function saveAssignment(
  db: PrismaClient,
  owner: string,
  id: string,
  expected: number,
  input: AssignmentDraft,
) {
  const draft = assignmentDraftSchema.parse(input);
  return db.$transaction(async (tx) => {
    await instructor(tx, owner);
    const a = await lockAssignment(tx, id, owner);
    revision(a.revision, expected);
    if (a.status !== "DRAFT")
      throw new AccessError(
        409,
        "Published instructions and marking requirements are locked.",
      );
    return tx.assignment.update({
      where: { id },
      data: {
        ...draft,
        deadline: draft.deadline ? new Date(draft.deadline) : null,
        revision: { increment: 1 },
      },
    });
  });
}
export async function assignmentAction(
  db: PrismaClient,
  owner: string,
  id: string,
  expected: number,
  action: "publish" | "close" | "archive" | "release",
) {
  return db.$transaction(
    async (tx) => {
      await instructor(tx, owner);
      const a = await lockAssignment(tx, id, owner);
      revision(a.revision, expected);
      const time = await now(tx);
      if (action === "release") {
        if (a.status === "DRAFT")
          throw new AccessError(409, "Publish the assignment first.");
        // Assignment lock serializes release, marking, resubmission and closure.
        const graded = await tx.assignmentSubmission.findMany({
          where: {
            assignmentId: id,
            status: "GRADED",
            releasedAt: null,
            user: active,
          },
        });
        if (graded.length)
          await tx.assignmentSubmission.updateMany({
            where: { id: { in: graded.map((s) => s.id) } },
            data: { releasedAt: time, revision: { increment: 1 } },
          });
        await notify(
          tx,
          graded.map((s) => ({
            userId: s.userId,
            eventKey: `assignment-grade:${s.id}`,
            kind: "ASSIGNMENT_GRADE",
            title: "Your assignment grade is available",
            message: `${a.title}: ${s.grade}/${a.maxMarks} marks. Open the app to read your feedback.`,
            href: `/student/assignments/${id}`,
          })),
        );
        if (graded.length) {
          await tx.assignment.update({
            where: { id },
            data: { revision: { increment: 1 } },
          });
          await tx.auditEvent.create({
            data: {
              actorId: owner,
              action: "ASSIGNMENT_GRADES_RELEASED",
              entityId: id,
            },
          });
        }
        return { released: graded.length };
      }
      let status: string;
      if (action === "publish") {
        if (a.status !== "DRAFT" || a.instructions.trim().length < 10)
          throw new AccessError(
            409,
            "Add clear instructions before publishing a draft.",
          );
        if (a.deadline && a.deadline <= time)
          throw new AccessError(
            409,
            "Choose a future deadline before publishing.",
          );
        status = "PUBLISHED";
      } else if (action === "close") {
        if (a.status !== "PUBLISHED")
          throw new AccessError(
            409,
            "Only a published assignment can be closed.",
          );
        status = "CLOSED";
      } else {
        if (!["PUBLISHED", "CLOSED"].includes(a.status))
          throw new AccessError(
            409,
            "Only a published or closed assignment can be archived.",
          );
        status = "ARCHIVED";
      }
      const updated = await tx.assignment.update({
        where: { id },
        data: {
          status,
          revision: { increment: 1 },
          ...(action === "publish" ? { publishedAt: time } : {}),
        },
      });
      if (action === "publish") {
        const users = await tx.user.findMany({
          where: active,
          select: { id: true },
        });
        await notify(
          tx,
          users.map((u) => ({
            userId: u.id,
            eventKey: `assignment-published:${id}`,
            kind: "ASSIGNMENT_PUBLISHED",
            title: "A new assignment is available",
            message: `Your instructor published ${a.title}. Open the assignment to check the requirements and deadline.`,
            href: `/student/assignments/${id}`,
          })),
        );
      }
      await tx.auditEvent.create({
        data: { actorId: owner, action: `ASSIGNMENT_${status}`, entityId: id },
      });
      return updated;
    },
    { timeout: 15000 },
  );
}
export async function writeSubmission(
  db: PrismaClient,
  userId: string,
  id: string,
  input: SubmissionInput,
) {
  return db.$transaction(
    async (tx) => {
      await student(tx, userId);
      const a = await lockAssignment(tx, id);
      if (a.status === "DRAFT")
        throw new AccessError(404, "Assignment not found.");
      const old = await tx.assignmentSubmission.findUnique({
        where: { assignmentId_userId: { assignmentId: id, userId } },
      });
      // An exact retry after a lost acknowledgement returns the committed version.
      if (
        input.action === "submit" &&
        old?.status === "SUBMITTED" &&
        old.revision === input.revision + 1 &&
        old.responseText === input.responseText &&
        old.projectUrl === input.projectUrl &&
        JSON.stringify(old.evidenceUrls) === JSON.stringify(input.evidenceUrls)
      )
        return { id: old.id, revision: old.revision, status: old.status };
      revision(old?.revision ?? 0, input.revision);
      const time = await now(tx);
      const requested = old?.status === "CHANGES_REQUESTED";
      if (
        a.status === "ARCHIVED" ||
        (a.status !== "PUBLISHED" && !requested) ||
        (a.deadline && time >= a.deadline && !a.allowLate && !requested)
      )
        throw new AccessError(
          409,
          "This assignment is not accepting submissions. Ask your instructor if you need a revision window.",
        );
      if (input.action === "edit") {
        if (old?.status !== "SUBMITTED")
          throw new AccessError(
            409,
            "Only an ungraded submission can be edited.",
          );
        const updated = await tx.assignmentSubmission.update({
          where: { id: old.id },
          data: {
            status: "DRAFT",
            submittedAt: null,
            revision: { increment: 1 },
          },
        });
        return {
          id: updated.id,
          revision: updated.revision,
          status: updated.status,
        };
      }
      if (old && !["DRAFT", "CHANGES_REQUESTED"].includes(old.status))
        throw new AccessError(
          409,
          "This work is locked for review. Your instructor can request changes.",
        );
      if (input.action === "submit") {
        if (!input.responseText.trim())
          throw new AccessError(
            400,
            "Add your response or a short explanation of your work.",
          );
        if (
          a.submissionType === "PROJECT" &&
          !pinnedGitHubLink(input.projectUrl)
        )
          throw new AccessError(
            400,
            "Submit a GitHub commit link with its full 40-character commit ID so your work has a fixed version.",
          );
      }
      const data = {
        responseText: input.responseText,
        projectUrl: input.projectUrl,
        evidenceUrls: input.evidenceUrls,
      };
      const submission =
        old ??
        (await tx.assignmentSubmission.create({
          data: { assignmentId: id, userId },
        }));
      const submitted = input.action === "submit";
      const updated = await tx.assignmentSubmission.update({
        where: { id: submission.id },
        data: {
          ...data,
          revision: { increment: 1 },
          ...(submitted
            ? {
                status: "SUBMITTED",
                version: { increment: 1 },
                submittedAt: time,
                late: !!a.deadline && time >= a.deadline,
                changeRequest: "",
                grade: null,
                feedback: "",
                releasedAt: null,
              }
            : {}),
        },
      });
      if (submitted) {
        await tx.assignmentVersion.create({
          data: {
            ...data,
            submissionId: updated.id,
            version: updated.version,
            submittedAt: time,
            late: updated.late,
          },
        });
        await notify(tx, [
          {
            userId: a.createdBy,
            eventKey: `assignment-submitted:${updated.id}:${updated.version}`,
            kind: "ASSIGNMENT_SUBMITTED",
            title: "An assignment is ready to review",
            message: `A student submitted ${a.title}${updated.late ? " after the deadline" : ""}. Open the assignment to review their work.`,
            href: `/instructor/assignments/${id}/submissions/${updated.id}`,
          },
        ]);
      }
      return {
        id: updated.id,
        revision: updated.revision,
        status: updated.status,
      };
    },
    { timeout: 15000 },
  );
}
export async function assignmentSubmissions(
  db: PrismaClient,
  owner: string,
  id: string,
  page: number,
) {
  return db.$transaction(async (tx) => {
    await instructor(tx, owner);
    const a = await tx.assignment.findFirst({
      where: { id, createdBy: owner },
    });
    if (!a) throw new AccessError(404, "Assignment not found.");
    const where = { assignmentId: id };
    const [items, total, approved, submitted, graded, released] =
      await Promise.all([
        tx.assignmentSubmission.findMany({
          where,
          select: {
            id: true,
            status: true,
            grade: true,
            submittedAt: true,
            late: true,
            releasedAt: true,
            user: { select: { name: true, email: true } },
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        tx.assignmentSubmission.count({ where }),
        tx.user.count({ where: active }),
        tx.assignmentSubmission.count({
          where: {
            ...where,
            status: { in: ["SUBMITTED", "GRADED"] },
            user: active,
          },
        }),
        tx.assignmentSubmission.count({
          where: { ...where, status: "GRADED", releasedAt: null, user: active },
        }),
        tx.assignmentSubmission.count({
          where: { ...where, releasedAt: { not: null } },
        }),
      ]);
    return {
      items,
      total,
      page,
      notSubmitted: Math.max(0, approved - submitted),
      graded,
      released,
    };
  });
}
export async function instructorSubmission(
  db: PrismaClient,
  owner: string,
  id: string,
  sid: string,
) {
  return db.$transaction(async (tx) => {
    await instructor(tx, owner);
    const s = await tx.assignmentSubmission.findFirst({
      where: { id: sid, assignmentId: id, assignment: { createdBy: owner } },
      include: {
        assignment: true,
        user: { select: { name: true, email: true } },
        versions: { orderBy: { version: "desc" }, take: 20 },
      },
    });
    if (!s) throw new AccessError(404, "Submission not found.");
    // Student drafts are private; review the last formally submitted snapshot only.
    return {
      ...s,
      responseText: s.versions[0]?.responseText ?? "",
      projectUrl: s.versions[0]?.projectUrl ?? "",
      evidenceUrls: s.versions[0]?.evidenceUrls ?? [],
    };
  });
}
export async function reviewSubmission(
  db: PrismaClient,
  owner: string,
  id: string,
  sid: string,
  input: ReviewInput,
) {
  return db.$transaction(
    async (tx) => {
      await instructor(tx, owner);
      const a = await lockAssignment(tx, id, owner);
      const s = await tx.assignmentSubmission.findFirst({
        where: { id: sid, assignmentId: id },
      });
      if (!s) throw new AccessError(404, "Submission not found.");
      revision(s.revision, input.revision);
      if (s.releasedAt || !["SUBMITTED", "GRADED"].includes(s.status))
        throw new AccessError(
          409,
          "Only an unreleased submitted assignment can be reviewed.",
        );
      if (input.action === "grade" && input.grade > a.maxMarks)
        throw new AccessError(
          400,
          "The grade cannot exceed the assignment's maximum marks.",
        );
      if (input.action === "request_changes" && a.status === "ARCHIVED")
        throw new AccessError(
          409,
          "Archived assignments cannot accept revisions.",
        );
      const updated = await tx.assignmentSubmission.update({
        where: { id: sid },
        data: {
          revision: { increment: 1 },
          ...(input.action === "grade"
            ? {
                status: "GRADED",
                grade: input.grade,
                feedback: input.feedback,
                changeRequest: "",
              }
            : {
                status: "CHANGES_REQUESTED",
                grade: null,
                feedback: "",
                changeRequest: input.feedback,
              }),
        },
      });
      if (input.action === "request_changes")
        await notify(tx, [
          {
            userId: s.userId,
            eventKey: `assignment-changes:${sid}:${updated.revision}`,
            kind: "ASSIGNMENT_CHANGES",
            title: "Changes requested on your assignment",
            message: `Your instructor requested changes to ${a.title}. Open the app to read their instructions and resubmit.`,
            href: `/student/assignments/${id}`,
          },
        ]);
      await tx.auditEvent.create({
        data: {
          actorId: owner,
          action:
            input.action === "grade"
              ? "ASSIGNMENT_GRADED"
              : "ASSIGNMENT_CHANGES_REQUESTED",
          entityId: sid,
        },
      });
      return {
        id: updated.id,
        revision: updated.revision,
        status: updated.status,
      };
    },
    { timeout: 15000 },
  );
}
