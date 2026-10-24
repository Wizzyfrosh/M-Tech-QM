import { NotificationBell } from "./notification-bell";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  UserRound,
  ArrowUpRight,
  BookOpen,
  ClipboardList,
  ClipboardPenLine,
  BarChart3,
  Download,
} from "lucide-react";
import { Brand } from "./brand";
import { SignOut } from "./sign-out";
import { NavigationFeedback } from "./navigation-feedback";
export function AppShell({
  name,
  role,
  children,
  active = "overview",
}: {
  name: string;
  role: "INSTRUCTOR" | "STUDENT";
  children: React.ReactNode;
  active?: string;
}) {
  const links = [
    {
      href: "/dashboard",
      label: role === "INSTRUCTOR" ? "Overview" : "My learning",
      icon: LayoutDashboard,
      id: "overview",
    },
    ...(role === "INSTRUCTOR"
      ? [
          {
            href: "/instructor/students",
            label: "Students",
            icon: Users,
            id: "students",
          },
        ]
      : []),
    {
      href: role === "INSTRUCTOR" ? "/instructor/quizzes" : "/student/quizzes",
      label: "Quizzes",
      icon: BookOpen,
      id: "quizzes",
    },
    { href: role === "INSTRUCTOR" ? "/instructor/assignments" : "/student/assignments", label: "Assignments", icon: ClipboardPenLine, id: "assignments" },
    ...(role === "INSTRUCTOR" ? [{ href: "/instructor/results", label: "Results", icon: BarChart3, id: "results" }] : []),
    ...(role === "STUDENT" ? [{ href: "/student/results", label: "Results", icon: ClipboardList, id: "history" }] : []),
    { href: "/account", label: "My account", icon: UserRound, id: "account" },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <p className="nav-label">
          {role === "INSTRUCTOR" ? "INSTRUCTOR WORKSPACE" : "STUDENT WORKSPACE"}
        </p>
        <nav aria-label="Main navigation">
          {links.map((item) => (
            <Link
              key={item.id}
              className={`nav-link ${active === item.id ? "selected" : ""}`}
              href={item.href}
              aria-current={active === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              {item.label}
              <NavigationFeedback/>
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <BookOpen size={24} />
          <h3>
            Small steps.
            <br />
            Lasting progress.
          </h3>
          <p>A dedicated space for your programming journey.</p>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{name}</strong>
            <small>{role === "INSTRUCTOR" ? "Instructor" : "Student"}</small>
          </div>
          <SignOut />
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span className="mobile-signout">
            <SignOut />
          </span>
          <span className="topbar-label">Your community. Your progress.</span>
          <div className="topbar-actions">
          <NotificationBell/>
          <Link href="/install" className="button install-link"><Download size={16}/><span>Install app</span></Link>
          <span className="role-pill">
            <span className="status-dot" />
            {role === "INSTRUCTOR"
              ? "Instructor workspace"
              : "Student workspace"}
            <ArrowUpRight size={14} />
          </span>
          </div>
        </header>
        <main id="main" className="page-content">
          {children}
        </main>
        <footer className="app-footer">
          M Tech QMS <span>Built for better learning.</span>
        </footer>
      </div>
    </div>
  );
}
