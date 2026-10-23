"use client";
import { useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { authClient } from "@/lib/auth-client";
export function AccountForm({
  name: initialName,
  email,
  optOut,
}: {
  name: string;
  email: string;
  optOut: boolean;
}) {
  const hydrated = useHydrated();
  const [name, setName] = useState(initialName);
  const [leaderboardOptOut, setOptOut] = useState(optOut);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const r = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, leaderboardOptOut }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setMessage("Profile saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setBusy(false);
    }
  }
  async function password(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const r = await authClient.changePassword({
        currentPassword: String(data.get("current")),
        newPassword: String(data.get("new")),
        revokeOtherSessions: true,
      });
      if (r.error)
        throw new Error("Check your current password and try again.");
      form.reset();
      setMessage("Password changed. Other sessions have been signed out.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change password.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-grid">
      <section className="panel">
        <h2>Profile details</h2>
        <p className="muted">Choose how your name appears in the community.</p>
        <form className="form-stack" onSubmit={save}>
          <label>
            Display name
            <input
              disabled={!hydrated}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={80}
            />
          </label>
          <label>
            Email address
            <input value={email} readOnly />
            <small>
              Your instructor uses this email to manage your access.
            </small>
          </label>
          <label className="checkbox-label">
            <input
              disabled={!hydrated}
              type="checkbox"
              checked={leaderboardOptOut}
              onChange={(e) => setOptOut(e.target.checked)}
            />
            <span>
              Keep my name off quiz leaderboards
              <small>
                Your scores will still be visible to you and your instructor.
              </small>
            </span>
          </label>
          <button className="button primary" disabled={busy || !hydrated}>
            Save profile
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Password & security</h2>
        <p className="muted">
          Use a unique password with at least 8 characters. Longer passwords are recommended.
        </p>
        <form className="form-stack" onSubmit={password}>
          <label>
            Current password
            <input
              disabled={!hydrated}
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            New password
            <input
              disabled={!hydrated}
              name="new"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <button className="button" disabled={busy || !hydrated}>
            Change password
          </button>
        </form>
      </section>
      <div aria-live="polite">
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {message && <p className="notice success">{message}</p>}
      </div>
    </div>
  );
}
