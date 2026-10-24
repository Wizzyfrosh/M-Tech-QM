"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPenLine, Plus, ArrowRight } from "lucide-react";
import type { assignmentList } from "@/lib/assignments";
import { assignmentDate, assignmentStatusLabel } from "@/lib/assignment-policy";
import {
  assignmentRequest,
  errorMessage,
  type Serialized,
} from "./assignment-shared";
type Listing = Serialized<Awaited<ReturnType<typeof assignmentList>>>;
export function AssignmentWorkspace({ instructor }: { instructor: boolean }) {
  const [data, setData] = useState<Listing | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    assignmentRequest<Listing>(`/api/assignments?page=${page}`)
      .then((result) => {
        if (alive) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [page, retry]);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const a = await assignmentRequest<{ id: string }>(
        "/api/instructor/assignments",
        "POST",
        {},
      );
      router.push(`/instructor/assignments/${a.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PRACTICE THROUGH BUILDING</span>
          <h1>Assignments</h1>
          <p>
            {instructor
              ? "Set independent tasks, review submissions and release feedback."
              : "Build, submit your work and learn from your instructor’s feedback."}
          </p>
        </div>
        {instructor && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void create()}
          >
            <Plus size={17} />
            {busy ? "Creating…" : "Create assignment"}
          </button>
        )}
      </div>
      {error && (
        <div className="notice" role="alert">
          {error}{" "}
          <button
            className="text-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry loading
          </button>
        </div>
      )}
      {!data ? (
        <p role="status">Loading assignments…</p>
      ) : !data.items.length ? (
        <section className="panel empty">
          <ClipboardPenLine size={32} />
          <h2>
            {instructor
              ? "Your next practical challenge"
              : "No assignments yet"}
          </h2>
          <p>
            {instructor
              ? "Create a Flutter project task or a written exercise. Assignments work independently of quizzes."
              : "Assignments your instructor publishes will appear here."}
          </p>
        </section>
      ) : (
        <div className="assignment-grid">
          {data.items.map((a) => (
            <section className="panel assignment-card" key={a.id}>
              <div className="panel-heading">
                <span className="badge lavender">
                  {assignmentStatusLabel(a.status)}
                </span>
                <ClipboardPenLine size={20} />
              </div>
              <h2>{a.title}</h2>
              <p className="muted">
                {a.submissionType === "PROJECT"
                  ? "Project submission"
                  : "Written response"}{" "}
                · {a.maxMarks} marks
              </p>
              <p>Due: {assignmentDate(a.deadline)}</p>
              {!instructor && (
                <p className="assignment-progress">
                  {assignmentStatusLabel(a.submissionStatus)}
                </p>
              )}
              <Link
                className="button"
                href={`/${instructor ? "instructor" : "student"}/assignments/${a.id}`}
              >
                {instructor ? "Manage assignment" : "Open assignment"}
                <ArrowRight size={16} />
              </Link>
            </section>
          ))}
        </div>
      )}
      {data && data.total > 20 && (
        <div className="button-row assignment-pagination">
          <button
            className="button"
            disabled={page === 1}
            onClick={() => {
              setData(null);
              setPage((n) => n - 1);
            }}
          >
            Previous
          </button>
          <span>
            Page {page} of {Math.ceil(data.total / 20)}
          </span>
          <button
            className="button"
            disabled={page * 20 >= data.total}
            onClick={() => {
              setData(null);
              setPage((n) => n + 1);
            }}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
