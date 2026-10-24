"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, LockKeyhole } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
export function ReleaseResults({ id, released }: { id: string; released: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const hydrated = useHydrated();
  async function release() {
    if (!window.confirm(released ? "Retry emails rejected by the provider? Unconfirmed sends will not be retried automatically." : "Have you reviewed these results? Release scores and answer reviews to students, and email approved students who submitted? Close the quiz first.")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/instructor/results/${id}/release`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acknowledged: true }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setMessage("Results released. Email notifications are being processed for approved students who submitted this quiz.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to release results."); }
    finally { setBusy(false); }
  }
  return <section className="panel"><div className="panel-heading"><div><h2><LockKeyhole size={18}/> Result release</h2>
    <p>{released ? "Students can now view their scores and full reviews." : "Review the scores below, close the quiz, then release results. Students cannot see scores or answer keys before release."}</p></div></div>
    <button className="button primary" onClick={() => void release()} disabled={busy || !hydrated}><Send size={17}/>{busy ? "Processing…" : released ? "Retry failed notifications" : "Release results"}</button>
    {message && <p role="status" className="notice">{message}</p>}
  </section>;
}
