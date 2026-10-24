"use client";
import Link from "next/link";
import { useState } from "react";
import type { instructorSubmission } from "@/lib/assignments";
import { assignmentDate, assignmentStatusLabel } from "@/lib/assignment-policy";
import {
  SubmissionEvidence,
  assignmentRequest,
  errorMessage,
  type Serialized,
} from "./assignment-shared";
type Submission = Serialized<Awaited<ReturnType<typeof instructorSubmission>>>;
export function AssignmentReview({ initial }: { initial: Submission }) {
  const [data, setData] = useState(initial);
  const [grade, setGrade] = useState(
    initial.grade === null ? "" : String(initial.grade),
  );
  const [feedback, setFeedback] = useState(
    initial.feedback || initial.changeRequest,
  );
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const url = `/api/instructor/assignments/${data.assignmentId}/submissions/${data.id}`;
  const canReview =
    !data.releasedAt && ["SUBMITTED", "GRADED"].includes(data.status);
  async function act(action: "grade" | "request_changes") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await assignmentRequest(url, "POST", {
        action,
        revision: data.revision,
        feedback,
        ...(action === "grade" ? { grade: Number(grade) } : {}),
      });
      const updated = await assignmentRequest<Submission>(url);
      setData(updated);
      setGrade(updated.grade === null ? "" : String(updated.grade));
      setConfirm(false);
      setMessage(
        action === "grade"
          ? "Grade saved privately. Return to the assignment and release graded results when your review is complete."
          : "Changes requested. The student can read your instructions and submit a new version.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link
        className="back-link"
        href={`/instructor/assignments/${data.assignmentId}`}
      >
        Back to assignment
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ASSIGNMENT REVIEW</span>
          <h1>{data.assignment.title}</h1>
          <p>
            {data.user.name} · {data.user.email}
          </p>
        </div>
        <span className="badge lavender">
          {data.releasedAt
            ? "Grade released"
            : assignmentStatusLabel(data.status)}
        </span>
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
      <section className="panel assignment-panel">
        <h2>Submitted work</h2>
        <p className="muted">
          {data.versions[0]
            ? `Version ${data.versions[0].version} · ${assignmentDate(data.versions[0].submittedAt)}`
            : "The student has not submitted work yet."}
          {data.versions[0]?.late ? " · Late" : ""}
        </p>
        <SubmissionEvidence
          responseText={data.responseText}
          projectUrl={data.projectUrl}
          evidenceUrls={data.evidenceUrls}
        />
        {data.status === "DRAFT" && (
          <p className="notice">
            The student is working on a draft. Earlier versions are historical
            and cannot be graded until they submit again.
          </p>
        )}
      </section>
      {data.assignment.rubric && (
        <section className="panel assignment-panel">
          <h2>Marking guidelines</h2>
          <p className="pre-wrap assignment-prose">{data.assignment.rubric}</p>
        </section>
      )}
      <form
        className="panel assignment-panel assignment-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act("grade");
        }}
      >
        <h2>
          {data.releasedAt
            ? "Released grade and feedback"
            : "Instructor feedback"}
        </h2>
        <label>
          Marks out of {data.assignment.maxMarks}
          <input
            type="number"
            min={0}
            max={data.assignment.maxMarks}
            step={1}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            disabled={busy || !canReview}
          />
        </label>
        <label>
          Feedback
          <textarea
            rows={7}
            maxLength={10000}
            value={feedback}
            onChange={(e) => {
              setFeedback(e.target.value);
              setConfirm(false);
            }}
            disabled={busy || !canReview}
          />
        </label>
        {canReview && (
          <>
            <p className="muted">
              Saving a grade keeps marks and feedback private. Requesting
              changes sends this feedback to the student immediately and reopens
              their submission, even after the deadline.
            </p>
            <div className="button-row">
              <button
                className="button primary"
                type="submit"
                disabled={busy || grade === "" || !feedback.trim()}
              >
                Save private grade
              </button>
              <button
                className="button"
                type="button"
                disabled={
                  busy ||
                  !feedback.trim() ||
                  data.assignment.status === "ARCHIVED"
                }
                onClick={() => setConfirm(true)}
              >
                Request changes
              </button>
            </div>
          </>
        )}
        {confirm && (
          <div className="notice">
            <p>
              Send this feedback and allow a new submission? Any unpublished
              grade is cleared. Earlier submitted versions are preserved.
            </p>
            <div className="button-row">
              <button
                className="button primary"
                type="button"
                disabled={busy}
                onClick={() => void act("request_changes")}
              >
                Confirm request changes
              </button>
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </form>
      {data.versions.length > 1 && (
        <section className="panel assignment-panel">
          <h2>Earlier submitted versions</h2>
          {data.versions.slice(1).map((v) => (
            <details className="assignment-version" key={v.id}>
              <summary>
                Version {v.version} · {assignmentDate(v.submittedAt)}
              </summary>
              <SubmissionEvidence
                responseText={v.responseText}
                projectUrl={v.projectUrl}
                evidenceUrls={v.evidenceUrls}
              />
            </details>
          ))}
        </section>
      )}
    </>
  );
}
