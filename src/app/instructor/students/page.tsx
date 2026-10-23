import { AppShell } from "@/components/app-shell";
import { StudentApprovals } from "@/components/student-approvals";
import { pageActor } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function Students() {
  const actor = await pageActor("INSTRUCTOR");
  return (
    <AppShell name={actor.name} role={actor.role} active="students">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR COMMUNITY</span>
          <h1>Students</h1>
          <p>Review registrations, approve students, and manage their access.</p>
        </div>
      </div>
      <StudentApprovals />
    </AppShell>
  );
}
