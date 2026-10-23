import Link from "next/link";
import { BarChart3, ArrowRight, ClipboardList } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { pageActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { reportList } from "@/lib/reports";
export const dynamic = "force-dynamic";
export default async function InstructorResultsPage({
  searchParams,
}: { searchParams: Promise<{ page?: string }> }) {
  const actor = await pageActor("INSTRUCTOR", "/instructor/results");
  const raw = Number((await searchParams).page || "1");
  const page = Number.isInteger(raw) ? Math.min(10000, Math.max(1, raw)) : 1;
  const data = await reportList(getDb(), actor.id, page);
  return <AppShell name={actor.name} role={actor.role} active="results">
    <div className="page-heading"><div><span className="eyebrow">ASSESSMENT INSIGHTS</span>
      <h1>Instructor results</h1><p>Monitor quiz participation and outcomes, and export official scores.</p></div></div>
    <section className="panel">
      {data.quizzes.length ? <div className="results-list">{data.quizzes.map(q =>
        <Link className="result-row" key={q.id} href={`/instructor/results/${q.id}`}>
          <span className="empty-icon small-icon"><BarChart3 size={19}/></span>
          <span><strong>{q.title}</strong><small>{q.lessonLabel} · {q.status.toLowerCase()}</small></span>
          <span className="badge lavender">{q._count.attempts} submitted</span><ArrowRight size={17}/>
        </Link>
      )}</div> : <div className="empty"><ClipboardList size={30}/>
        <h2>No published assessments yet</h2>
        <p>Publish a quiz to begin collecting student submissions and results.</p>
        <Link href="/instructor/quizzes" className="button primary">Go to quizzes</Link></div>}
      <div className="pagination"><span>{data.total} quizzes · Page {page} of {Math.max(1, Math.ceil(data.total / 20))}</span>
        <div className="button-row">{page > 1 && <Link className="button small" href={`/instructor/results?page=${page - 1}`}>Previous</Link>}
          {page * 20 < data.total && <Link className="button small" href={`/instructor/results?page=${page + 1}`}>Next</Link>}</div>
      </div>
    </section>
  </AppShell>;
}
