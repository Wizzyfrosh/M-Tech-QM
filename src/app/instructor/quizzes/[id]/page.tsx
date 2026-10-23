import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { QuizEditor } from "@/components/quiz-editor";
import { pageActor, AccessError } from "@/lib/access";
import { getDb } from "@/lib/db";
import { getQuizEditor } from "@/lib/quizzes";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await pageActor("INSTRUCTOR");
  let quiz;
  try {
    quiz = await getQuizEditor(getDb(), (await params).id, actor.id);
  } catch (e) {
    if (e instanceof AccessError && e.status === 404) notFound();
    throw e;
  }
  return (
    <AppShell name={actor.name} role={actor.role} active="quizzes">
      <QuizEditor key={quiz.id} initial={quiz} />
    </AppShell>
  );
}
