import { AppShell } from "@/components/app-shell";
import { AssignmentWorkspace } from "@/components/assignment-workspace";
import { pageActor } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await pageActor("STUDENT", "/student/assignments");
  return (
    <AppShell name={actor.name} role={actor.role} active="assignments">
      <AssignmentWorkspace instructor={false} />
    </AppShell>
  );
}
