import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, LockKeyhole, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { pageActor, AccessError } from "@/lib/access";
import { getDb } from "@/lib/db";
import { attemptResult } from "@/lib/attempts";
export const dynamic = "force-dynamic";
export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await pageActor("STUDENT", `/attempts/${id}/result`);
  let result: Awaited<ReturnType<typeof attemptResult>>;
  try { result = await attemptResult(getDb(), id, actor.id, actor.role); }
  catch (e) { if (e instanceof AccessError && e.status === 404) notFound(); throw e; }
  return <AppShell name={actor.name} role={actor.role} active="history">
    <Link className="back-link" href="/student/results"><ArrowLeft size={16}/> Results history</Link>
    <div className="page-heading"><div><span className="eyebrow">YOUR OFFICIAL RESULT</span><h1>{result.quizTitle}</h1>
      <p>Submitted {new Date(result.submittedAt!).toLocaleString("en-NG",{timeZone:"Africa/Lagos"})} WAT</p></div></div>
    <section className="panel result-hero"><CheckCircle2 size={34}/><h2>Submission recorded</h2>
      {result.reviewAvailable && <><strong className="result-score">{result.earnedMarks} / {result.maxMarks}</strong>
      <p>{result.maxMarks ? Math.round(100*result.earnedMarks!/result.maxMarks) : 0}% of available marks</p></>}</section>
    {!result.reviewAvailable ? <section className="panel notice"><LockKeyhole size={18}/> Your submission is awaiting instructor review. Your score and answer review will appear after your instructor releases the results.</section>
    : <div className="preview-questions">{result.questions?.map((q,i) => <section className="panel" key={q.id}>
      <div className="panel-heading"><h2>Question {i+1}</h2><span className="badge lavender">{q.awardedMarks}/{q.marks} marks</span></div>
      <p className="question-prompt">{q.prompt}</p>
      <ol className="preview-options result-options">{q.options.map((opt,k) =>
        <li key={opt.id} className={opt.id === q.correctOptionId ? "correct-option" : opt.id === q.selectedOptionId ? "incorrect-option" : ""}>
          <span>{String.fromCharCode(65+k)}</span><p>{opt.text}</p>
          {opt.id === q.correctOptionId && <strong>{opt.id === q.selectedOptionId ? "Your answer — correct" : "Correct answer"}</strong>}
          {opt.id === q.selectedOptionId && opt.id !== q.correctOptionId && <strong>Your answer — incorrect</strong>}
        </li>)}</ol>
      {!q.selectedOptionId && <p className="muted">You did not answer this question.</p>}
      <div className="answer-explanation"><strong>Explanation</strong><p>{q.explanation}</p></div>
    </section>)}</div>}
    <Link className="button" href="/student/quizzes">Back to quizzes</Link>
  </AppShell>;
}
