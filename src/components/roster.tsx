"use client";
import { useEffect, useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { Search, UserPlus, Users, LoaderCircle, Copy } from "lucide-react";
type Entry = {
  id: string;
  name: string;
  normalizedEmail: string;
  status: "ACTIVE" | "SUSPENDED";
  revision: number;
  createdAt: string;
  user: { emailVerified: boolean } | null;
};
export function Roster() {
  const hydrated = useHydrated();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<Entry | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/instructor/students?page=${page}&q=${encodeURIComponent(search)}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setEntries(data.entries);
        setTotal(data.total);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setError(e.message || "Could not load the roster.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, search, version]);
  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/instructor/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      form.reset();
      setNotice(
        "Student added. Use Copy signup link to share their prefilled registration form.",
      );
      setPage(1);
      setSearch("");
      setQuery("");
      setLoading(true);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add student.");
    } finally {
      setBusy(false);
    }
  }
  async function copyRegistrationLink(entry: Entry) {
    try {
      const url = new URL("/sign-up", window.location.origin);
      url.searchParams.set("email", entry.normalizedEmail);
      await navigator.clipboard.writeText(url.href);
      setNotice("Student registration link copied. Share it privately with the student.");
    } catch {
      setError("Unable to copy. Open /sign-up and share the website address instead.");
    }
  }
  async function change(entry: Entry) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(`/api/instructor/students/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: entry.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
          revision: entry.revision,
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setTarget(null);
      setNotice(
        entry.status === "ACTIVE"
          ? "Access suspended. Existing sessions have been revoked."
          : "Student access restored.",
      );
      setLoading(true);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update access.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="roster-layout">
      <section className="panel roster-panel">
        <div className="panel-heading">
          <div>
            <h2>
              Student roster <span className="count-pill">{total}</span>
            </h2>
            <p>Manage who can access your learning space.</p>
          </div>
        </div>
        <form
          className="searchbar"
          onSubmit={(e) => {
            e.preventDefault();
            setLoading(true);
            setPage(1);
            setSearch(query);
            setVersion((v) => v + 1);
          }}
        >
          <Search size={18} />
          <input
            disabled={!hydrated}
            aria-label="Search students"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email"
            maxLength={80}
          />
          <button className="button small" type="submit" disabled={!hydrated}>
            Search
          </button>
        </form>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice success">
            {notice}
          </p>
        )}
        {target && (
          <section
            className="confirmation"
            role="region"
            aria-label="Confirm student access change"
          >
            <strong>Remove app access for {target.name}?</strong>
            <p>
              They will be signed out and unable to access the workspace. Their
              records will be kept.
            </p>
            <div className="button-row">
              <button
                className="button danger"
                disabled={busy || !hydrated}
                onClick={() => change(target)}
              >
                Remove access
              </button>
              <button
                className="button"
                disabled={busy || !hydrated}
                onClick={() => setTarget(null)}
              >
                Cancel
              </button>
            </div>
          </section>
        )}
        {loading ? (
          <div className="empty compact" role="status">
            <LoaderCircle className="spin" />
            Loading students…
          </div>
        ) : entries.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Account</th>
                    <th>Access</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <div className="student-cell">
                          <span className="avatar lavender">
                            {entry.name.slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <strong>{entry.name}</strong>
                            <small>{entry.normalizedEmail}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="subtle">
                          {entry.user?.emailVerified
                            ? "Verified"
                            : entry.user
                              ? "Unverified"
                              : "Not registered"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${entry.status === "ACTIVE" ? "green" : "amber"}`}
                        >
                          {entry.status === "ACTIVE" ? "Active" : "Suspended"}
                        </span>
                      </td>
                      <td>
                        {entry.status === "ACTIVE" && <button type="button" className="text-button"
                          disabled={busy || !hydrated} onClick={() => copyRegistrationLink(entry)}>
                          <Copy size={14}/> Copy signup link
                        </button>}
                        <button
                          className="text-button"
                          disabled={busy || !hydrated}
                          onClick={() =>
                            entry.status === "ACTIVE"
                              ? setTarget(entry)
                              : change(entry)
                          }
                        >
                          {entry.status === "ACTIVE" ? "Remove access" : "Restore access"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Page {page} of {Math.max(1, Math.ceil(total / 20))}
              </span>
              <div className="button-row">
                <button
                  className="button small"
                  disabled={page <= 1}
                  onClick={() => {
                    setLoading(true);
                    setPage((p) => p - 1);
                  }}
                >
                  Previous
                </button>
                <button
                  className="button small"
                  disabled={page * 20 >= total}
                  onClick={() => {
                    setLoading(true);
                    setPage((p) => p + 1);
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty">
            <span className="empty-icon">
              <Users size={28} />
            </span>
            <h3>
              {search ? "No matching students" : "Your community starts here"}
            </h3>
            <p>
              {search
                ? "Try another name or email address."
                : "Add your first student using the form. They can then register with that email."}
            </p>
          </div>
        )}
      </section>
      <aside className="panel add-panel">
        <span className="empty-icon small-icon">
          <UserPlus size={23} />
        </span>
        <h2>Add a student</h2>
        <p className="muted">Give a student access to your community.</p>
        <form className="form-stack" onSubmit={add}>
          <label>
            Full name
            <input
              disabled={!hydrated}
              name="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="Student’s name"
            />
          </label>
          <label>
            Email address
            <input
              disabled={!hydrated}
              name="email"
              type="email"
              required
              maxLength={254}
              placeholder="student@example.com"
            />
          </label>
          <button className="button primary full" disabled={busy || !hydrated}>
            <UserPlus size={17} />
            {busy ? "Saving…" : "Add student"}
          </button>
        </form>
        <p className="help-note">
          Adding a student enables registration. Share the app link with them;
          students receive a verification code automatically when they create their account.
        </p>
      </aside>
    </div>
  );
}
