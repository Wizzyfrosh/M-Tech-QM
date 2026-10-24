"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let active = true;
    const update = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (active && data) setUnread(data.unread);
        })
        .catch(() => {});
    };
    update();
    const timer = setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  return (
    <Link
      href="/notifications"
      className="button"
      aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
    >
      <Bell size={18} />
      {unread > 0 && (
        <span className="badge lavender">{unread > 99 ? "99+" : unread}</span>
      )}
    </Link>
  );
}
