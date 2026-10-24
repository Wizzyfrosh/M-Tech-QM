"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Send } from "lucide-react";
import type {
  assignmentDetail,
  assignmentSubmissions,
} from "@/lib/assignments";
import {
  assignmentDate,
  assignmentStatusLabel,
  type AssignmentDraft,
} from "@/lib/assignment-policy";
import {
  AssignmentInstructions,
  assignmentRequest,
  errorMessage,
  type Serialized,
} from "./assignment-shared";
type Detail = Serialized<Awaited<ReturnType<typeof assignmentDetail>>>;
type Submissions = Serialized<
  Awaited<ReturnType<typeof assignmentSubmissions>>
>;
function draftOf(a: Detail["assignment"]): AssignmentDraft {
  return {
    title: a.title,
    instructions: a.instructions,
    rubric: a.rubric,
    resources: a.resources,
    submissionType: a.submissionType as "PROJECT" | "TEXT",
    maxMarks: a.maxMarks,
    deadline: a.deadline,
    allowLate: a.allowLate,
  };
}
export function AssignmentEditor({
  initial,
  submissions: initialSubmissions,
}: {
  initial: Detail;
  submissions: Submissions;
}) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState(draftOf(initial.assignment));
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<
    "publish" | "close" | "archive" | "release" | "delete" | null
  >(null);
  const router = useRouter();
  const a = data.assignment;
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(a));
  const editable = a.status === "DRAFT";
  async function reload(page = submissions.page) {
    const [d, s] = await Promise.all([
      assignmentRequest<Detail>(`/api/assignments/${a.id}`),
      assignmentRequest<Submissions>(
        `/api/instructor/assignments/${a.id}/submissions?page=${page}`,
      ),
    ]);
    setData(d);
    setDraft(draftOf(d.assignment));
    setSubmissions(s);
  }
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await assignmentRequest(`/api/instructor/assignments/${a.id}`, "PATCH", {
        ...draft,
        resources: draft.resources.map((v) => v.trim()).filter(Boolean),
        revision: a.revision,
      });
      await reload();
      setMessage("Assignment draft saved.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function act() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await assignmentRequest<{ released?: number }>(
        `/api/instructor/assignments/${a.id}`,
        confirm === "delete" ? "DELETE" : "POST",
        {
          revision: a.revision,
          acknowledged: true,
          ...(confirm !== "delete" ? { action: confirm } : {}),
        },
      );
      if (confirm === "delete") {
        router.push("/instructor/assignments");
        return;
      }
      await reload();
      setMessage(
        confirm === "release"
          ? `${result.released} grade(s) released. Notifications are being processed for eligible students.`
          : `Assignment ${confirm === "publish" ? "published" : confirm === "close" ? "closed" : "archived"}.`,
      );
      setConfirm(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function field<K extends keyof AssignmentDraft>(
    key: K,
    value: AssignmentDraft[K],
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
    setConfirm(null);
  }
  const localDeadline = draft.deadline
    ? new Date(new Date(draft.deadline).getTime() + 3600000)
        .toISOString()
        .slice(0, 16)
    : "";
  return (
    <>
      <Link href="/instructor/assignments" className="back-link">
        <ArrowLeft size={16} /> Assignments
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">INDEPENDENT ASSIGNMENT</span>
          <h1>{a.title}</h1>
          <p>
            {assignmentStatusLabel(a.status)} ·{" "}
            {dirty ? "Unsaved changes" : "All changes saved"}
          </p>
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {editable ? (
        <form
          className="panel assignment-panel assignment-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2>Assignment brief</h2>
          <label>
            Assignment title
            <input
              value={draft.title}
              maxLength={120}
              required
              onChange={(e) => field("title", e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Submission format
            <select
              value={draft.submissionType}
              onChange={(e) =>
                field("submissionType", e.target.value as "TEXT" | "PROJECT")
              }
              disabled={busy}
            >
              <option value="PROJECT">Flutter / coding project</option>
              <option value="TEXT">Written response</option>
            </select>
          </label>
          <label>
            Instructions
            <textarea
              rows={9}
              maxLength={20000}
              value={draft.instructions}
              onChange={(e) => field("instructions", e.target.value)}
              disabled={busy}
              placeholder="Describe what to build, required behavior, and what evidence students should submit."
            />
          </label>
          <label>
            Marking guidelines
            <textarea
              rows={5}
              maxLength={5000}
              value={draft.rubric}
              onChange={(e) => field("rubric", e.target.value)}
              disabled={busy}
              placeholder="Example: functionality 50, widget use 25, responsiveness 15, code organization 10."
            />
          </label>
          <div className="assignment-form-grid">
            <label>
              Maximum marks
              <input
                type="number"
                min={1}
                max={1000}
                required
                value={draft.maxMarks}
                onChange={(e) => field("maxMarks", Number(e.target.value))}
                disabled={busy}
              />
            </label>
            <label>
              Deadline (WAT, optional)
              <input
                type="datetime-local"
                value={localDeadline}
                onChange={(e) =>
                  field(
                    "deadline",
                    e.target.value
                      ? new Date(`${e.target.value}:00+01:00`).toISOString()
                      : null,
                  )
                }
                disabled={busy}
              />
            </label>
          </div>
          <label className="check-line">
            <input
              type="checkbox"
              checked={draft.allowLate}
              onChange={(e) => field("allowLate", e.target.checked)}
              disabled={busy}
            />{" "}
            Accept late submissions and label them late
          </label>
          <label>
            Resource links (one HTTPS link per line, up to 5)
            <textarea
              rows={3}
              value={draft.resources.join("\n")}
              onChange={(e) => field("resources", e.target.value.split("\n"))}
              disabled={busy}
            />
          </label>
          <p className="muted">
            Published instructions, deadlines and maximum marks are locked.
            Check the brief before publishing. Project submissions require a
            fixed GitHub commit link; files are not uploaded in this version.
          </p>
          <button className="button primary" type="submit" disabled={busy}>
            <Save size={16} />
            {busy ? "Saving…" : "Save assignment"}
          </button>
        </form>
      ) : (
        <AssignmentInstructions assignment={a} />
      )}
      <section className="panel assignment-panel">
        <h2>Assignment actions</h2>
        <p className="muted">
          {editable
            ? "Save your brief before publishing. Publishing notifies approved students."
            : "Saving a grade keeps it private. Release only when your review is complete; future submissions can be graded and released separately."}
        </p>
        <div className="button-row">
          {editable && (
            <>
              <button
                className="button primary"
                disabled={busy || dirty}
                onClick={() => setConfirm("publish")}
              >
                <Send size={16} />
                Publish assignment
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={() => setConfirm("delete")}
              >
                Delete draft
              </button>
            </>
          )}
          {a.status === "PUBLISHED" && (
            <button
              className="button"
              disabled={busy}
              onClick={() => setConfirm("close")}
            >
              Close submissions
            </button>
          )}
          {["PUBLISHED", "CLOSED"].includes(a.status) && (
            <button
              className="button"
              disabled={busy}
              onClick={() => setConfirm("archive")}
            >
              Archive assignment
            </button>
          )}
          {!editable && (
            <button
              className="button primary"
              disabled={busy || !submissions.graded}
              onClick={() => setConfirm("release")}
            >
              Release graded results ({submissions.graded})
            </button>
          )}
          <button
            className="button"
            disabled={busy || dirty}
            onClick={() => {
              setBusy(true);
              void reload()
                .catch((e) => setError(errorMessage(e)))
                .finally(() => setBusy(false));
            }}
          >
            Refresh records
          </button>
        </div>
        {confirm && (
          <div className="notice assignment-confirm">
            <h3>
              {confirm === "release"
                ? "Release reviewed grades?"
                : `Confirm ${confirm}`}
            </h3>
            <p>
              {confirm === "publish"
                ? "This locks the brief and notifies approved students. Review your saved instructions and deadline first."
                : confirm === "release"
                  ? "Release all currently graded, unreleased work belonging to approved students? Their scores and feedback become visible and they receive email and in-app notifications. Released grades are locked."
                  : confirm === "close"
                    ? "Stop new submissions and ordinary edits? Students you explicitly ask for corrections may still resubmit."
                    : confirm === "archive"
                      ? "Hide this assignment from students who never submitted and stop all submissions, including requested revisions? Existing submitted work and grades remain available."
                      : "Permanently remove this unpublished draft?"}
            </p>
            <div className="button-row">
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void act()}
              >
                {confirm === "release"
                  ? "Confirm grade release"
                  : `Confirm ${confirm}`}
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
      {!editable && (
        <section className="panel assignment-panel">
          <div className="panel-heading">
            <div>
              <h2>Submission tracker</h2>
              <p>
                Approved students without a current submission:{" "}
                {submissions.notSubmitted}. Grades released:{" "}
                {submissions.released}.
              </p>
            </div>
          </div>
          {!submissions.items.length ? (
            <p className="muted">No student work yet.</p>
          ) : (
            <div className="assignment-roster">
              {submissions.items.map((s) => (
                <article key={s.id}>
                  <div>
                    <strong>{s.user.name}</strong>
                    <small>{s.user.email}</small>
                    <p>
                      {s.releasedAt
                        ? "Grade released"
                        : assignmentStatusLabel(s.status)}
                      {s.late ? " · Late" : ""} ·{" "}
                      {s.submittedAt
                        ? assignmentDate(s.submittedAt)
                        : "Not submitted"}
                    </p>
                  </div>
                  <Link
                    className="button"
                    href={`/instructor/assignments/${a.id}/submissions/${s.id}`}
                  >
                    Review work
                  </Link>
                </article>
              ))}
            </div>
          )}
          {submissions.total > 20 && (
            <div className="button-row assignment-pagination">
              <button
                className="button"
                disabled={busy || submissions.page === 1}
                onClick={() => {
                  setBusy(true);
                  void reload(submissions.page - 1)
                    .catch((e) => setError(errorMessage(e)))
                    .finally(() => setBusy(false));
                }}
              >
                Previous
              </button>
              <span>Page {submissions.page}</span>
              <button
                className="button"
                disabled={busy || submissions.page * 20 >= submissions.total}
                onClick={() => {
                  setBusy(true);
                  void reload(submissions.page + 1)
                    .catch((e) => setError(errorMessage(e)))
                    .finally(() => setBusy(false));
                }}
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
