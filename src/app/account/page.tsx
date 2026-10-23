import { AppShell } from "@/components/app-shell";
import { AccountForm } from "@/components/account-form";
import { pageIdentity } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function Account() {
  const actor = await pageIdentity("/account");
  return (
    <AppShell name={actor.name} role={actor.role} active="account">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE IT YOURS</span>
          <h1>My account</h1>
          <p>Your profile, privacy and security preferences.</p>
        </div>
      </div>
      <AccountForm
        name={actor.name}
        email={actor.email}
        optOut={actor.leaderboardOptOut}
      />
    </AppShell>
  );
}
