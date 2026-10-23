import { AppShell } from "@/components/app-shell";
import { Roster } from "@/components/roster";
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
          <p>A place for everyone who’s ready to learn.</p>
        </div>
      </div>
      <Roster />
    </AppShell>
  );
}
