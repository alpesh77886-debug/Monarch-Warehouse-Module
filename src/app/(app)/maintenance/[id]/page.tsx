"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, Field, Pill, StateBox, btn, inputClass, statusTone } from "@/components/ui";

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
        <PageHeader title="Loading..." />
        <div className="bg-canvas p-4 sm:p-6">
          <StateBox>Loading...</StateBox>
        </div>
      </>
    );
  }
  if (loadState === "error" || !ticket) {
    return (
      <>
        <PageHeader title="Not found" />
        <div className="bg-canvas p-4 sm:p-6">
          <StateBox tone="danger">{loadError}</StateBox>
        </div>
      </>
    );
  }

  const canAcknowledge = ticket.status === "OPEN";
  const canStartWork = ticket.status === "ACKNOWLEDGED" || ticket.status === "REOPENED";
  const canResolve = ticket.status === "IN_PROGRESS";
  const canCloseOrReopen = ticket.status === "RESOLVED";
  const isCritical = ticket.severity === "CRITICAL";

  const timeline: { key: string; label: string; at: string | null; reached: boolean }[] = [
    { key: "open", label: "Raised", at: ticket.createdAt, reached: true },
    { key: "ack", label: "Ack", at: ticket.acknowledgedAt, reached: ticket.acknowledgedAt !== null },
    {
      key: "work",
      label: "Working",
      at: null,
      reached: ["IN_PROGRESS", "RESOLVED", "CLOSED"].includes(ticket.status),
    },
    { key: "fix", label: "Fix", at: ticket.resolvedAt, reached: ticket.resolvedAt !== null },
    { key: "close", label: "Verify", at: ticket.closedAt, reached: ticket.closedAt !== null },
  ];

  return (
    <>
      <PageHeader
        title={ticket.ticketNumber}
        actions={
          <Pill tone={statusTone(ticket.status)}>
            {STATUS_LABEL[ticket.status]} · {ticket.severity}
          </Pill>
        }
      />
      <div className="flex flex-col gap-5 bg-canvas p-4 sm:p-6">
        <section
          className={
            "rounded-xl border-[1.5px] p-4 shadow-card sm:p-5 " +
            (isCritical ? "border-[#FCA5A5] bg-gradient-to-br from-[#FFF5F5] to-white" : "border-line bg-white")
          }
        >
          <div className="text-[15px] font-extrabold text-navy">{ticket.description}</div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Detail label="Category" value={ticket.category} />
            <Detail label="Location" value={ticket.location} />
            <Detail label="Raised" value={formatAt(ticket.createdAt)} />
            {ticket.partsUsed ? <Detail label="Parts used" value={ticket.partsUsed} /> : null}
          </dl>
          {isCritical && ticket.status !== "CLOSED" ? (
            <p className="mt-3 rounded-lg border-l-4 border-danger bg-danger-light p-3 text-xs font-semibold text-danger">
              CRITICAL - escalated (product at risk). Requires immediate attention.
            </p>
          ) : null}

          <ol className="mt-4 flex items-start" aria-label="Ticket progress">
            {timeline.map((step, i) => {
              const nextReached = timeline[i + 1]?.reached ?? false;
              const on = step.reached && !nextReached && ticket.status !== "CLOSED";
              return (
                <li key={step.key} className="flex flex-1 flex-col items-center gap-1">
                  <span
                    className={
                      "flex h-7 w-7 items-center justify-center rounded-full border-[2.5px] text-[11px] font-extrabold " +
                      (on
                        ? "border-gold bg-[#FFEDD5] text-gold"
                        : step.reached
                          ? "border-teal bg-teal-light text-teal"
                          : "border-[#CBD5E1] bg-[#F1F5F9] text-muted2")
                    }
                  >
                    {on ? "◐" : step.reached ? "✓" : i + 1}
                  </span>
                  <span className="text-center text-[9px] font-extrabold uppercase tracking-wide text-muted2">{step.label}</span>
                  {step.at ? <span className="text-center text-[9px] text-muted2">{formatAt(step.at)}</span> : null}
                </li>
              );
            })}
          </ol>

          {ticket.resolutionNotes ? (
            <div className="mt-4 rounded-lg border border-[#A7F3D0] bg-[#F0FDF9] p-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-teal-2">Resolution notes</div>
              <div className="mt-1 whitespace-pre-line text-xs text-ink2">{ticket.resolutionNotes}</div>
            </div>
          ) : null}
        </section>

        {canResolve ? (
          <Card title="Resolve">
            <form className="flex flex-col gap-3" onSubmit={handleResolve}>
              <Field label="Resolution notes (required)">
                <textarea
                  className={inputClass() + " py-3"}
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
              <button type="submit" disabled={actionState === "submitting"} className={btn("teal", "w-full sm:w-auto")}>
                Mark resolved
              </button>
            </form>
          </Card>
        ) : null}

        {canCloseOrReopen ? (
          <Card title="Verify fix" accentColor="#059669">
            <form className="flex flex-col gap-3" onSubmit={handleReopen}>
              <Field label="If not fixed - reopen comments">
                <input className={inputClass()} value={reopenComments} onChange={(e) => setReopenComments(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={actionState === "submitting"}
                  onClick={() => runAction("close", {}, "Closed.")}
                  className={btn("teal")}
                >
                  Fixed - Close
                </button>
                <button
                  type="submit"
                  disabled={actionState === "submitting" || !reopenComments.trim()}
                  className={btn("danger")}
                >
                  Not fixed - Reopen
                </button>
              </div>
            </form>
          </Card>
        ) : null}

        {canAcknowledge || canStartWork || ticket.status === "CLOSED" || actionNotice || actionError ? (
          <Card title="Actions">
            <div className="flex flex-wrap gap-3">
              {canAcknowledge ? (
                <button
                  type="button"
                  disabled={actionState === "submitting"}
                  onClick={() => runAction("acknowledge", {})}
                  className={btn("gold")}
                >
                  Acknowledge
                </button>
              ) : null}
              {canStartWork ? (
                <button
                  type="button"
                  disabled={actionState === "submitting"}
                  onClick={() => runAction("start-work", {})}
                  className={btn("teal")}
                >
                  Start work
                </button>
              ) : null}
              {ticket.status === "CLOSED" ? (
                <p className="w-full rounded-lg bg-success-light p-3 text-sm font-semibold text-success">
                  Closed - this ticket is now immutable.
                </p>
              ) : null}
            </div>
            {actionNotice ? (
              <p className="mt-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-[#B45309]" role="status">
                {actionNotice}
              </p>
            ) : null}
            {actionError ? (
              <p className="mt-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                {actionError}
              </p>
            ) : null}
          </Card>
        ) : null}
      </div>
    </>
  );
}

function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-muted2">{label}</dt>
      <dd className="font-bold text-ink">{value}</dd>
    </div>
  );
}
