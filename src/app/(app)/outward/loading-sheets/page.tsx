"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

type LoadingSheetRow = {
  id: string;
  loadingSheetNumber: string;
  date: string;
  vehicleNumber: string;
  partyName: string;
  destination: string;
  exportDomestic: "EXPORT" | "DOMESTIC";
  status: "DRAFT" | "STAGING" | "LOADED" | "VERIFIED" | "GATE_PASSED" | "DISPATCHED";
  palletCount: number;
  totalCartons: number;
};

type LoadState = "loading" | "ready" | "error";

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  vehicleNumber: "",
  driverName: "",
  transporter: "",
  partyName: "",
  destination: "",
  exportDomestic: "DOMESTIC" as "EXPORT" | "DOMESTIC",
  temperatureC: "-18",
};

const STATUS_LABEL: Record<LoadingSheetRow["status"], string> = {
  DRAFT: "Draft",
  STAGING: "Staging",
  LOADED: "Loaded",
  VERIFIED: "Verified",
  GATE_PASSED: "Gate passed",
  DISPATCHED: "Dispatched",
};
const STATUS_STYLE: Record<LoadingSheetRow["status"], string> = {
  DRAFT: "bg-line text-muted",
  STAGING: "bg-warning-light text-warning",
  LOADED: "bg-warning-light text-warning",
  VERIFIED: "bg-sky-light text-sky",
  GATE_PASSED: "bg-sky-light text-sky",
  DISPATCHED: "bg-success-light text-success",
};

export default function LoadingSheetsPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<LoadingSheetRow[]>([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);

  async function loadAll() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/loading-sheets");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Could not load loading sheets.");
      setSheets(body.loadingSheets as LoadingSheetRow[]);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load loading sheets.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitNotice(null);

    const errors: Record<string, string> = {};
    if (!form.vehicleNumber.trim()) errors.vehicleNumber = "Vehicle number is required.";
    if (!form.driverName.trim()) errors.driverName = "Driver name is required.";
    if (!form.partyName.trim()) errors.partyName = "Party name is required.";
    if (!form.destination.trim()) errors.destination = "Destination is required.";
    const temperatureC = Number(form.temperatureC);
    if (!Number.isFinite(temperatureC)) errors.temperatureC = "Temperature must be a number.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitState("submitting");
    try {
      const res = await fetch("/api/loading-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          vehicleNumber: form.vehicleNumber.trim(),
          driverName: form.driverName.trim(),
          transporter: form.transporter.trim() || null,
          partyName: form.partyName.trim(),
          destination: form.destination.trim(),
          exportDomestic: form.exportDomestic,
          temperatureC,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          setSubmitNotice(body.error);
        } else {
          setSubmitError(body.error ?? `Request failed (${res.status}).`);
        }
        return;
      }
      setForm({ ...EMPTY_FORM, date: form.date });
      await loadAll();
    } catch {
      setSubmitError("Network error - could not reach the server.");
    } finally {
      setSubmitState("idle");
    }
  }

  return (
    <>
      <PageHeader breadcrumb="Home / Outward / Loading Sheets" title="Loading Sheets" />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-sm font-bold text-navy">New loading sheet</h2>
          <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <Field label="Date">
              <input
                type="date"
                className={inputClass()}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label="Export / Domestic">
              <select
                className={inputClass()}
                value={form.exportDomestic}
                onChange={(e) => setForm({ ...form, exportDomestic: e.target.value as typeof form.exportDomestic })}
              >
                <option value="DOMESTIC">Domestic</option>
                <option value="EXPORT">Export</option>
              </select>
            </Field>
            <Field label="Vehicle number" error={fieldErrors.vehicleNumber}>
              <input
                className={inputClass(fieldErrors.vehicleNumber)}
                value={form.vehicleNumber}
                onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })}
              />
            </Field>
            <Field label="Driver name" error={fieldErrors.driverName}>
              <input
                className={inputClass(fieldErrors.driverName)}
                value={form.driverName}
                onChange={(e) => setForm({ ...form, driverName: e.target.value })}
              />
            </Field>
            <Field label="Transporter (optional)">
              <input
                className={inputClass()}
                value={form.transporter}
                onChange={(e) => setForm({ ...form, transporter: e.target.value })}
              />
            </Field>
            <Field label="Party name" error={fieldErrors.partyName}>
              <input
                className={inputClass(fieldErrors.partyName)}
                value={form.partyName}
                onChange={(e) => setForm({ ...form, partyName: e.target.value })}
              />
            </Field>
            <Field label="Destination" error={fieldErrors.destination}>
              <input
                className={inputClass(fieldErrors.destination)}
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
              />
            </Field>
            <Field label="Temperature at loading (C)" error={fieldErrors.temperatureC}>
              <input
                type="number"
                inputMode="decimal"
                className={inputClass(fieldErrors.temperatureC)}
                value={form.temperatureC}
                onChange={(e) => setForm({ ...form, temperatureC: e.target.value })}
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
                {submitState === "submitting" ? "Creating..." : "Create draft loading sheet"}
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold text-navy">Existing loading sheets</h2>
          {loadState === "loading" ? (
            <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
              Loading...
            </div>
          ) : loadState === "error" ? (
            <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
              {loadError}
            </div>
          ) : sheets.length === 0 ? (
            <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
              No loading sheets yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {sheets.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/outward/loading-sheets/${s.id}`}
                    className="flex min-h-[64px] flex-col justify-center rounded-xl border border-line bg-white p-4 shadow-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-navy">{s.loadingSheetNumber}</span>
                      <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + STATUS_STYLE[s.status]}>
                        {STATUS_LABEL[s.status]}
                        {s.exportDomestic === "EXPORT" ? " · Export" : ""}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {s.partyName} - {s.destination} - vehicle {s.vehicleNumber}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {s.date} - {s.palletCount} pallet(s), {s.totalCartons} cartons
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

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold text-ink2">
      {label}
      <div className="mt-1">{children}</div>
      {error ? <span className="mt-1 block text-xs font-semibold text-danger">{error}</span> : null}
    </label>
  );
}

function inputClass(error?: string) {
  return (
    "min-h-[48px] w-full rounded-lg border bg-white px-3 text-sm text-ink2 outline-none focus:border-teal " +
    (error ? "border-danger" : "border-line")
  );
}
