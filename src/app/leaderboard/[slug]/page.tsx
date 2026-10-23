import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trophy, LockKeyhole } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AccessError, pageActor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { quizLeaderboard } from "@/lib/reports";
export const dynamic = "force-dynamic";
export default async function QuizLeaderboardPage({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params;
  const actor = await pageActor(undefined, `/leaderboard/${slug}`);
  let data: Awaited<ReturnType<typeof quizLeaderboard>>;
  try { data = await quizLeaderboard(getDb(), slug, actor); }
  catch(e) {
    if(e instanceof AccessError && (e.status === 404 || e.status === 403)) notFound();
    if(e instanceof AccessError && e.status === 409) return <AppShell name={actor.name} role={actor.role} active="quizzes">
      <section className="panel empty"><LockKeyhole size={30}/><h1>Leaderboard not released yet</h1>
        <p>Rankings become visible after the quiz closes.</p>
        <Link href={actor.role === "STUDENT" ? "/student/quizzes" : "/instructor/results"} className="button">Back to quizzes</Link></section></AppShell>;
    throw e;
  }
  return <AppShell name={actor.name} role={actor.role} active="quizzes">
    <Link className="back-link" href={actor.role === "STUDENT" ? `/q/${slug}` : "/instructor/results"}><ArrowLeft size={16}/> Back</Link>
    <div className="page-heading"><div><span className="eyebrow">FINAL QUIZ RANKINGS</span>
      <h1>Leaderboard</h1><p>{data.quiz.title}</p></div><Trophy size={28}/></div>
    <section className="panel"><p className="muted">Top 50 participating students. Students who opt out or have suspended access are excluded. Equal scores are ordered by earlier submission.</p>
      {data.entries.length ? <div className="results-list">{data.entries.map(row =>
        <div key={row.rank} className="result-row"><strong className="rank-number">#{row.rank}</strong>
        <span><strong>{row.name}</strong><small>{row.percent}% of maximum marks</small></span>
        <strong>{row.earnedMarks}/{row.maxMarks}</strong></div>)}</div>
      : <div className="empty"><Trophy size={30}/><h2>No ranked submissions</h2><p>Students can opt out of appearing here.</p></div>}
      <p className="muted">{data.total} eligible ranked submissions</p>
    </section>
  </AppShell>;
}
