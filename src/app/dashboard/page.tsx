import Link from "next/link";
import {
  ArrowRight,
  Users,
  UserCheck,
  Clock3,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Brand } from "@/components/brand";
import { SignOut } from "@/components/sign-out";
import { pageIdentity } from "@/lib/access";
import { getDb } from "@/lib/db";
import { ThemeToggle } from "@/components/theme-toggle";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const actor = await pageIdentity();
  const instructor = actor.role === "INSTRUCTOR";
  if (!instructor && actor.roster?.status === "PENDING") {
    return <main className="standalone" id="main">
      <div className="pending-panel">
        <div className="pending-header"><Brand /><ThemeToggle /></div>
        <span className="empty-icon"><Clock3 size={28}/></span>
        <span className="eyebrow">EMAIL VERIFIED</span>
        <h1>Waiting for instructor approval</h1>
        <p>Hello {actor.name.split(" ")[0]}, your account is verified and your request has been received.</p>
        <p>You can sign in at any time. Lessons, videos and quizzes will become available after your instructor approves your account.</p>
        <div className="button-row">
          <Link href="/account" className="button">Manage profile</Link>
          <Link href="/dashboard" className="button primary">Check approval status</Link>
          <SignOut />
        </div>
      </div>
    </main>;
  }
  const counts = instructor
    ? await getDb().$transaction([
        getDb().rosterEntry.count(),
        getDb().rosterEntry.count({
          where: { status: "ACTIVE", user: { emailVerified: true } },
        }),
        getDb().rosterEntry.count({
          where: { status: "PENDING", user: { emailVerified: true } },
        }),
      ])
    : null;
  return (
    <AppShell name={actor.name} role={actor.role}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {instructor ? "YOUR TEACHING SPACE" : "YOUR LEARNING SPACE"}
          </span>
          <h1>Welcome back, {actor.name.split(" ")[0]}.</h1>
          <p>
            {instructor
              ? "A clear view of your community, all in one place."
              : "Keep showing up. Every lesson is a step forward."}
          </p>
        </div>
        <span className="date-label">
          {new Intl.DateTimeFormat("en-NG", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Africa/Lagos",
          }).format(new Date())}
        </span>
      </div>
      <section className="welcome-banner">
        <div>
          <span className="eyebrow">
            {instructor ? "START WITH YOUR COMMUNITY" : "READY FOR WHAT’S NEXT"}
          </span>
          <h2>
            {instructor
              ? "Great learning starts\nwith the right people."
              : "Your progress starts\nwith a little practice."}
          </h2>
          <p>
            {instructor
              ? "Students register themselves. Review verified accounts and approve access."
              : "Your instructor will share a quiz link when your next assessment is ready."}
          </p>
          {instructor ? (
            <Link className="button primary" href="/instructor/students">
              Review student requests
              <ArrowRight size={17} />
            </Link>
          ) : (
            <Link className="button primary" href="/account">
              Complete your profile
              <ArrowRight size={17} />
            </Link>
          )}
        </div>
        <div className="banner-emblem" aria-hidden="true">
          <BookOpen size={66} strokeWidth={1.3} />
          <span>
            <ShieldCheck size={22} />
          </span>
        </div>
      </section>
      {counts && (
        <div className="stats-grid">
          {[
            {
              label: "Registered students",
              value: counts[0],
              icon: Users,
              hint: "Your whole community",
            },
            {
              label: "Verified & active",
              value: counts[1],
              icon: UserCheck,
              hint: "Ready to start learning",
            },
            {
              label: "Awaiting approval",
              value: counts[2],
              icon: Clock3,
              hint: "Verified students waiting for access",
            },
          ].map((item) => (
            <section className="stat-card" key={item.label}>
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.hint}</small>
              </div>
              <span className="stat-icon">
                <item.icon size={22} />
              </span>
            </section>
          ))}
        </div>
      )}
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{instructor ? "Your assessments" : "Your quizzes"}</h2>
              <p>
                {instructor
                  ? "A focused way to check understanding."
                  : "Your next opportunity to put learning into practice."}
              </p>
            </div>
            <Link
              className="text-button"
              href={instructor ? "/instructor/quizzes" : "/student/quizzes"}
            >
              View quizzes
            </Link>
          </div>
          <div className="empty">
            <span className="empty-icon">
              <BookOpen size={28} />
            </span>
            <h3>
              {instructor
                ? "A focused space for every lesson"
                : "Find your next quiz"}
            </h3>
            <p>
              {instructor
                ? "Create questions, review your answer key and publish a private quiz link."
                : "Open your quiz list to see what your instructor has shared."}
            </p>
          </div>
        </section>
        <section className="panel getting-started">
          <span className="eyebrow">GETTING STARTED</span>
          <h2>
            {instructor
              ? "Approve students\nand start teaching."
              : "Make yourself at home."}
          </h2>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>
                  {instructor ? "Review registrations" : "Check your profile"}
                </strong>
                <p>
                  {instructor
                    ? "Review verified requests and approve them."
                    : "Make sure your display name is correct."}
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>
                  {instructor
                    ? "Approve students"
                    : "Keep your account secure"}
                </strong>
                <p>
                  {instructor
                    ? "Students create and verify their own accounts."
                    : "Use a strong, unique password."}
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>
                  {instructor ? "Check their access" : "Get ready to practise"}
                </strong>
                <p>
                  {instructor
                    ? "See who has permission to access quizzes."
                    : "Watch for the next lesson from your instructor."}
                </p>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </AppShell>
  );
}
