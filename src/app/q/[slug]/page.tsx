import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Clock3, LockKeyhole } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StartQuiz } from "@/components/start-quiz";
import { pageActor, AccessError } from "@/lib/access";
import { getDb } from "@/lib/db";
import { studentQuizDetails } from "@/lib/quizzes";
import { formatDeadline, effectivelyClosed } from "@/lib/quiz-policy";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const actor = await pageActor(undefined, `/q/${slug}`);
  let quiz;
  try {
    quiz = await studentQuizDetails(getDb(), slug);
  } catch (e) {
    if (e instanceof AccessError && e.status === 404) notFound();
    throw e;
  }
  const closed = effectivelyClosed(quiz);
  return (
    <AppShell name={actor.name} role={actor.role} active="quizzes">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR LESSON ASSESSMENT</span>
          <h1>{quiz.title}</h1>
          <p>{quiz.lessonLabel}</p>
        </div>
        <span className="badge lavender">
          {closed ? "Closed" : "Published"}
        </span>
      </div>
      <section className="panel quiz-landing">
        <span className="empty-icon">
          <BookOpen size={28} />
        </span>
        <h2>Before you begin</h2>
        <p className="pre-wrap">
          {quiz.description ||
            "Read the lesson and prepare to put your knowledge into practice."}
        </p>
        <dl className="quiz-facts">
          <div>
            <dt>Questions</dt>
            <dd>{quiz.questionCount}</dd>
          </div>
          <div>
            <dt>Maximum marks</dt>
            <dd>{quiz.maxMarks}</dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>
              <Clock3 size={15} />
              {formatDeadline(quiz.deadline)}
            </dd>
          </div>
          <div>
            <dt>Correct-answer review</dt>
            <dd>
              {quiz.reviewMode === "AFTER_CLOSE"
                ? "After the quiz closes"
                : quiz.reviewMode === "AFTER_SUBMISSION"
                  ? "After submission"
                  : "When your instructor releases it"}
            </dd>
          </div>
          <div>
            <dt>Leaderboard</dt>
            <dd>
              {quiz.leaderboardEnabled
                ? "After the quiz closes"
                : "Disabled for this quiz"}
            </dd>
          </div>
        </dl>
        {((quiz.lessonUrls?.length ? quiz.lessonUrls : quiz.lessonUrl ? [quiz.lessonUrl] : [])).length > 0 && (
          <div className="form-stack">
            <h3>Lesson videos</h3>
            {(quiz.lessonUrls?.length ? quiz.lessonUrls : [quiz.lessonUrl!]).map((url, i) =>
              <a key={i} className="button" href={url} target="_blank" rel="noopener noreferrer">
                <BookOpen size={17}/> Watch part {i + 1}
              </a>
            )}
          </div>
        )}
        <p className="notice quiz-lock">
          <LockKeyhole size={17} />
          {closed
            ? "This quiz is closed. Existing submissions remain available in your history."
            : "Your answers are saved securely. You may resume this quiz before the deadline."}
        </p>
        {actor.role === "STUDENT" && <StartQuiz slug={slug} />}
        {closed && quiz.leaderboardEnabled && <Link href={`/leaderboard/${slug}`} className="button">View leaderboard</Link>}
        <Link href="/student/quizzes" className="text-button">
          Back to quizzes
        </Link>
      </section>
    </AppShell>
  );
}
