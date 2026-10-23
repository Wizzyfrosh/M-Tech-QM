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
import { pageActor } from "@/lib/access";
import { getDb } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const actor = await pageActor();
  const instructor = actor.role === "INSTRUCTOR";
  const counts = instructor
    ? await getDb().$transaction([
        getDb().rosterEntry.count(),
        getDb().rosterEntry.count({
          where: { status: "ACTIVE", user: { emailVerified: true } },
        }),
        getDb().rosterEntry.count({
          where: {
            status: "ACTIVE",
            OR: [{ userId: null }, { user: { emailVerified: false } }],
          },
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
              ? "Add your students and give them a place to learn, practise and grow."
              : "Your instructor will share a quiz link when your next assessment is ready."}
          </p>
          {instructor ? (
            <Link className="button primary" href="/instructor/students">
              Manage students
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
              label: "Students on roster",
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
              label: "Awaiting activation",
              value: counts[2],
              icon: Clock3,
              hint: "Registration or verification pending",
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
              ? "Set your community up\nfor success."
              : "Make yourself at home."}
          </h2>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>
                  {instructor ? "Add your students" : "Check your profile"}
                </strong>
                <p>
                  {instructor
                    ? "Use the email they’ll register with."
                    : "Make sure your display name is correct."}
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>
                  {instructor
                    ? "Share the app link"
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
                    ? "See who is verified from your roster."
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
