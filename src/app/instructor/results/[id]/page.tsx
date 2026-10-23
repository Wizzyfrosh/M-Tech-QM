import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Users, CheckCircle2, Clock3, Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AccessError, pageActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { instructorQuizReport } from "@/lib/reports";
export const dynamic = "force-dynamic";
export default async function ReportDetailPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const actor = await pageActor("INSTRUCTOR", `/instructor/results/${id}`);
  const raw = Number((await searchParams).page || "1");
  const page = Number.isInteger(raw) ? Math.min(10000, Math.max(1, raw)) : 1;
  let data: Awaited<ReturnType<typeof instructorQuizReport>>;
  try { data = await instructorQuizReport(getDb(), id, actor.id, page); }
  catch(e) { if (e instanceof AccessError && e.status === 404) notFound(); throw e; }
  const tiles = [
    { name: "Active students", value: data.activeStudents, icon: Users },
    { name: "Submitted", value: data.submitted, icon: CheckCircle2 },
    { name: "Still in progress", value: data.inProgress, icon: Clock3 },
    { name: "Average score", value: data.averagePercent === null ? "—" : `${data.averagePercent}%`, icon: Target },
  ];
  return <AppShell name={actor.name} role={actor.role} active="results">
    <Link href="/instructor/results" className="back-link"><ArrowLeft size={16}/> All results</Link>
    <div className="page-heading"><div><span className="eyebrow">QUIZ PERFORMANCE</span>
      <h1>{data.quiz.title}</h1><p>{data.quiz.lessonLabel} · {data.quiz.status.toLowerCase()}</p></div>
      <a className="button primary" href={`/api/instructor/results/${id}/export`}><Download size={17}/> Export CSV</a></div>
    <div className="stats-grid">{tiles.map(item => <section className="stat-card" key={item.name}>
      <div><span>{item.name}</span><strong>{item.value}</strong><small>Recorded assessment data</small></div>
      <span className="stat-icon"><item.icon size={21}/></span></section>)}</div>
    <p className="notice">Participation is based on students who started this quiz. Active students are the verified, active roster—not proof they received the quiz link.</p>
    <section className="panel"><div className="panel-heading"><div><h2>Question performance</h2>
      <p>Correct submissions divided by all submitted attempts; skipped answers count as incorrect.</p></div></div>
      {data.questions.length ? <div className="report-metrics">{data.questions.map((q,i) =>
        <div className="report-metric" key={q.id}>
          <div><strong>Question {i+1}</strong><p>{q.prompt}</p></div>
          <span>{q.correct} correct · {q.answered} answered · {q.accuracyPercent === null ? "—" : `${q.accuracyPercent}%`}</span>
        </div>)}</div> : <p className="muted">No questions recorded.</p>}
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Student attempts</h2>
      <p>Only the instructor can see names and emails in these results.</p></div></div>
      {data.attempts.length ? <div className="report-scroll"><table className="report-table"><thead><tr>
        <th>Student</th><th>Account</th><th>Status</th><th>Score</th><th>Submitted</th>
      </tr></thead><tbody>{data.attempts.map(a => <tr key={a.id}>
        <td><strong>{a.user.name}</strong><small>{a.user.email}</small></td>
        <td>{a.user.roster?.status ?? "Unassigned"}</td><td>{a.status === "SUBMITTED" ? "Submitted" : "In progress"}</td>
        <td>{a.earnedMarks === null ? "—" : `${a.earnedMarks}/${a.maxMarks} (${a.percent}%)`}</td>
        <td>{a.submittedAt ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" }).format(a.submittedAt) : "—"}</td>
      </tr>)}</tbody></table></div> : <div className="empty">No students have started this quiz.</div>}
      <div className="pagination"><span>{data.total} started · Page {page} of {Math.max(1, Math.ceil(data.total/20))}</span>
        <div className="button-row">{page > 1 && <Link className="button small" href={`/instructor/results/${id}?page=${page-1}`}>Previous</Link>}
        {page * 20 < data.total && <Link className="button small" href={`/instructor/results/${id}?page=${page+1}`}>Next</Link>}</div>
      </div>
    </section>
    {data.quiz.leaderboardEnabled && <Link className="button" href={`/leaderboard/${data.quiz.shareSlug}`}>View quiz leaderboard</Link>}
  </AppShell>;
}
