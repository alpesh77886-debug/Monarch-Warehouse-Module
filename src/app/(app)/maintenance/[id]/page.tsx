"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";

type MaintenanceTicket = {
  id: string;
  ticketNumber: string;
  category: string;
  location: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "REOPENED";
  resolutionNotes: string | null;
  partsUsed: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
};

type LoadState = "loading" | "ready" | "error";

const STATUS_LABEL: Record<MaintenanceTicket["status"], string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
};

export default function MaintenanceTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<MaintenanceTicket | null>(null);

  const [resolveForm, setResolveForm] = useState({ resolutionNotes: "", partsUsed: "" });
  const [reopenComments, setReopenComments] = useState("");

  const [actionState, setActionState] = useState<"idle" | "submitting">("idle");
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch(`/api/maintenance-tickets/${id}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
      setTicket(body.maintenanceTicket as MaintenanceTicket);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this maintenance ticket.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function runAction(path: string, body: unknown, successMessage?: string) {
    setActionState("submitting");
    setActionError(null);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/maintenance-tickets/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const responseBody = await res.json();
      if (!res.ok) {
        if (res.status === 503) setActionNotice(responseBody.error);
        else setActionError(responseBody.error ?? `Request failed (${res.status}).`);
        return;
      }
      if (successMessage) setActionNotice(successMessage);
      await load();
    } catch {
      setActionError("Network error - could not reach the server.");
    } finally {
      setActionState("idle");
    }
  }

  function handleResolve(event: FormEvent) {
    event.preventDefault();
    runAction("resolve", { resolutionNotes: resolveForm.resolutionNotes, partsUsed: resolveForm.partsUsed || null });
  }
  function handleReopen(event: FormEvent) {
    event.preventDefault();
    runAction("reopen", { comments: reopenComments });
  }

  if (loadState === "loading") {
    return (
      <>
        <PageHeader breadcrumb="Home / Maintenance" title="Loading..." />
        <div className="p-4 sm:p-6">
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">Loading...</div>
        </div>
      </>
    );
  }
  if (loadState === "error" || !ticket) {
    return (
      <>
        <PageHeader breadcrumb="Home / Maintenance" title="Not found" />
        <div className="p-4 sm:p-6">
          <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
            {loadError}
          </div>
        </div>
      </>
    );
  }

  const canAcknowledge = ticket.status === "OPEN";
  const canStartWork = ticket.status === "ACKNOWLEDGED" || ticket.status === "REOPENED";
  const canResolve = ticket.status === "IN_PROGRESS";
  const canCloseOrReopen = ticket.status === "RESOLVED";

  return (
    <>
      <PageHeader breadcrumb="Home / Maintenance" title={ticket.ticketNumber} />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy">Header</h2>
            <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-bold text-navy">
              {STATUS_LABEL[ticket.status]} · {ticket.severity}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Detail label="Category" value={ticket.category} />
            <Detail label="Location" value={ticket.location} />
            <Detail label="Description" value={ticket.description} />
          </dl>
          {ticket.severity === "CRITICAL" && ticket.status !== "CLOSED" ? (
            <p className="mt-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger">
              CRITICAL - escalated (product at risk). Requires immediate attention.
            </p>
          ) : null}
          {ticket.resolutionNotes ? (
            <div className="mt-3">
              <div className="text-xs font-semibold text-muted2">Resolution notes</div>
              <div className="whitespace-pre-line text-xs text-ink2">{ticket.resolutionNotes}</div>
            </div>
          ) : null}
          {ticket.partsUsed ? <Detail label="Parts used" value={ticket.partsUsed} /> : null}
        </section>

        {canResolve ? (
          <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
            <h2 className="text-sm font-bold text-navy">Resolve</h2>
            <form className="mt-3 flex flex-col gap-3" onSubmit={handleResolve}>
              <Field label="Resolution notes (required)">
                <textarea
                  className={inputClass()}
                  value={resolveForm.resolutionNotes}
                  onChange={(e) => setResolveForm({ ...resolveForm, resolutionNotes: e.target.value })}
                />
              </Field>
              <Field label="Parts used (optional)">
                <input
                  className={inputClass()}
                  value={resolveForm.partsUsed}
                  onChange={(e) => setResolveForm({ ...resolveForm, partsUsed: e.target.value })}
                />
              </Field>
              <button
                type="submit"
                disabled={actionState === "submitting"}
                className="min-h-[48px] w-full rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
              >
                Mark resolved
              </button>
            </form>
          </section>
        ) : null}

        {canCloseOrReopen ? (
          <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
            <h2 className="text-sm font-bold text-navy">Verify fix</h2>
            <form className="mt-3 flex flex-col gap-3" onSubmit={handleReopen}>
              <Field label="If not fixed - reopen comments">
                <input
                  className={inputClass()}
                  value={reopenComments}
                  onChange={(e) => setReopenComments(e.target.value)}
                />
              </Field>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={actionState === "submitting"}
                  onClick={() => runAction("close", {}, "Closed.")}
                  className="min-h-[48px] rounded-lg bg-success px-4 text-sm font-bold text-white disabled:opacity-60"
                >
                  Fixed - Close
                </button>
                <button
                  type="submit"
                  disabled={actionState === "submitting" || !reopenComments.trim()}
                  className="min-h-[48px] rounded-lg bg-danger px-4 text-sm font-bold text-white disabled:opacity-60"
                >
                  Not fixed - Reopen
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-sm font-bold text-navy">Actions</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {canAcknowledge ? (
              <button
                type="button"
                disabled={actionState === "submitting"}
                onClick={() => runAction("acknowledge", {})}
                className="min-h-[48px] rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                Acknowledge
              </button>
            ) : null}
            {canStartWork ? (
              <button
                type="button"
                disabled={actionState === "submitting"}
                onClick={() => runAction("start-work", {})}
                className="min-h-[48px] rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                Start work
              </button>
            ) : null}
            {ticket.status === "CLOSED" ? (
              <p className="text-sm font-semibold text-success">Closed - this ticket is now immutable.</p>
            ) : null}
          </div>
          {actionNotice ? (
            <p className="mt-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-warning" role="status">
              {actionNotice}
            </p>
          ) : null}
          {actionError ? (
            <p className="mt-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
              {actionError}
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted2">{label}</dt>
      <dd className="font-semibold text-navy">{value}</dd>
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
