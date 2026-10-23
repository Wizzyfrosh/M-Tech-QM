import { AppShell } from "@/components/app-shell";
import { AttemptPlayer } from "@/components/attempt-player";
import { pageActor } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await pageActor("STUDENT", `/attempts/${id}`);
  return <AppShell name={actor.name} role={actor.role} active="quizzes"><AttemptPlayer id={id}/></AppShell>;
}
