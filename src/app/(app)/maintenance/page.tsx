"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

type MaintenanceTicketRow = {
  id: string;
  ticketNumber: string;
  category: "DOOR" | "FORKLIFT" | "RACKING" | "ELECTRICAL" | "REFRIGERATION" | "PPE" | "OTHER";
  location: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "REOPENED";
  createdAt: string;
};

type LoadState = "loading" | "ready" | "error";

const EMPTY_FORM = {
  category: "DOOR" as MaintenanceTicketRow["category"],
  location: "",
  description: "",
  severity: "MEDIUM" as MaintenanceTicketRow["severity"],
};

const SEVERITY_STYLE: Record<MaintenanceTicketRow["severity"], string> = {
  LOW: "bg-line text-muted",
  MEDIUM: "bg-warning-light text-warning",
  HIGH: "bg-accent-light text-accent",
  CRITICAL: "bg-danger-light text-danger",
};
const STATUS_LABEL: Record<MaintenanceTicketRow["status"], string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
};
const STATUS_STYLE: Record<MaintenanceTicketRow["status"], string> = {
  OPEN: "bg-danger-light text-danger",
  ACKNOWLEDGED: "bg-warning-light text-warning",
  IN_PROGRESS: "bg-sky-light text-sky",
  RESOLVED: "bg-accent-light text-accent",
  CLOSED: "bg-success-light text-success",
  REOPENED: "bg-danger-light text-danger",
};

function ageDays(createdAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000)));
}

export default function MaintenancePage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<MaintenanceTicketRow[]>([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);

  async function loadAll() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/maintenance-tickets");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Could not load maintenance tickets.");
      setTickets(body.maintenanceTickets as MaintenanceTicketRow[]);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load maintenance tickets.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const openTickets = useMemo(() => tickets.filter((t) => t.status !== "CLOSED"), [tickets]);
  const criticalOpenCount = openTickets.filter((t) => t.severity === "CRITICAL").length;
  const bySeverity = useMemo(() => {
    const counts: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const t of openTickets) counts[t.severity] += 1;
    return counts;
  }, [openTickets]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitNotice(null);
    if (!form.location.trim() || !form.description.trim()) {
      setSubmitError("Location and description are required.");
      return;
    }
    setSubmitState("submitting");
    try {
      const res = await fetch("/api/maintenance-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 503) setSubmitNotice(body.error);
        else setSubmitError(body.error ?? `Request failed (${res.status}).`);
        return;
      }
      setForm(EMPTY_FORM);
      await loadAll();
    } catch {
      setSubmitError("Network error - could not reach the server.");
    } finally {
      setSubmitState("idle");
    }
  }

  return (
    <>
      <PageHeader breadcrumb="Home / Maintenance" title="Maintenance" />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Open issues" value={openTickets.length} />
          <StatTile label="Critical (open)" value={criticalOpenCount} tone="danger" />
          <StatTile label="High" value={bySeverity.HIGH} tone="warning" />
          <StatTile label="Medium" value={bySeverity.MEDIUM} />
        </section>

        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-sm font-bold text-navy">Raise an issue</h2>
          <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <Field label="Category">
              <select
                className={inputClass()}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as typeof form.category })}
              >
                <option value="DOOR">Door / door belt</option>
                <option value="FORKLIFT">Forklift / pallet truck</option>
                <option value="RACKING">Racking damage</option>
                <option value="ELECTRICAL">Electrical</option>
                <option value="REFRIGERATION">Refrigeration</option>
                <option value="PPE">PPE / infrastructure</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Severity">
              <select
                className={inputClass()}
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value as typeof form.severity })}
              >
                <option value="LOW">Low - can wait</option>
                <option value="MEDIUM">Medium - workaround possible</option>
                <option value="HIGH">High - stops work</option>
                <option value="CRITICAL">Critical - product at risk</option>
              </select>
            </Field>
            <Field label="Location (CR/block/area)">
              <input className={inputClass()} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
            <Field label="Description">
              <input
                className={inputClass()}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>

            <div className="sm:col-span-2">
              {submitNotice ? (
                <p className="mb-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-warning" role="status">
                  {submitNotice}
                </p>
              ) : null}
              {submitError ? (
                <p className="mb-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                  {submitError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={submitState === "submitting"}
                className="min-h-[48px] w-full rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
              >
                {submitState === "submitting" ? "Raising..." : "Raise issue"}
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold text-navy">Open issues by age, severity, category</h2>
          {loadState === "loading" ? (
            <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">Loading...</div>
          ) : loadState === "error" ? (
            <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
              {loadError}
            </div>
          ) : openTickets.length === 0 ? (
            <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
              No open maintenance issues.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {openTickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/maintenance/${t.id}`}
                    className="flex min-h-[64px] flex-col justify-center rounded-xl border border-line bg-white p-4 shadow-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-navy">{t.ticketNumber}</span>
                      <div className="flex gap-2">
                        <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + SEVERITY_STYLE[t.severity]}>
                          {t.severity}
                        </span>
                        <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + STATUS_STYLE[t.status]}>
                          {STATUS_LABEL[t.status]}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {t.category} - {t.location} - {t.description}
                    </div>
                    <div className="mt-1 text-xs text-muted">{ageDays(t.createdAt)}d old</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warning" }) {
  const color = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-navy";
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="text-xs text-muted">{label}</div>
      <div className={"mt-1 text-2xl font-extrabold " + color}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-ink2">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function inputClass() {
  return "min-h-[48px] w-full rounded-lg border border-line bg-white px-3 text-sm text-ink2 outline-none focus:border-teal";
}
