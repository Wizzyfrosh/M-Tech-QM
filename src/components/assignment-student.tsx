"use client";
import Link from "next/link";
import { AssignmentFileUpload } from "./assignment-file-upload";
import type { AssignmentFileInfo } from "@/lib/assignment-file-policy";
import { useEffect, useState } from "react";
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
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<AssignmentFileInfo[]>(
    initial.submission?.files ?? [],
  );
  const [confirm, setConfirm] = useState<"submit" | "edit" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const a = data.assignment,
    s = data.submission;
  const dirty =
    JSON.stringify(files.map((f) => f.id)) !==
      JSON.stringify(s?.attachmentIds ?? []) ||
    responseText !== (s?.responseText ?? "") ||
    projectUrl !== (s?.projectUrl ?? "") ||
    evidence !== (s?.evidenceUrls.join("\n") ?? "");
  useEffect(() => {
    if (confirm)
      document
        .querySelector(".assignment-confirm")
        ?.scrollIntoView({ block: "nearest" });
  }, [confirm]);
  async function act(action: "save" | "submit" | "edit") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await assignmentRequest(`/api/assignments/${a.id}/submission`, "POST", {
        action,
        attachmentIds: files.map((f) => f.id),
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
      setFiles(result.submission?.files ?? []);
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
              aria-label={
                a.submissionType === "TEXT"
                  ? "Written response"
                  : "Explain your work"
              }
              rows={9}
              maxLength={20000}
              value={responseText}
              onChange={(e) => {
                setResponse(e.target.value);
                setConfirm(null);
              }}
              disabled={busy || uploading}
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
                GitHub commit link (optional when attaching a project ZIP)
                <input
                  aria-label="GitHub commit link"
                  type="url"
                  maxLength={2000}
                  value={projectUrl}
                  onChange={(e) => {
                    setProject(e.target.value);
                    setConfirm(null);
                  }}
                  disabled={busy || uploading}
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
              aria-label="Evidence links (optional, one HTTPS link per line, up to 5)"
              rows={3}
              value={evidence}
              onChange={(e) => {
                setEvidence(e.target.value);
                setConfirm(null);
              }}
              disabled={busy || uploading}
              placeholder="Link to screenshots, a demonstration video, or a live web build."
            />
          </label>
          <p className="muted">
            Use links your instructor can open. For a coding assignment, attach
            a project ZIP or provide a fixed GitHub commit link. APK files are
            not accepted.
          </p>
          <AssignmentFileUpload
            assignmentId={a.id}
            value={files}
            onChange={(value) => {
              setFiles(value);
              setConfirm(null);
            }}
            disabled={busy || uploading}
            onBusyChange={setUploading}
          />
          <div className="button-row">
            <button
              className="button"
              type="button"
              disabled={busy || uploading}
              onClick={() => void act("save")}
            >
              Save draft
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={busy || uploading || !responseText.trim()}
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
                files={data.versions[0]?.files ?? []}
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
              disabled={busy || uploading}
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
              disabled={busy || uploading}
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
              disabled={busy || uploading}
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
                files={v.files}
              />
            </details>
          ))}
        </section>
      )}
    </>
  );
}
