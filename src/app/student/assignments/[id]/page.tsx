import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AssignmentStudent } from "@/components/assignment-student";
import { pageActor, AccessError } from "@/lib/access";
import { getDb } from "@/lib/db";
import { assignmentDetail } from "@/lib/assignments";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await pageActor("STUDENT", `/student/assignments/${id}`);
  const detail = await assignmentDetail(getDb(), actor.id, id, false).catch(
    (e) => {
      if (e instanceof AccessError && e.status === 404) notFound();
      throw e;
    },
  );
  return (
    <AppShell name={actor.name} role={actor.role} active="assignments">
      <AssignmentStudent initial={JSON.parse(JSON.stringify(detail))} />
    </AppShell>
  );
}
