import { after } from "next/server";
import { requireInstructor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assertOrigin, failure, json, readJson } from "@/lib/http";
import { z } from "zod";
import { releaseResults, deliverResultEmails } from "@/lib/result-release";
export const maxDuration = 60;
export async function POST(request: Request, { params }: { params: Promise<{id:string}> }) {
  try {
    assertOrigin(request);
    const actor = await requireInstructor(request.headers);
    const input = await readJson(request, z.object({ acknowledged: z.literal(true),closeQuiz:z.boolean().default(false) }).strict());
    const { id } = await params;
    const result = await releaseResults(getDb(), actor.id, id, input.closeQuiz);
    if (result.alreadyReleased) await getDb().resultEmailBatch.updateMany({ where: { quizId: id, status: "FAILED" }, data: { status: "PENDING" } });
    after(async () => { try { await deliverResultEmails(getDb(), id); } catch { console.error("QMS_RESULT_EMAIL_QUEUE_FAILED"); } });
    return json(result);
  } catch (error) { return failure(error); }
}
