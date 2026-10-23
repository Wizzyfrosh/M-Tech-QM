import { AppShell } from "@/components/app-shell";
import { QuizWorkspace } from "@/components/quiz-workspace";
import { pageActor } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await pageActor("INSTRUCTOR");
  return (
    <AppShell name={actor.name} role={actor.role} active="quizzes">
      <QuizWorkspace instructor />
    </AppShell>
  );
}
