"use client";

import { useEffect, useRef, useState } from "react";

type Notification = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
  readAt: string | null;
};

type LoadState = "loading" | "ready" | "permission-denied" | "error";

/**
 * Loop 50 / PEN-038 (Alpesh: "Application Notification chahiye...
 * Pop-up and Notification dono aane chahiye"). Persistent bell + list
 * (the "Notification" half) plus a transient toast on a genuinely new
 * arrival (the "Pop-up" half) - both required explicitly, not just one.
 * Polls every 30s, the same cadence this project's own Dashboard already
 * established (PEN-046) rather than inventing a different one, since no
 * WebSocket/SSE infra exists anywhere in this app. In Clerk stub mode
 * (no real session) this honestly shows nothing rather than fabricating
 * an inbox - notifications are inherently per-user data, the same
 * reasoning the API route's own gate documents.
 */
export function NotificationBell() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Notification | null>(null);
  const seenIds = useRef<Set<string> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  async function poll() {
    try {
      const res = await fetch("/api/notifications");
      if (res.status === 401 || res.status === 403 || res.status === 503) {
        setLoadState("permission-denied");
        return;
      }
      if (!res.ok) {
        setLoadState("error");
        return;
      }
      const body = await res.json();
      const rows = body.notifications as Notification[];

      if (seenIds.current) {
        const freshest = rows.find((r) => !seenIds.current!.has(r.id));
        if (freshest) {
          setToast(freshest);
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToast(null), 6000);
        }
      }
      seenIds.current = new Set(rows.map((r) => r.id));

      setItems(rows);
      setUnreadCount(body.unreadCount as number);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    } catch {
      // Best-effort - the next 30s poll reconciles the real state either way.
    }
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch {
      // Best-effort - the next 30s poll reconciles the real state either way.
    }
  }

  if (loadState === "permission-denied" || loadState === "loading") {
    // Honest nothing, not a fabricated bell with a fake 0 badge - stub
    // mode genuinely has no session to know whose inbox this is.
    return null;
  }

  return (
    <div ref={panelRef} className="fixed right-3 top-3 z-50 sm:right-5 sm:top-4">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white text-navy shadow-card ring-1 ring-line"
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 max-h-[70vh] w-[calc(100vw-24px)] max-w-sm overflow-y-auto rounded-xl border border-line bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-bold text-navy">Notifications</span>
            {unreadCount > 0 ? (
              <button type="button" onClick={markAllRead} className="text-xs font-semibold text-teal">
                Mark all read
              </button>
            ) : null}
          </div>
          {loadState === "error" ? (
            <div className="p-4 text-xs text-danger">Could not load notifications.</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-xs text-muted">No notifications yet.</div>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    className={
                      "block w-full px-4 py-3 text-left text-xs " + (n.readAt ? "bg-white" : "bg-teal-light/40")
                    }
                  >
                    <div className="flex items-center gap-2">
                      {!n.readAt ? <span className="h-2 w-2 shrink-0 rounded-full bg-teal" /> : null}
                      <span className="font-bold text-navy">{n.title}</span>
                    </div>
                    <div className="mt-1 text-ink2">{n.body}</div>
                    <div className="mt-1 text-muted2">{new Date(n.createdAt).toLocaleString()}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="absolute right-0 top-14 w-[calc(100vw-24px)] max-w-sm rounded-xl border border-line bg-navy p-4 text-white shadow-card"
        >
          <div className="text-xs font-bold">{toast.title}</div>
          <div className="mt-1 text-xs text-white/80">{toast.body}</div>
        </div>
      ) : null}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
