"use client";
import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AttemptProgress } from "@/lib/attempt-progress";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, AlertCircle, Save, Send, LoaderCircle } from "lucide-react";
export function AttemptPlayer({ id }: { id: string }) {
  const router = useRouter();
  const progress = useMemo(() => new AttemptProgress(id, () => router.replace(`/attempts/${id}/result`)), [id, router]);
  const { attempt, answers, dirty, saved, phase, error, blocked, submissionUncertain } = useSyncExternalStore(progress.subscribe, progress.getSnapshot, progress.getSnapshot);
  const loading = phase === "loading";
  const busy = phase === "saving" || phase === "submitting" || phase === "submitted";
  const editingDisabled = blocked || submissionUncertain || phase === "submitting" || phase === "submitted";
  useEffect(() => {
    void progress.load();
    window.addEventListener("online", progress.retry);
    return () => { progress.dispose(); window.removeEventListener("online", progress.retry); };
  }, [progress]);
  useEffect(() => {
    if (!dirty && !submissionUncertain) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, submissionUncertain]);
  function submit() {
    if (window.confirm("Submit your answers? You cannot change them after submission.")) void progress.submit();
  }
  if (loading) return <section className="panel empty"><LoaderCircle className="spin" />Loading assessment…</section>;
  if (!attempt) return <section className="panel"><p role="alert" className="notice error">{error || "Attempt not found."}</p><Link href="/student/quizzes" className="text-button">Back to quizzes</Link></section>;
  const completed = attempt.questions.filter(q => !!answers[q.id]).length;
  return <div className="attempt-workspace">
    <Link href={`/q/${attempt.quiz.shareSlug}`} className="back-link"><ArrowLeft size={16}/> Quiz details</Link>
    <div className="page-heading"><div><span className="eyebrow">OFFICIAL ASSESSMENT</span><h1>{attempt.quiz.title}</h1>
      <p>{completed} of {attempt.questions.length} questions answered</p></div>
      <span className="badge lavender">Revision {attempt.revision}</span>
    </div>
    {!attempt.canSubmit && <p role="alert" className="notice error"><AlertCircle size={17}/> The submission window has closed. Your answers are no longer editable.</p>}
    <p role="status" className={`notice${saved ? " success" : ""}`}>
      {saved ? <Check size={16}/> : phase === "saving" ? <LoaderCircle size={16} className="spin"/> : <AlertCircle size={16}/>}
      {phase === "saving" ? "Saving answers…" : saved ? "Answers saved. You can safely return to this quiz." : dirty ? "Unsaved answers. Keep this page open until saving finishes." : "Answers save automatically as you work."}
    </p>
    {error && <p role="alert" className="notice error">{error}</p>}
    {blocked && <button className="button" onClick={() => { if (!dirty || window.confirm("Reload saved answers? Any unsaved choices on this page will be discarded.")) window.location.reload(); }}>Reload saved answers</button>}
    <div className="preview-questions">{attempt.questions.map((q,idx) => (
      <section className="panel" key={q.id} aria-labelledby={`question-${q.id}`}>
        <div className="panel-heading"><h2 id={`question-${q.id}`}>Question {idx+1}</h2><span className="badge lavender">{q.marks} marks</span></div>
        <p className="question-prompt">{q.prompt}</p>
        <fieldset className="attempt-options" disabled={!attempt.canSubmit || editingDisabled} aria-label={`Answer question ${idx+1}`}>
          {q.options.map((opt,i) => (
            <label key={opt.id} className={`attempt-option ${answers[q.id] === opt.id ? "selected" : ""}`}>
              <input type="radio" name={`question-${q.id}`} checked={answers[q.id] === opt.id}
                onChange={() => progress.choose(q.id, opt.id)}/>
              <span className="answer-letter">{String.fromCharCode(65+i)}</span><span>{opt.text}</span>
            </label>
          ))}
        </fieldset>
        {answers[q.id] && attempt.canSubmit && <button className="text-button" type="button" disabled={editingDisabled}
          onClick={() => progress.choose(q.id, null)}>Clear answer</button>}
      </section>
    ))}</div>
    <section className="panel attempt-actions">
      <div><h2>Ready to finish?</h2><p>{completed} answered · {attempt.questions.length-completed} unanswered. Unanswered questions earn zero.</p></div>
      <div className="button-row">
        <button className="button" disabled={busy || editingDisabled || !dirty || !attempt.canSubmit} onClick={progress.retry}>
          <Save size={17}/> {phase === "saving" ? "Saving…" : "Save progress"}
        </button>
        <button className="button primary" disabled={blocked || phase === "submitting" || phase === "submitted" || !attempt.canSubmit} onClick={submit}>
          <Send size={17}/> {phase === "submitting" ? "Submitting…" : submissionUncertain ? "Retry submission" : "Submit final answers"}
        </button>
      </div>
    </section>
  </div>;
}
