"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
type Notice = {
  id: string;
  title: string;
  message: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};
export function NotificationInbox({
  instructor = false,
}: {
  instructor?: boolean;
}) {
  const [delivery, setDelivery] = useState<
    { emailStatus: string; _count: number }[]
  >([]);
  const [items, setItems] = useState<Notice[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const load = () => {
    setBusy(true);
    setRefresh((n) => n + 1);
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/notifications?page=${page}`, { signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error();
        return d;
      })
      .then((d) => {
        setDelivery(d.delivery ?? []);
        setItems(d.items);
        setTotal(d.total);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setError("Notifications could not be loaded. Please retry.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [page, refresh]);
  async function read(id?: string) {
    try {
      const r = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(id ? { id } : {}),
      });
      if (!r.ok) throw Error();
      await load();
    } catch {
      setError("Could not mark notifications as read. Please retry.");
    }
  }
  async function retry() {
    if (
      !window.confirm("Retry emails that were rejected or could not be sent?")
    )
      return;
    try {
      const r = await fetch("/api/instructor/notifications/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acknowledged: true }),
      });
      if (!r.ok) throw Error();
      await load();
    } catch {
      setError("Could not retry email notifications.");
    }
  }
  return (
    <section className="panel">
      {instructor && (
        <div>
          <h2>Email notifications</h2>
          <p>
            Accepted emails may still be delayed by the recipient’s mail
            provider.
          </p>
          {delivery.map((d) => (
            <span key={d.emailStatus} className="badge lavender">
              {d.emailStatus.toLowerCase()}: {d._count}{" "}
            </span>
          ))}
          {delivery.some((d) => d.emailStatus === "FAILED") && (
            <button className="button" onClick={() => void retry()}>
              Retry failed emails
            </button>
          )}
          {delivery.some((d) =>
            ["UNKNOWN", "SENDING"].includes(d.emailStatus),
          ) && (
            <p>
              Some deliveries are unconfirmed. Check the email provider’s
              delivery log before resending them.
            </p>
          )}
        </div>
      )}
      <div className="button-row">
        <button
          className="button"
          onClick={() => {
            setBusy(true);
            void load();
          }}
          disabled={busy}
        >
          Refresh
        </button>
        <button
          className="button"
          onClick={() => void read()}
          disabled={busy || !items.length}
        >
          Mark all as read
        </button>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {busy ? (
        <p role="status">Loading notifications…</p>
      ) : !items.length ? (
        <p>
          No notifications yet. Updates needing your attention will appear here.
        </p>
      ) : (
        items.map((n) => (
          <article
            key={n.id}
            style={{
              padding: "20px 0",
              borderBottom: "1px solid var(--border)",
              overflowWrap: "anywhere",
            }}
          >
            <h2>
              {n.title}{" "}
              {!n.readAt && <span className="badge lavender">Unread</span>}
            </h2>
            <p>{n.message}</p>
            <small>
              {new Date(n.createdAt).toLocaleString("en-NG", {
                timeZone: "Africa/Lagos",
              })}{" "}
              WAT
            </small>
            <div className="button-row">
              <Link
                className="button primary"
                href={n.href}
                onClick={() => void read(n.id)}
              >
                View details
              </Link>
              {!n.readAt && (
                <button className="button" onClick={() => void read(n.id)}>
                  Mark as read
                </button>
              )}
            </div>
          </article>
        ))
      )}
      <div className="button-row">
        <button
          className="button"
          disabled={busy || page === 1}
          onClick={() => {
            setBusy(true);
            setPage((p) => p - 1);
          }}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          className="button"
          disabled={busy || page * 20 >= total}
          onClick={() => {
            setBusy(true);
            setPage((p) => p + 1);
          }}
        >
          Next
        </button>
      </div>
    </section>
  );
}
