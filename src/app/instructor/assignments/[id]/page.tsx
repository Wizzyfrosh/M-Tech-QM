import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AssignmentEditor } from "@/components/assignment-editor";
import { pageActor, AccessError } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assignmentDetail, assignmentSubmissions } from "@/lib/assignments";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await pageActor("INSTRUCTOR", `/instructor/assignments/${id}`);
  const [detail, submissions] = await Promise.all([
    assignmentDetail(getDb(), actor.id, id, true),
    assignmentSubmissions(getDb(), actor.id, id, 1),
  ]).catch((e) => {
    if (e instanceof AccessError && e.status === 404) notFound();
    throw e;
  });
  return (
    <AppShell name={actor.name} role={actor.role} active="assignments">
      <AssignmentEditor
        initial={JSON.parse(JSON.stringify(detail))}
        submissions={JSON.parse(JSON.stringify(submissions))}
      />
    </AppShell>
  );
}
