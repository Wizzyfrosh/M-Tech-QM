"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, ArrowRight, Search, LoaderCircle } from "lucide-react";
import { formatDeadline, effectivelyClosed } from "@/lib/quiz-policy";
import { useHydrated } from "@/lib/use-hydrated";
type Summary = {
  id: string;
  shareSlug: string;
  title: string;
  lessonLabel: string;
  status: string;
  deadline: string | null;
  _count: { questions: number };
};
export function QuizWorkspace({ instructor }: { instructor: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [quizzes, setQuizzes] = useState<Summary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      instructor
        ? `/api/instructor/quizzes?page=${page}&q=${encodeURIComponent(search)}&status=${status}`
        : `/api/quizzes?page=${page}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setQuizzes(data.quizzes);
        setTotal(data.total);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setError(e.message || "Could not load quizzes.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [instructor, page, search, status, refresh]);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/instructor/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      router.push(`/instructor/quizzes/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create quiz.");
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {instructor ? "BUILD UNDERSTANDING" : "PUT YOUR LEARNING TO WORK"}
          </span>
          <h1>{instructor ? "Quizzes" : "My quizzes"}</h1>
          <p>
            {instructor
              ? "Create focused assessments for your programming lessons."
              : "Find the quizzes your instructor has shared with you."}
          </p>
        </div>
        {instructor && (
          <button
            className="button primary"
            onClick={create}
            disabled={busy || !hydrated}
          >
            <Plus size={17} />
            {busy ? "Creating…" : "Create quiz"}
          </button>
        )}
      </div>
      <section className="panel">
        {instructor && (
          <div className="quiz-filters">
            <form
              className="searchbar"
              onSubmit={(e) => {
                e.preventDefault();
                setLoading(true);
                setPage(1);
                setSearch(query);
                setRefresh((value) => value + 1);
              }}
            >
              <Search size={18} />
              <input
                aria-label="Search quizzes"
                placeholder="Search by title"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={!hydrated}
              />
              <button className="button small" disabled={!hydrated}>
                Search
              </button>
            </form>
            <label>
              Status
              <select
                value={status}
                onChange={(e) => {
                  setLoading(true);
                  setPage(1);
                  setStatus(e.target.value);
                }}
                disabled={!hydrated}
              >
                <option value="">All quizzes</option>
                {["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"].map((s) => (
                  <option value={s} key={s}>
                    {s.slice(0, 1) + s.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <div className="empty" role="status">
            <LoaderCircle className="spin" />
            Loading quizzes…
          </div>
        ) : quizzes.length ? (
          <div className="quiz-grid">
            {quizzes.map((quiz) => (
              <Link
                className="quiz-card"
                key={quiz.id}
                href={
                  instructor
                    ? `/instructor/quizzes/${quiz.id}`
                    : `/q/${quiz.shareSlug}`
                }
              >
                <div className="quiz-card-top">
                  <span className="empty-icon small-icon">
                    <BookOpen size={22} />
                  </span>
                  <span
                    className={`badge ${quiz.status === "DRAFT" ? "amber" : quiz.status === "PUBLISHED" && !effectivelyClosed({ ...quiz, deadline: quiz.deadline ? new Date(quiz.deadline) : null }) ? "green" : "lavender"}`}
                  >
                    {effectivelyClosed({
                      ...quiz,
                      deadline: quiz.deadline ? new Date(quiz.deadline) : null,
                    }) && quiz.status === "PUBLISHED"
                      ? "Closed"
                      : quiz.status.slice(0, 1) +
                        quiz.status.slice(1).toLowerCase()}
                  </span>
                </div>
                <h2>{quiz.title}</h2>
                <p>{quiz.lessonLabel || "Lesson not added yet"}</p>
                <div className="quiz-card-meta">
                  <span>{quiz._count.questions} questions</span>
                  <span>{formatDeadline(quiz.deadline)}</span>
                </div>
                <span className="quiz-card-link">
                  {instructor ? "Open quiz" : "View details"}
                  <ArrowRight size={15} />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">
            <span className="empty-icon">
              <BookOpen size={28} />
            </span>
            <h3>
              {instructor ? "Create your first quiz" : "No quizzes shared yet"}
            </h3>
            <p>
              {instructor
                ? "Start with a draft. You can save your work before every question is finished."
                : "Your instructor’s published quizzes will appear here."}
            </p>
          </div>
        )}
        <div className="pagination">
          <span>
            {total} quizzes · Page {page} of{" "}
            {Math.max(1, Math.ceil(total / 20))}
          </span>
          <div className="button-row">
            <button
              className="button small"
              disabled={page <= 1 || loading}
              onClick={() => {
                setLoading(true);
                setPage((p) => p - 1);
              }}
            >
              Previous
            </button>
            <button
              className="button small"
              disabled={page * 20 >= total || loading}
              onClick={() => {
                setLoading(true);
                setPage((p) => p + 1);
              }}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
