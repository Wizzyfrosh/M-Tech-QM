import { Brand } from "@/components/brand";
import { Check, Code2, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { Download } from "lucide-react";
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-layout">
      <aside className="auth-aside">
        <Brand />
        <div className="auth-story">
          <span className="story-tag">
            <Sparkles size={14} /> A LITTLE PRACTICE. A LOT OF PROGRESS.
          </span>
          <h2>
            Turn what you learn
            <br />
            into what you <em>know.</em>
          </h2>
          <p>
            Your lessons, your practice, your progress.
            <br />
            One focused space to keep moving forward.
          </p>
          <div className="learning-art" aria-hidden="true">
            <div className="code-card">
              <span className="code-card-title">
                <Code2 size={18} /> YOUR NEXT CHAPTER
              </span>
              <pre>
                <span>const</span> progress = {"{"}
                <br /> curiosity: <b>true</b>,<br /> practice:{" "}
                <b>&quot;every week&quot;</b>,<br /> possibilities:{" "}
                <b>Infinity</b>
                <br />
                {"}"};
              </pre>
            </div>
            <div className="progress-card">
              <span className="check-circle">
                <Check size={19} />
              </span>
              <div>
                <strong>One step closer.</strong>
                <small>Keep learning. Keep building.</small>
              </div>
            </div>
          </div>
        </div>
        <p className="aside-foot">Built for the M Tech learning community.</p>
      </aside>
      <main id="main" className="auth-main">
        <div className="auth-controls"><Link href="/install" className="button install-link"><Download size={16}/>Install app</Link><ThemeToggle /></div>
        {children}
        <p className="auth-foot">
          A private learning space. Access is managed by your instructor.
        </p>
      </main>
    </div>
  );
}
