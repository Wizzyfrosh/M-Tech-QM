"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, AlertCircle, Save, Send, LoaderCircle } from "lucide-react";
type QuizQuestion = {
  id: string; prompt: string; marks: number;
  options: { id: string; text: string; position: number }[];
};
type AttemptState = {
  id: string; revision: number; status: "IN_PROGRESS" | "SUBMITTED"; canSubmit: boolean;
  quiz: { title: string; shareSlug: string; deadline: string | null };
  questions: QuizQuestion[];
  answers: { questionId: string; selectedOptionId: string | null }[];
};
export function AttemptPlayer({ id }: { id: string }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/attempts/${id}`, { signal: controller.signal })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Unable to load quiz.");
        return data as AttemptState;
      }).then(data => {
        if (controller.signal.aborted) return;
        if (data.status === "SUBMITTED") { router.replace(`/attempts/${id}/result`); return; }
        setAttempt(data);
        setAnswers(Object.fromEntries(data.answers.map(a => [a.questionId, a.selectedOptionId])));
      }).catch(e => { if (e.name !== "AbortError") setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, router]);
  function snapshot() {
    return attempt!.questions.map(q => ({ questionId: q.id, selectedOptionId: answers[q.id] ?? null }));
  }
  async function perform(action: "save" | "submit") {
    if (!attempt || busy || !attempt.canSubmit) return;
    if (action === "submit" && !window.confirm("Submit your answers? You cannot change them after submission.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const endpoint = action === "save" ? "answers" : "submit";
      const r = await fetch(`/api/attempts/${id}/${endpoint}`, {
        method: action === "save" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: attempt.revision, answers: snapshot() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not save your answers.");
      if (action === "submit") {
        router.replace(`/attempts/${id}/result`);
        return;
      }
      setAttempt({ ...attempt, revision: data.revision });
      setDirty(false); setMessage("Answers saved. You can safely return to this quiz.");
    } catch (e) { setDirty(true); setError(e instanceof Error ? e.message : "Network error. Your changes are not saved."); }
    finally { setBusy(false); }
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
    {dirty && <p role="status" className="notice"><AlertCircle size={17}/> You have unsaved changes. Save before leaving this page.</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {message && <p role="status" className="notice success"><Check size={16}/>{message}</p>}
    <div className="preview-questions">{attempt.questions.map((q,idx) => (
      <section className="panel" key={q.id} aria-labelledby={`question-${q.id}`}>
        <div className="panel-heading"><h2 id={`question-${q.id}`}>Question {idx+1}</h2><span className="badge lavender">{q.marks} marks</span></div>
        <p className="question-prompt">{q.prompt}</p>
        <fieldset className="attempt-options" disabled={!attempt.canSubmit || busy} aria-label={`Answer question ${idx+1}`}>
          {q.options.map((opt,i) => (
            <label key={opt.id} className={`attempt-option ${answers[q.id] === opt.id ? "selected" : ""}`}>
              <input type="radio" name={`question-${q.id}`} checked={answers[q.id] === opt.id}
                onChange={() => { setAnswers(old => ({ ...old, [q.id]: opt.id })); setDirty(true); setMessage(""); }}/>
              <span className="answer-letter">{String.fromCharCode(65+i)}</span><span>{opt.text}</span>
            </label>
          ))}
        </fieldset>
        {answers[q.id] && attempt.canSubmit && <button className="text-button" type="button" disabled={busy}
          onClick={() => { setAnswers(old => ({...old,[q.id]:null}));setDirty(true);setMessage(""); }}>Clear answer</button>}
      </section>
    ))}</div>
    <section className="panel attempt-actions">
      <div><h2>Ready to finish?</h2><p>{completed} answered · {attempt.questions.length-completed} unanswered. Unanswered questions earn zero.</p></div>
      <div className="button-row">
        <button className="button" disabled={busy || !attempt.canSubmit} onClick={() => perform("save")}>
          <Save size={17}/> {busy ? "Working…" : "Save progress"}
        </button>
        <button className="button primary" disabled={busy || !attempt.canSubmit} onClick={() => perform("submit")}>
          <Send size={17}/> Submit final answers
        </button>
      </div>
    </section>
  </div>;
}
