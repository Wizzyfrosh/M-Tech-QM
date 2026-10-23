"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
export function StartQuiz({ slug }: { slug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function begin() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/quizzes/${slug}/attempt`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Cannot begin this quiz.");
      router.push(payload.status === "SUBMITTED" ? `/attempts/${payload.id}/result` : `/attempts/${payload.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to begin."); setBusy(false); }
  }
  return <div className="attempt-start">
    <button type="button" className="button primary" onClick={begin} disabled={busy}>
      {busy ? <LoaderCircle size={16} className="spin"/> : <ArrowRight size={16} />}
      {busy ? "Opening your attempt…" : "Start or resume quiz"}
    </button>
    {error && <p role="alert" className="notice error">{error}</p>}
  </div>;
}
