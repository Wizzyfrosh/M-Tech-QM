import { pageIdentity } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { NotificationInbox } from "@/components/notification-inbox";
export const dynamic = "force-dynamic";
export default async function Notifications() {
  const actor = await pageIdentity("/notifications");
  return (
    <AppShell name={actor.name} role={actor.role}>
      <div className="page-heading">
        <div>
          <h1>Notifications</h1>
          <p>Updates and actions that need your attention.</p>
        </div>
      </div>
      <NotificationInbox instructor={actor.role === "INSTRUCTOR"} />
    </AppShell>
  );
}
