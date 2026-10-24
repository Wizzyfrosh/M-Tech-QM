"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import type { assignmentDetail } from "@/lib/assignments";
import { assignmentDate, assignmentStatusLabel } from "@/lib/assignment-policy";
import {
  AssignmentInstructions,
  SubmissionEvidence,
  assignmentRequest,
  errorMessage,
  type Serialized,
} from "./assignment-shared";
type Detail = Serialized<Awaited<ReturnType<typeof assignmentDetail>>>;
export function AssignmentStudent({ initial }: { initial: Detail }) {
  const [data, setData] = useState(initial);
  const [responseText, setResponse] = useState(
    initial.submission?.responseText ?? "",
  );
  const [projectUrl, setProject] = useState(
    initial.submission?.projectUrl ?? "",
  );
  const [evidence, setEvidence] = useState(
    initial.submission?.evidenceUrls.join("\n") ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"submit" | "edit" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const a = data.assignment,
    s = data.submission;
  const dirty =
    responseText !== (s?.responseText ?? "") ||
    projectUrl !== (s?.projectUrl ?? "") ||
    evidence !== (s?.evidenceUrls.join("\n") ?? "");
  async function act(action: "save" | "submit" | "edit") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await assignmentRequest(`/api/assignments/${a.id}/submission`, "POST", {
        action,
        revision: s?.revision ?? 0,
        responseText,
        projectUrl: projectUrl.trim(),
        evidenceUrls: evidence
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean),
      });
      const result = await assignmentRequest<Detail>(
        `/api/assignments/${a.id}`,
      );
      setData(result);
      setResponse(result.submission?.responseText ?? "");
      setProject(result.submission?.projectUrl ?? "");
      setEvidence(result.submission?.evidenceUrls.join("\n") ?? "");
      setConfirm(null);
      setMessage(
        action === "submit"
          ? "Assignment submitted. Your instructor will review your work before releasing your grade."
          : action === "edit"
            ? "Submission returned to draft. Submit again before the deadline so your instructor can review it."
            : "Draft saved. You still need to submit your assignment.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link href="/student/assignments" className="back-link">
        <ArrowLeft size={16} /> Assignments
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR PRACTICAL WORK</span>
          <h1>{a.title}</h1>
          <p>
            {s?.releasedAt
              ? "Grade released"
              : s
                ? assignmentStatusLabel(s.status)
                : "Not submitted"}
          </p>
        </div>
      </div>
      <AssignmentInstructions assignment={a} />
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
      {s?.changeRequest && (
        <section className="panel assignment-panel">
          <h2>Changes requested by your instructor</h2>
          <p className="pre-wrap assignment-prose">{s.changeRequest}</p>
          <p className="muted">
            Your instructor has opened a revision window for this submission,
            including after the original deadline. Resubmit when your
            corrections are ready.
          </p>
        </section>
      )}
      {s?.releasedAt ? (
        <section className="panel assignment-panel assignment-grade">
          <span className="eyebrow">INSTRUCTOR REVIEW</span>
          <h2>Your grade</h2>
          <strong>
            {s.grade} / {a.maxMarks}
          </strong>
          <h3>Feedback</h3>
          <p className="pre-wrap assignment-prose">{s.feedback}</p>
        </section>
      ) : (
        s?.status === "SUBMITTED" && (
          <section className="panel assignment-panel">
            <h2>
              <LockKeyhole size={18} /> Awaiting instructor review
            </h2>
            <p>
              Your submission is recorded. Your score and grading feedback
              appear only after your instructor releases them.
            </p>
          </section>
        )
      )}
      {data.canWrite ? (
        <form
          className="panel assignment-panel assignment-form"
          onSubmit={(e) => {
            e.preventDefault();
            setConfirm("submit");
          }}
        >
          <div>
            <h2>Your submission</h2>
            <p className="muted">
              {dirty
                ? "Unsaved changes. Save a draft before leaving this page."
                : "Your draft is saved when you click Save draft."}
            </p>
          </div>
          <label>
            {a.submissionType === "TEXT"
              ? "Written response"
              : "Explain your work"}
            <textarea
              rows={9}
              maxLength={20000}
              value={responseText}
              onChange={(e) => {
                setResponse(e.target.value);
                setConfirm(null);
              }}
              disabled={busy}
              placeholder={
                a.submissionType === "PROJECT"
                  ? "Explain your implementation, what works, and any difficulties."
                  : "Write your response here. Code is displayed as plain text."
              }
            />
          </label>
          {a.submissionType === "PROJECT" && (
            <>
              <label>
                GitHub commit link
                <input
                  type="url"
                  maxLength={2000}
                  value={projectUrl}
                  onChange={(e) => {
                    setProject(e.target.value);
                    setConfirm(null);
                  }}
                  disabled={busy}
                  placeholder="https://github.com/your-name/project/commit/full-commit-id"
                />
              </label>
              <details>
                <summary>How to copy a fixed code version</summary>
                <p>
                  Push your Flutter project to GitHub. Open its commit history,
                  select the commit you are submitting, and copy that page’s
                  link. It contains /commit/ followed by the full 40-character
                  commit ID. A branch or repository homepage can change later,
                  so it cannot be used as your final code version.
                </p>
                <p>
                  Make sure your instructor can access the repository. Do not
                  include API keys, passwords or private credentials in your
                  code.
                </p>
              </details>
            </>
          )}
          <label>
            Evidence links (optional, one HTTPS link per line, up to 5)
            <textarea
              rows={3}
              value={evidence}
              onChange={(e) => {
                setEvidence(e.target.value);
                setConfirm(null);
              }}
              disabled={busy}
              placeholder="Link to screenshots, a demonstration video, or a live web build."
            />
          </label>
          <p className="muted">
            Use links your instructor can open. This version accepts text and
            links, rather than direct file or APK uploads.
          </p>
          <div className="button-row">
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={() => void act("save")}
            >
              Save draft
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={busy || !responseText.trim()}
            >
              Submit assignment
            </button>
          </div>
        </form>
      ) : (
        <section className="panel assignment-panel">
          <h2>
            {s?.version ? "Your submitted work" : "Submissions unavailable"}
          </h2>
          {s?.version ? (
            <>
              <p className="muted">
                Version {s.version}
                {s.submittedAt ? ` · ${assignmentDate(s.submittedAt)}` : ""}
                {s.late ? " · Late submission" : ""}
              </p>
              <SubmissionEvidence
                responseText={data.versions[0]?.responseText ?? ""}
                projectUrl={data.versions[0]?.projectUrl ?? ""}
                evidenceUrls={data.versions[0]?.evidenceUrls ?? []}
              />
            </>
          ) : (
            <p>
              This assignment is closed or its deadline has passed. Contact your
              instructor if you need help.
            </p>
          )}
          {data.canEdit && (
            <button
              className="button"
              disabled={busy}
              onClick={() => setConfirm("edit")}
            >
              Edit submission
            </button>
          )}
        </section>
      )}
      {confirm && (
        <section className="panel assignment-panel assignment-confirm">
          <h2>
            {confirm === "submit"
              ? "Submit this assignment?"
              : "Return submission to draft?"}
          </h2>
          <p>
            {confirm === "submit"
              ? "Your instructor will receive this version for review. Drafts do not count as submissions. You can edit before the deadline while grading has not started."
              : "Your current work will stop being a submitted assignment until you submit again. Earlier submitted versions are kept."}
          </p>
          <div className="button-row">
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void act(confirm)}
            >
              {busy
                ? "Processing…"
                : confirm === "submit"
                  ? "Confirm submission"
                  : "Confirm edit"}
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      {!!data.versions.length && (
        <section className="panel assignment-panel">
          <h2>Submission history</h2>
          <p className="muted">
            Your most recent 20 submitted versions. Saving a draft does not
            create a submitted version.
          </p>
          {data.versions.map((v) => (
            <details className="assignment-version" key={v.id}>
              <summary>
                Version {v.version} · {assignmentDate(v.submittedAt)}
                {v.late ? " · Late" : ""}
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
