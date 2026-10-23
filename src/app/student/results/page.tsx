import Link from "next/link";
import { FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { pageActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { studentHistory } from "@/lib/attempts";
export const dynamic = "force-dynamic";
export default async function Results({searchParams}: {searchParams:Promise<{page?:string}>}) {
  const actor = await pageActor("STUDENT","/student/results");
  const requested = Number((await searchParams).page);
  const page = Number.isInteger(requested) ? Math.min(10000,Math.max(1,requested)) : 1;
  const {attempts,total} = await studentHistory(getDb(),actor.id,actor.role,page);
  return <AppShell name={actor.name} role={actor.role} active="history">
    <div className="page-heading"><div><span className="eyebrow">YOUR ASSESSMENTS</span><h1>Result history</h1><p>All your submitted official quizzes.</p></div></div>
    <section className="panel">{attempts.length ? <div className="results-list">{attempts.map(a =>
      <Link key={a.id} href={`/attempts/${a.id}/result`} className="result-row">
        <span className="empty-icon small-icon"><FileText size={20}/></span>
        <span><strong>{a.quiz.title}</strong><small>{a.quiz.lessonLabel} · {a.submittedAt?.toLocaleDateString("en-NG",{timeZone:"Africa/Lagos"})}</small></span>
        <strong>{a.earnedMarks}/{a.maxMarks}</strong>
      </Link>)}</div> : <div className="empty"><FileText size={30}/><h2>No submitted results yet</h2><p>Your quiz results will appear here after submission.</p></div>}
      <div className="pagination"><span>{total} submitted · Page {page} of {Math.max(1,Math.ceil(total/20))}</span><div className="button-row">
        {page>1 && <Link className="button small" href={`/student/results?page=${page-1}`}>Previous</Link>}
        {page*20<total && <Link className="button small" href={`/student/results?page=${page+1}`}>Next</Link>}
      </div></div>
    </section>
  </AppShell>;
}
