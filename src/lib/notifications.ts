import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient;
type Notice = {
  userId: string;
  eventKey: string;
  kind: string;
  title: string;
  message: string;
  href: string;
  emailStatus?: string;
};
export async function notify(db: Db, notices: Notice[]) {
  if (notices.length)
    await db.notification.createMany({ data: notices, skipDuplicates: true });
}
export async function notifyRegistration(
  db: Db,
  user: { id: string; name: string; email: string },
) {
  const instructors = await db.user.findMany({
    where: { role: "INSTRUCTOR", emailVerified: true },
    select: { id: true },
  });
  await notify(
    db,
    instructors.map((owner) => ({
      userId: owner.id,
      eventKey: `registration:${user.id}`,
      kind: "REGISTRATION",
      title: "New student registration",
      message: `${user.name} (${user.email}) created an account. Approval is available after email verification.`,
      href: "/instructor/students",
    })),
  );
}
export async function notifyAccess(
  db: Db,
  row: { id: string; userId: string | null; status: string; revision: number },
) {
  if (!row.userId) return;
  const active = row.status === "ACTIVE";
  await notify(db, [
    {
      userId: row.userId,
      eventKey: `access:${row.id}:${row.revision}`,
      kind: "ACCESS",
      title: active
        ? "Your student access is approved"
        : "Your student access has changed",
      message: active
        ? "Your instructor has approved your access. Open the app to view available quizzes."
        : "Your instructor has removed your access. Contact your instructor if you have questions.",
      href: "/dashboard",
    },
  ]);
}
export async function notifyPublished(
  db: Db,
  quiz: { id: string; shareSlug: string; title: string },
) {
  const users = await db.user.findMany({
    where: {
      role: "STUDENT",
      emailVerified: true,
      roster: { status: "ACTIVE" },
    },
    select: { id: true },
  });
  await notify(
    db,
    users.map((u) => ({
      userId: u.id,
      eventKey: `published:${quiz.id}`,
      kind: "QUIZ_PUBLISHED",
      title: "A new quiz is available",
      message: `Your instructor published ${quiz.title}. Open the quiz to check its details and deadline.`,
      href: `/q/${quiz.shareSlug}`,
    })),
  );
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
// Durable outbox: claim each message once; ambiguous deliveries never auto-retry.
export async function deliverNotifications(db: PrismaClient) {
  const pending = await db.notification.findMany({
    where: { emailStatus: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true },
  });
  for (let offset = 0; offset < pending.length; offset += 20)
    await Promise.all(
      pending.slice(offset, offset + 20).map(async (entry) => {
        const claimed = await db.notification.updateMany({
          where: { id: entry.id, emailStatus: "PENDING" },
          data: { emailStatus: "SENDING" },
        });
        if (!claimed.count) return;
        let status = "UNKNOWN";
        try {
          const notice = await db.notification.findUniqueOrThrow({
            where: { id: entry.id },
            include: { user: { include: { roster: true } } },
          });
          const eligible =
            notice.user.emailVerified &&
            (notice.user.role === "INSTRUCTOR" ||
              notice.kind === "ACCESS" ||
              notice.user.roster?.status === "ACTIVE");
          if (!eligible) status = "SKIPPED";
          else if (
            process.env.NODE_ENV !== "production" &&
            process.env.MAIL_TRANSPORT === "file"
          ) {
            const { mkdir, writeFile } = await import("node:fs/promises");
            await mkdir(".local-mail", { recursive: true, mode: 0o700 });
            await writeFile(
              `.local-mail/notice-${notice.id}.json`,
              JSON.stringify({
                type: "activity-notification",
                email: notice.user.email,
                title: notice.title,
                message: notice.message,
                href: notice.href,
              }),
              { mode: 0o600 },
            );
            status = "SENT";
          } else if (
            !process.env.BREVO_API_KEY ||
            !process.env.MAIL_FROM_EMAIL ||
            !process.env.BETTER_AUTH_URL
          )
            status = "FAILED";
          else {
            const url = new URL(notice.href, process.env.BETTER_AUTH_URL).href;
            const response = await fetch(
              "https://api.brevo.com/v3/smtp/email",
              {
                method: "POST",
                headers: {
                  "api-key": process.env.BREVO_API_KEY,
                  "content-type": "application/json",
                },
                signal: AbortSignal.timeout(10000),
                body: JSON.stringify({
                  sender: {
                    email: process.env.MAIL_FROM_EMAIL,
                    name: "M Tech QMS",
                  },
                  to: [{ email: notice.user.email }],
                  subject: `${notice.title} · M Tech QMS`,
                  headers: { idempotencyKey: notice.id },
                  tags: ["qms-activity"],
                  textContent: `${notice.title}\n\n${notice.message}\n\nOpen the app: ${url}`,
                  htmlContent: `<div style="font-family:Arial;max-width:520px;padding:32px"><h1>${escape(notice.title)}</h1><p>${escape(notice.message)}</p><p><a href="${escape(url)}">Open M Tech QMS</a></p></div>`,
                }),
              },
            );
            status = response.ok
              ? "SENT"
              : response.status >= 500
                ? "UNKNOWN"
                : "FAILED";
          }
        } catch {
          console.error("QMS_ACTIVITY_EMAIL_UNCONFIRMED");
        }
        await db.notification.update({
          where: { id: entry.id },
          data: { emailStatus: status },
        });
      }),
    );
}
