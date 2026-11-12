"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
  actorName: string;
};

type NotificationPayload = {
  notifications: NotificationItem[];
  unreadCount: number;
};

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
}

export default function NotificationCenter() {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busyId, setBusyId] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (response.status === 401) {
        setAvailable(false);
        return;
      }
      if (!response.ok) return;
      const payload = await response.json() as NotificationPayload;
      setItems(payload.notifications ?? []);
      setUnreadCount(payload.unreadCount ?? 0);
      setAvailable(true);
    } catch {
      // Keep the last successful notification state when the network is temporarily unavailable.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 30000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  async function markRead(item: NotificationItem) {
    if (item.readAt || busyId) return;
    setBusyId(item.id);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", notificationId: item.id })
      });
      if (response.ok) {
        const now = new Date().toISOString();
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: now } : entry));
        setUnreadCount((current) => Math.max(0, current - 1));
      }
    } catch {
      // The next refresh will reconcile the read state.
    } finally {
      setBusyId("");
    }
  }

  async function markAllRead() {
    if (!unreadCount || busyId) return;
    setBusyId("all");
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read_all" })
      });
      if (response.ok) {
        const now = new Date().toISOString();
        setItems((current) => current.map((entry) => ({ ...entry, readAt: entry.readAt ?? now })));
        setUnreadCount(0);
      }
    } catch {
      // The next refresh will reconcile the read state.
    } finally {
      setBusyId("");
    }
  }

  if (!available) return null;

  return (
    <div className="notification-center" dir="rtl">
      <button
        type="button"
        className="notification-trigger"
        aria-label="اعلان‌ها"
        aria-expanded={open}
        onClick={() => { setOpen((current) => !current); void refresh(); }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "۹۹+" : unreadCount.toLocaleString("fa-IR")}</span>}
      </button>

      {open && (
        <section className="notification-popover" aria-label="فهرست اعلان‌ها">
          <header>
            <div><strong>اعلان‌ها</strong><small>{unreadCount.toLocaleString("fa-IR")} خوانده‌نشده</small></div>
            <button type="button" onClick={() => void markAllRead()} disabled={!unreadCount || busyId !== ""}>
              خواندن همه
            </button>
          </header>
          <div className="notification-list">
            {items.length === 0 ? (
              <div className="notification-empty">هنوز اعلانی دریافت نکرده‌اید.</div>
            ) : items.map((item) => {
              const href = item.href.startsWith("/") && !item.href.startsWith("//") ? item.href : "/dashboard";
              return (
                <Link
                  key={item.id}
                  href={href}
                  className={"notification-item" + (item.readAt ? " is-read" : " is-unread")}
                  onClick={() => { void markRead(item); setOpen(false); }}
                >
                  <span className="notification-item-dot" />
                  <span className="notification-item-content">
                    <strong>{item.title}</strong>
                    {item.body && <span>{item.body}</span>}
                    <small>{item.actorName} · {timeLabel(item.createdAt)}</small>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
