import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AssignmentReview } from "@/components/assignment-review";
import { pageActor, AccessError } from "@/lib/access";
import { getDb } from "@/lib/db";
import { instructorSubmission } from "@/lib/assignments";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; sid: string }>;
}) {
  const { id, sid } = await params;
  const actor = await pageActor(
    "INSTRUCTOR",
    `/instructor/assignments/${id}/submissions/${sid}`,
  );
  const submission = await instructorSubmission(
    getDb(),
    actor.id,
    id,
    sid,
  ).catch((e) => {
    if (e instanceof AccessError && e.status === 404) notFound();
    throw e;
  });
  return (
    <AppShell name={actor.name} role={actor.role} active="assignments">
      <AssignmentReview initial={JSON.parse(JSON.stringify(submission))} />
    </AppShell>
  );
}
