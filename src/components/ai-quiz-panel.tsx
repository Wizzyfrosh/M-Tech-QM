"use client";
import { useState } from "react";
import { AlertCircle, Check, FileText, LoaderCircle, Sparkles, ShieldCheck } from "lucide-react";
import type { QuestionDraft } from "@/lib/quiz-policy";
import type { GeneratedQuestion } from "@/lib/ai-quiz-policy";

export function AiQuizPanel({
  quizId, availableSlots, disabled, onAdd,
}: {
  quizId: string;
  availableSlots: number;
  disabled: boolean;
  onAdd: (questions: QuestionDraft[]) => void;
}) {
  const [transcript, setTranscript] = useState("");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [generated, setGenerated] = useState<GeneratedQuestion[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const countLimit = Math.min(20, availableSlots);
  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || loading || !availableSlots) return;
    setLoading(true); setError(""); setMessage("");
    setGenerated([]); setSelected([]);
    try {
      const response = await fetch(`/api/instructor/quizzes/${quizId}/ai-drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, count, difficulty }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not generate questions.");
      const questions = body.questions as GeneratedQuestion[];
      setGenerated(questions);
      setSelected(questions.map((_, index) => index));
      setTranscript("");
      setMessage(`${questions.length} suggestions generated. Check the facts and answer keys before using them.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation unavailable.");
    } finally { setLoading(false); }
  }
  function append() {
    const chosen = generated.filter((_, i) => selected.includes(i));
    if (!chosen.length || chosen.length > availableSlots || disabled) return;
    onAdd(chosen.map(q => ({
      prompt: q.prompt,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      marks: 1,
      reviewed: false,
    })));
    setGenerated([]);
    setSelected([]);
    setMessage(`${chosen.length} questions added as unreviewed drafts. Inspect each one, confirm its answer, and save the quiz before publishing.`);
  }
  return <section className="panel ai-quiz-panel" aria-label="AI-assisted question drafts">
    <div className="panel-heading">
      <div><span className="eyebrow"><Sparkles size={14}/> OPTIONAL AI ASSISTANCE</span>
        <h2>Generate from lesson notes</h2>
        <p>Review everything yourself. AI never publishes a quiz or marks questions as reviewed.</p></div>
    </div>
    <p className="notice"><ShieldCheck size={17}/> Your pasted text goes to Google Gemini for processing. Avoid student personal data, private credentials or confidential material. Transcript text is not saved in your quiz database.</p>
    <form className="form-stack" onSubmit={generate}>
      <label>Lesson notes or transcript
        <textarea value={transcript} onChange={event => setTranscript(event.target.value)}
          minLength={160} maxLength={40000} rows={7}
          placeholder="Paste at least 160 characters of lesson material with enough factual detail for questions."
          required disabled={disabled || loading}/>
        <small>{transcript.length.toLocaleString("en-NG")} / 40,000 characters</small>
      </label>
      <div className="question-details-grid">
        <label>Questions
          <input type="number" min={1} max={countLimit || 1}
            value={Math.min(count, Math.max(1, countLimit))}
            onChange={event => setCount(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
            disabled={disabled || loading || !availableSlots}/>
          <small>1–20 per request · {availableSlots} slots left</small>
        </label>
        <label>Difficulty
          <select value={difficulty} disabled={disabled || loading}
            onChange={event => setDifficulty(event.target.value as typeof difficulty)}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
      </div>
      {error && <p className="notice error" role="alert"><AlertCircle size={17}/>{error}</p>}
      {message && <p className="notice success" role="status"><Check size={17}/>{message}</p>}
      <button className="button primary" type="submit"
        disabled={disabled || loading || !availableSlots || transcript.trim().length < 160}>
        {loading ? <LoaderCircle className="spin" size={17}/> : <Sparkles size={17}/>}
        {loading ? "Generating suggestions…" : "Generate draft questions"}
      </button>
      <small className="muted">Up to 10 generation requests per instructor per UTC day. Model availability and pricing depend on your Gemini account.</small>
    </form>
    {!!generated.length && <div className="ai-generated-review">
      <div className="panel-heading"><div><h3>Suggestions to review</h3>
        <p>Select which questions to add. All imported questions still require explicit review.</p></div>
        <span className="badge lavender">{selected.length}/{generated.length} selected</span></div>
      {generated.map((q, index) => <div className="ai-generated-question" key={index}>
        <label className="checkbox-label">
          <input type="checkbox" checked={selected.includes(index)} onChange={event =>
            setSelected(values => event.target.checked ? [...values, index] : values.filter(v => v !== index))}/>
          <span><strong>Question {index + 1}: {q.prompt}</strong></span>
        </label>
        <ol className="preview-options">{q.options.map((option,i) => <li key={i}
          className={i===q.correctIndex ? "correct-option" : ""}>
          <span>{String.fromCharCode(65+i)}</span><p>{option}</p>
          {i===q.correctIndex && <strong>Suggested answer</strong>}
        </li>)}</ol>
        <p><strong>Suggested explanation:</strong> {q.explanation}</p>
        <p className="muted"><FileText size={14} style={{display:"inline"}}/> Supporting excerpt: “{q.sourceExcerpt}”</p>
      </div>)}
      <button className="button primary" type="button" disabled={disabled || loading || selected.length===0 || selected.length>availableSlots}
        onClick={append}><Check size={17}/> Add {selected.length} to editable quiz</button>
    </div>}
  </section>;
}
