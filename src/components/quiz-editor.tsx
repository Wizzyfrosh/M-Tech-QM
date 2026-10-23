"use client";
import Link from "next/link";
import { AiQuizPanel } from "@/components/ai-quiz-panel";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Save,
  Eye,
  Copy,
  LockKeyhole,
  Check,
  BarChart3,
} from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import {
  type EditorQuiz,
  type QuizDraft,
  type QuestionDraft,
  blankQuestion,
  publishIssues,
  formatDeadline,
  lagosInput,
  fromLagosInput,
  effectivelyClosed,
} from "@/lib/quiz-policy";
function draftOf(q: EditorQuiz): QuizDraft {
  return {
    title: q.title,
    lessonLabel: q.lessonLabel,
    description: q.description,
    lessonUrl: q.lessonUrl,
    deadline: q.deadline,
    reviewMode: q.reviewMode,
    leaderboardEnabled: q.leaderboardEnabled,
    questions: q.questions,
  };
}
type Action = "publish" | "duplicate" | "close" | "archive" | "delete";
export function QuizEditor({ initial }: { initial: EditorQuiz }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<QuizDraft>(() => draftOf(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [settingsDeadline, setSettingsDeadline] = useState(initial.deadline);
  const [settingsRanking, setSettingsRanking] = useState(
    initial.leaderboardEnabled,
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(saved));
  const locked = saved.status !== "DRAFT";
  const issues = publishIssues(draft);
  const closed = effectivelyClosed({
    ...saved,
    deadline: saved.deadline ? new Date(saved.deadline) : null,
  });
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change<T extends keyof QuizDraft>(key: T, value: QuizDraft[T]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  }
  function question(index: number, patch: Partial<QuestionDraft>) {
    change(
      "questions",
      draft.questions.map((q, i) =>
        i === index
          ? {
              ...q,
              ...patch,
              reviewed: "reviewed" in patch ? !!patch.reviewed : false,
            }
          : q,
      ),
    );
  }
  function reorder(index: number, offset: number) {
    const questions = [...draft.questions];
    [questions[index], questions[index + offset]] = [
      questions[index + offset],
      questions[index],
    ];
    change("questions", questions);
  }
  async function send(path: string, body: unknown, method = "POST") {
    const r = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Could not update quiz.");
    return data;
  }
  function accept(data: EditorQuiz) {
    setSaved(data);
    setDraft(draftOf(data));
    setSettingsDeadline(data.deadline);
    setSettingsRanking(data.leaderboardEnabled);
  }
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      accept(
        await send(
          `/api/instructor/quizzes/${saved.id}`,
          { ...draft, revision: saved.revision },
          "PATCH",
        ),
      );
      setMessage("Draft saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save draft.");
    } finally {
      setBusy(false);
    }
  }
  async function act(action: Action) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await send(
        action === "delete"
          ? `/api/instructor/quizzes/${saved.id}`
          : `/api/instructor/quizzes/${saved.id}/${action}`,
        {
          revision: saved.revision,
          ...(action === "duplicate" ? {} : { acknowledged: true }),
        },
        action === "delete" ? "DELETE" : "POST",
      );
      if (action === "duplicate") {
        router.push(`/instructor/quizzes/${data.id}`);
        router.refresh();
      } else if (action === "delete") {
        router.push("/instructor/quizzes");
        router.refresh();
      } else {
        accept(data);
        setConfirm(null);
        setMessage(
          action === "publish"
            ? "Quiz published. The questions and answer key are now locked."
            : action === "close"
              ? "Quiz closed."
              : "Quiz archived.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update quiz.");
    } finally {
      setBusy(false);
    }
  }
  async function settings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      accept(
        await send(
          `/api/instructor/quizzes/${saved.id}/settings`,
          {
            revision: saved.revision,
            deadline: settingsDeadline,
            leaderboardEnabled: settingsRanking,
          },
          "PATCH",
        ),
      );
      setMessage("Quiz settings updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update settings.");
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || !hydrated;
  return (
    <>
      <Link
        className="back-link"
        href="/instructor/quizzes"
        onClick={(e) => {
          if (dirty && !window.confirm("Discard your unsaved quiz changes?"))
            e.preventDefault();
        }}
      >
        <ArrowLeft size={16} />
        All quizzes
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {locked ? "PUBLISHED ASSESSMENT" : "QUIZ BUILDER"}
          </span>
          <h1>{saved.title}</h1>
          <p>
            <span className={`badge ${locked ? "green" : "amber"}`}>
              {saved.status}
            </span>{" "}
            <span role="status">
              {dirty ? "Unsaved changes" : "All changes saved"}
            </span>
          </p>
        </div>
        <div className="button-row">
          {!locked && (
            <button
              className="button primary"
              onClick={save}
              disabled={disabled || !dirty}
            >
              <Save size={17} />
              Save draft
            </button>
          )}
          <Link
            className={`button ${dirty ? "disabled-link" : ""}`}
            aria-disabled={dirty}
            href={`/instructor/quizzes/${saved.id}/preview`}
            onClick={(e) => {
              if (dirty) e.preventDefault();
            }}
          >
            <Eye size={17} />
            Preview saved quiz
          </Link>
        </div>
      </div>
      {error && (
        <p role="alert" className="notice error quiz-notice">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice success quiz-notice">
          {message}
        </p>
      )}
      {locked && (
        <p className="notice quiz-lock">
          <LockKeyhole size={18} /> Published questions are locked. Duplicate
          this quiz to create a revised assessment.
        </p>
      )}
      {confirm && (
        <section
          className="panel action-confirm"
          aria-label="Confirm quiz action"
        >
          <h2>
            {confirm === "publish"
              ? "Publish this quiz?"
              : confirm === "delete"
                ? "Delete this draft?"
                : confirm === "close"
                  ? "Close this quiz now?"
                  : "Archive this quiz?"}
          </h2>
          <p>
            {confirm === "publish"
              ? "Questions, marks and correct answers will be locked. A shareable details page will be available; student submissions are not available yet."
              : confirm === "delete"
                ? "This permanently removes this draft."
                : confirm === "close"
                  ? "Students will no longer be able to submit answers when attempts are enabled. The quiz cannot be reopened."
                  : "The quiz will leave the active list. Its records will be preserved."}
          </p>
          <div className="button-row">
            <button
              className={`button ${confirm === "delete" ? "danger" : "primary"}`}
              disabled={disabled}
              onClick={() => act(confirm)}
            >
              Confirm {confirm}
            </button>
            <button
              className="button"
              disabled={disabled}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      <div className="editor-layout">
        <div className="editor-main">
          <section className="panel">
            <h2>Quiz details</h2>
            <fieldset
              className="form-stack bare-fieldset"
              disabled={disabled || locked}
            >
              <label>
                Quiz title
                <input
                  value={draft.title}
                  onChange={(e) => change("title", e.target.value)}
                  maxLength={120}
                  required
                />
              </label>
              <label>
                Lesson name
                <input
                  value={draft.lessonLabel}
                  onChange={(e) => change("lessonLabel", e.target.value)}
                  maxLength={120}
                  placeholder="e.g. JavaScript variables"
                />
              </label>
              <label>
                Description
                <textarea
                  value={draft.description}
                  onChange={(e) => change("description", e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="What should students know before starting?"
                />
              </label>
              <label>
                Lesson link (optional)
                <input
                  type="url"
                  value={draft.lessonUrl || ""}
                  onChange={(e) => change("lessonUrl", e.target.value)}
                  placeholder="https://…"
                  maxLength={2000}
                />
                <small>
                  Link to a lesson you already shared. HTTPS links only.
                </small>
              </label>
            </fieldset>
          </section>
          <section className="question-section">
            <div className="panel-heading">
              <div>
                <h2>
                  Questions{" "}
                  <span className="count-pill">
                    {draft.questions.length}/50
                  </span>
                </h2>
                <p>Four answer options. One correct answer.</p>
              </div>
            </div>
            {!draft.questions.length && (
              <div className="panel empty">
                <h3>Start with your first question</h3>
                <p>
                  You can save incomplete questions and return to finish them
                  later.
                </p>
              </div>
            )}
            {draft.questions.map((q, index) => (
              <fieldset
                className="panel question-card"
                aria-label={`Question ${index + 1}`}
                key={index}
                disabled={disabled || locked}
              >
                <legend>Question {index + 1}</legend>
                <div className="question-tools">
                  <span className="badge lavender">
                    {q.marks} {q.marks === 1 ? "mark" : "marks"}
                  </span>
                  {!locked && (
                    <div className="button-row">
                      <button
                        type="button"
                        className="tool-button"
                        aria-label={`Move question ${index + 1} up`}
                        disabled={disabled || index === 0}
                        onClick={() => reorder(index, -1)}
                      >
                        <ArrowUp size={17} />
                      </button>
                      <button
                        type="button"
                        className="tool-button"
                        aria-label={`Move question ${index + 1} down`}
                        disabled={
                          disabled || index === draft.questions.length - 1
                        }
                        onClick={() => reorder(index, 1)}
                      >
                        <ArrowDown size={17} />
                      </button>
                      <button
                        type="button"
                        className="tool-button"
                        aria-label={`Remove question ${index + 1}`}
                        onClick={() =>
                          change(
                            "questions",
                            draft.questions.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="form-stack">
                  <label>
                    Question text
                    <textarea
                      className="code-text"
                      value={q.prompt}
                      onChange={(e) =>
                        question(index, { prompt: e.target.value })
                      }
                      maxLength={4000}
                      rows={3}
                      placeholder="Write a question or paste a code example…"
                    />
                  </label>
                  <fieldset className="bare-fieldset answer-options">
                    <legend>Answer options — select the correct answer</legend>
                    {q.options.map((option, i) => (
                      <div className="option-editor" key={i}>
                        <input
                          type="radio"
                          name={`correct-${index}`}
                          aria-label={`Mark option ${String.fromCharCode(65 + i)} correct`}
                          checked={q.correctIndex === i}
                          onChange={() => question(index, { correctIndex: i })}
                        />
                        <label>
                          Option {String.fromCharCode(65 + i)}
                          <input
                            value={option}
                            maxLength={2000}
                            onChange={(e) =>
                              question(index, {
                                options: q.options.map((o, n) =>
                                  n === i ? e.target.value : o,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </fieldset>
                  <div className="question-details-grid">
                    <label>
                      Marks
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={q.marks}
                        onChange={(e) =>
                          question(index, { marks: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Answer explanation
                      <textarea
                        value={q.explanation}
                        maxLength={4000}
                        rows={2}
                        onChange={(e) =>
                          question(index, { explanation: e.target.value })
                        }
                        placeholder="Explain why the answer is correct."
                      />
                    </label>
                  </div>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={q.reviewed}
                      onChange={(e) =>
                        question(index, { reviewed: e.target.checked })
                      }
                    />
                    <span>
                      I reviewed this question and its correct answer.
                      <small>
                        Editing the question clears this confirmation.
                      </small>
                    </span>
                  </label>
                </div>
              </fieldset>
            ))}
            {!locked && (
              <button
                className="button full add-question"
                onClick={() =>
                  change("questions", [...draft.questions, blankQuestion()])
                }
                disabled={disabled || draft.questions.length >= 50}
              >
                <Plus size={17} />
                Add question
              </button>
            )}
          </section>
          {!locked && <AiQuizPanel
            quizId={saved.id}
            availableSlots={50 - draft.questions.length}
            disabled={disabled || busy}
            onAdd={questions => change("questions", [...draft.questions, ...questions])}
          />}
        </div>
        <aside className="editor-side">
          <section className="panel">
            <h2>Publishing settings</h2>
            <fieldset
              className="form-stack bare-fieldset"
              disabled={disabled || locked}
            >
              <label>
                Deadline (WAT, UTC+1)
                <input
                  type="datetime-local"
                  value={lagosInput(draft.deadline)}
                  onChange={(e) =>
                    change("deadline", fromLagosInput(e.target.value))
                  }
                />
                <small>Leave empty to close the quiz manually.</small>
              </label>
              <label>
                Answer review
                <select
                  value={draft.reviewMode}
                  onChange={(e) =>
                    change(
                      "reviewMode",
                      e.target.value as QuizDraft["reviewMode"],
                    )
                  }
                >
                  <option value="AFTER_CLOSE">After the quiz closes</option>
                  <option value="AFTER_SUBMISSION">After submission</option>
                  <option value="INSTRUCTOR_RELEASE">When I release it</option>
                </select>
                <small>
                  Students will see their score immediately. This controls when
                  correct answers are revealed.
                </small>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={draft.leaderboardEnabled}
                  onChange={(e) =>
                    change("leaderboardEnabled", e.target.checked)
                  }
                />
                <span>
                  Enable quiz leaderboard
                  <small>Rankings appear after the quiz closes.</small>
                </span>
              </label>
            </fieldset>
          </section>
          {!locked ? (
            <section className="panel publish-panel">
              <h2>Ready to publish?</h2>
              <p className="muted">
                {issues.length
                  ? `${issues.length} items need attention.`
                  : "All questions have been reviewed."}
              </p>
              {issues.length ? (
                <ul className="publish-issues">
                  {issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              ) : (
                <p className="ready-line">
                  <Check size={16} />
                  Ready for your final check.
                </p>
              )}
              <button
                className="button primary full"
                disabled={disabled || dirty || issues.length > 0}
                onClick={() => setConfirm("publish")}
              >
                Publish quiz
              </button>
              {dirty && (
                <p className="help-note">
                  Save your changes before previewing or publishing.
                </p>
              )}
              <button
                className="text-button"
                disabled={disabled || dirty}
                onClick={() => setConfirm("delete")}
              >
                Delete draft
              </button>
            </section>
          ) : (
            <section className="panel">
              <h2>Share your quiz</h2>
              <p className="muted">
                A private details page for registered students.
              </p>
              <Link className="share-path" href={`/q/${saved.shareSlug}`}>
                Open quiz details{" "}
                <ArrowLeft size={14} className="rotate-arrow" />
              </Link>
              <button
                className="button full"
                disabled={disabled}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      new URL(`/q/${saved.shareSlug}`, window.location.origin)
                        .href,
                    );
                    setMessage("Quiz link copied.");
                  } catch {
                    setError(
                      "Copy was unavailable. Open the quiz details page and copy its address.",
                    );
                  }
                }}
              >
                <Copy size={16} />
                Copy quiz link
              </button>
              <p className="help-note">{formatDeadline(saved.deadline)}</p>
              <Link className="button full" href={`/instructor/results/${saved.id}`}><BarChart3 size={16}/> View results</Link>
            </section>
          )}
          {locked && (
            <section className="panel">
              <h2>Quiz visibility</h2>
              <form className="form-stack" onSubmit={settings}>
                <label>
                  Deadline (WAT, UTC+1)
                  <input
                    type="datetime-local"
                    value={lagosInput(settingsDeadline)}
                    onChange={(e) =>
                      setSettingsDeadline(fromLagosInput(e.target.value))
                    }
                    disabled={disabled || closed}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settingsRanking}
                    onChange={(e) => setSettingsRanking(e.target.checked)}
                    disabled={disabled}
                  />
                  <span>Show leaderboard</span>
                </label>
                <button className="button" disabled={disabled}>
                  Update settings
                </button>
              </form>
            </section>
          )}
          <section className="panel">
            <h2>Quiz actions</h2>
            <div className="form-stack">
              <button
                className="button"
                disabled={disabled || dirty}
                onClick={() => act("duplicate")}
              >
                <Copy size={16} />
                Duplicate quiz
              </button>
              {saved.status === "PUBLISHED" && (
                <button
                  className="button"
                  disabled={disabled}
                  onClick={() => setConfirm("close")}
                >
                  Close quiz
                </button>
              )}
              {(saved.status === "PUBLISHED" || saved.status === "CLOSED") && (
                <button
                  className="button"
                  disabled={disabled}
                  onClick={() => setConfirm("archive")}
                >
                  Archive quiz
                </button>
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
