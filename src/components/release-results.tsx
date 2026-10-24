"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, LockKeyhole } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
export function ReleaseResults({
  id,
  released,
}: {
  id: string;
  released: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const hydrated = useHydrated();
  async function release() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/instructor/results/${id}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledged: true, closeQuiz: true }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setMessage(
        "Results released. Email notifications are being processed for approved students who submitted this quiz.",
      );
      setConfirm(false);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to release results.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            <LockKeyhole size={18} /> Result release
          </h2>
          <p>
            {released
              ? "Students can now view their scores and full reviews."
              : "Review the scores below, then release results. Any open quiz will be closed first. Students cannot see scores or answer keys before release."}
          </p>
        </div>
      </div>
      <button
        className="button primary"
        onClick={() => setConfirm(true)}
        disabled={busy || !hydrated}
      >
        <Send size={17} />
        {busy
          ? "Processing…"
          : released
            ? "Retry failed notifications"
            : "Release results"}
      </button>
      {confirm && (
        <div className="notice">
          <p>
            {released
              ? "Retry emails rejected by the provider? Unconfirmed sends will not be retried automatically."
              : "Close quiz and release results? This stops any further student submissions and releases reviewed scores and answers. Approved students who submitted will be emailed. This cannot be undone."}
          </p>
          <div className="button-row">
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void release()}
            >
              {released ? "Confirm retry" : "Confirm result release"}
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  );
}
