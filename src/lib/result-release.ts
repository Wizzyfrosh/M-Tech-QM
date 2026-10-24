import { notify } from "./notifications";
import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { AccessError } from "./access";
import { effectivelyClosed } from "./quiz-policy";

export async function releaseResults(db: PrismaClient, ownerId: string, quizId: string, closeQuiz = false) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Quiz" WHERE id=${quizId} FOR UPDATE`;
    const quiz = await tx.quiz.findFirst({ where: { id: quizId, createdBy: ownerId } });
    if (!quiz) throw new AccessError(404, "Quiz not found.");
    if (quiz.reviewReleasedAt) return { released: true, alreadyReleased: true };
    const clock = await tx.$queryRaw<{now:Date}[]>`SELECT clock_timestamp() AS now`;
    if (quiz.status === "PUBLISHED" && !effectivelyClosed(quiz, clock[0].now) && closeQuiz) {
      await tx.quiz.update({where:{id:quizId},data:{status:"CLOSED",closedAt:clock[0].now}});
      quiz.status="CLOSED";
      await tx.auditEvent.create({data:{actorId:ownerId,action:"QUIZ_CLOSED",entityId:quizId}});
    }
    if (quiz.status === "DRAFT" || !effectivelyClosed(quiz, clock[0].now))
      throw new AccessError(409, "Close the quiz before reviewing and releasing its results.");
    const attempts = await tx.attempt.findMany({ where: { quizId, status: "SUBMITTED",
      user: { role: "STUDENT", emailVerified: true, roster: { status: "ACTIVE" } } },
      select: { id: true, userId:true, earnedMarks: true, maxMarks: true, user: { select: { email: true } } }, orderBy: { id: "asc" } });
    await notify(tx,attempts.map(a=>({userId:a.userId,eventKey:`results:${quizId}`,kind:"RESULTS_RELEASED",title:"Your quiz result is ready",message:`Your instructor released the results for ${quiz.title}. Open the app to see your score and answer review.`,href:`/attempts/${a.id}/result`,emailStatus:"SKIPPED"})));
    const recipients = attempts.map(a => ({ email: a.user.email, attemptId: a.id,
      title: quiz.title, earnedMarks: a.earnedMarks, maxMarks: a.maxMarks }));
    for (let offset = 0; offset < recipients.length; offset += 1000)
      await tx.resultEmailBatch.create({ data: { quizId, recipients: recipients.slice(offset, offset + 1000) } });
    await tx.quiz.update({ where: { id: quizId }, data: { reviewReleasedAt: clock[0].now, revision: { increment: 1 } } });
    await tx.auditEvent.create({ data: { actorId: ownerId, action: "RESULTS_RELEASED", entityId: quizId } });
    return { released: true, alreadyReleased: false };
  }, { timeout: 15000 });
}

type Recipient = { email: string; attemptId: string; title: string; earnedMarks: number; maxMarks: number };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]!);
export async function deliverResultEmails(db: PrismaClient, quizId: string) {
  const batches = await db.resultEmailBatch.findMany({ where: { quizId, status: "PENDING" }, take: 5, orderBy: { createdAt: "asc" } });
  for (const batch of batches) {
    const claimed = await db.resultEmailBatch.updateMany({ where: { id: batch.id, status: "PENDING" }, data: { status: "SENDING" } });
    if (!claimed.count) continue;
    let status = "UNKNOWN";
    try {
      const original = batch.recipients as unknown as Recipient[];
      const eligible = await db.attempt.findMany({ where: { id: { in: original.map(r => r.attemptId) }, status: "SUBMITTED",
        user: { role: "STUDENT", emailVerified: true, roster: { status: "ACTIVE" } } }, select: { id: true } });
      const allowed = new Set(eligible.map(a => a.id));
      const recipients = original.filter(r => allowed.has(r.attemptId));
      if (!recipients.length) { await db.resultEmailBatch.update({ where: { id: batch.id }, data: { status: "SENT" } }); continue; }
      if (process.env.NODE_ENV !== "production" && process.env.MAIL_TRANSPORT === "file") {
        const { mkdir, writeFile } = await import("node:fs/promises");
        await mkdir(".local-mail", { recursive: true, mode: 0o700 });
        await writeFile(`.local-mail/result-${batch.id}.json`, JSON.stringify({ type: "result-release", recipients }), { mode: 0o600 });
        status = "SENT";
      } else if (!process.env.BREVO_API_KEY || !process.env.MAIL_FROM_EMAIL || !process.env.BETTER_AUTH_URL) {
        status = "FAILED";
      } else {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST",
          headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ sender: { email: process.env.MAIL_FROM_EMAIL, name: "M Tech QMS" },
            subject: "Your quiz result is available · M Tech QMS", htmlContent: "Your result is available.",
            headers: { idempotencyKey: batch.id }, tags: ["qms-result-release"],
            messageVersions: recipients.map(r => {
              const url = new URL(`/attempts/${r.attemptId}/result`, process.env.BETTER_AUTH_URL).href;
              const percentage = r.maxMarks ? (100 * r.earnedMarks / r.maxMarks).toFixed(1) : "0.0";
              return { to: [{ email: r.email }], htmlContent: `<div style="font-family:Arial;max-width:520px;padding:32px"><h1>Your result is ready</h1><h2>${escapeHtml(r.title)}</h2><p>Your instructor has reviewed and released your result.</p><p>Score: <strong>${r.earnedMarks}/${r.maxMarks} (${percentage}%)</strong></p><p><a href="${escapeHtml(url)}">Sign in to view your full result and answer review</a></p><p>M Tech QMS</p></div>` };
            }) }), signal: AbortSignal.timeout(10000) });
        status = response.ok ? "SENT" : response.status >= 500 ? "UNKNOWN" : "FAILED";
      }
    } catch { console.error("QMS_RESULT_EMAIL_UNCONFIRMED"); }
    await db.resultEmailBatch.update({ where: { id: batch.id }, data: { status } });
  }
}
