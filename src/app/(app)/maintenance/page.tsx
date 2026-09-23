"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, Field, KpiCard, Pill, type PillTone, StateBox, btn, inputClass } from "@/components/ui";

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

const SEVERITY_TONE: Record<MaintenanceTicketRow["severity"], PillTone> = {
  LOW: "neutral",
  MEDIUM: "qc",
  HIGH: "hold",
  CRITICAL: "rejected",
};
const STATUS_LABEL: Record<MaintenanceTicketRow["status"], string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
};
const STATUS_TONE: Record<MaintenanceTicketRow["status"], PillTone> = {
  OPEN: "rejected",
  ACKNOWLEDGED: "qc",
  IN_PROGRESS: "hold",
  RESOLVED: "ok",
  CLOSED: "ok",
  REOPENED: "rejected",
};
const PROGRESS_ORDER: MaintenanceTicketRow["status"][] = ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CLOSED"];

function sinceRaised(createdAt: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  const days = Math.floor(mins / 1440);
  if (days > 0) return `${days}d ${Math.floor((mins % 1440) / 60)}h`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

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

  const featured = openTickets
    .filter((t) => t.severity === "CRITICAL" && t.status !== "RESOLVED")
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt))[0];

  return (
    <>
      <PageHeader title="Warehouse Maintenance Tickets" />
      <div className="flex flex-col gap-5 bg-canvas p-4 sm:p-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard color="#475569" label="Open issues" value={openTickets.length} sub="not closed" />
          <KpiCard
            color="#DC2626"
            label="Critical (open)"
            value={criticalOpenCount}
            sub="product at risk"
            subTone={criticalOpenCount > 0 ? "danger" : "muted"}
          />
          <KpiCard color="#D97706" label="High" value={bySeverity.HIGH} sub="stops work" />
          <KpiCard color="#0284C7" label="Medium" value={bySeverity.MEDIUM} sub="workaround possible" />
        </section>

        {featured ? (
          <section className="rounded-xl border-[1.5px] border-[#FCA5A5] bg-gradient-to-br from-[#FFF5F5] to-white p-4 shadow-card sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Pill tone="rejected">🔴 Critical · {featured.ticketNumber}</Pill>
                <div className="mt-2 text-[15px] font-extrabold text-navy">{featured.description}</div>
                <div className="mt-1 text-[11px] text-muted2">
                  {featured.category} · {featured.location}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-extrabold text-danger">{sinceRaised(featured.createdAt)}</div>
                <div className="text-[11px] text-muted2">since raised</div>
              </div>
            </div>
            <ol className="mt-4 flex items-start">
              {PROGRESS_ORDER.map((st, i) => {
                const current = PROGRESS_ORDER.indexOf(featured.status === "REOPENED" ? "ACKNOWLEDGED" : featured.status);
                const done = i < current;
                const on = i === current;
                return (
                  <li key={st} className="flex flex-1 items-start">
                    <div className="flex w-full flex-col items-center gap-1">
                      <span
                        className={
                          "flex h-7 w-7 items-center justify-center rounded-full border-[2.5px] text-[11px] font-extrabold " +
                          (done
                            ? "border-danger bg-danger-light text-danger"
                            : on
                              ? "border-gold bg-[#FFEDD5] text-gold"
                              : "border-[#CBD5E1] bg-[#F1F5F9] text-muted2")
                        }
                      >
                        {done ? "✓" : on ? "◐" : i + 1}
                      </span>
                      <span className="text-center text-[9px] font-extrabold uppercase tracking-wide text-muted2">
                        {st === "ACKNOWLEDGED" ? "Ack" : st === "IN_PROGRESS" ? "Working" : st === "RESOLVED" ? "Fix" : st === "OPEN" ? "Raised" : "Verify"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 text-right">
              <Link
                href={`/maintenance/${featured.id}`}
                className="inline-flex min-h-[44px] items-center text-xs font-bold text-teal hover:underline"
              >
                Open ticket →
              </Link>
            </div>
          </section>
        ) : null}

        <Card title="Raise an issue" sub="anyone can raise · critical escalates immediately">
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={handleSubmit}>
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

            <div className="sm:col-span-2 lg:col-span-4">
              {submitNotice ? (
                <p className="mb-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-[#B45309]" role="status">
                  {submitNotice}
                </p>
              ) : null}
              {submitError ? (
                <p className="mb-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                  {submitError}
                </p>
              ) : null}
              <button type="submit" disabled={submitState === "submitting"} className={btn("danger", "w-full sm:w-auto")}>
                {submitState === "submitting" ? "Raising..." : "Raise issue"}
              </button>
            </div>
          </form>
        </Card>

        <section>
          <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-widest text-muted2">
            Open issues by age, severity, category
          </h2>
          {loadState === "loading" ? (
            <StateBox>Loading...</StateBox>
          ) : loadState === "error" ? (
            <StateBox tone="danger">{loadError}</StateBox>
          ) : openTickets.length === 0 ? (
            <StateBox>No open maintenance issues.</StateBox>
          ) : (
            <ul className="flex flex-col gap-3">
              {openTickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/maintenance/${t.id}`}
                    className={
                      "grid min-h-[64px] grid-cols-1 gap-2 rounded-xl border bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-teal sm:grid-cols-[1fr_2fr_auto_auto] sm:items-center " +
                      (t.severity === "CRITICAL" ? "border-[#FCA5A5]" : "border-line")
                    }
                  >
                    <div>
                      <div className="text-sm font-extrabold text-ink">{t.ticketNumber}</div>
                      <div className="text-[11px] text-muted2">{ageDays(t.createdAt)}d old</div>
                    </div>
                    <div className="text-xs">
                      <div className="font-bold text-ink2">
                        {t.category} · {t.location}
                      </div>
                      <div className="text-muted2">{t.description}</div>
                    </div>
                    <div>
                      <Pill tone={SEVERITY_TONE[t.severity]}>{t.severity}</Pill>
                    </div>
                    <div className="sm:text-right">
                      <Pill tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Pill>
                    </div>
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
