"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, Field, KpiCard, Pill, type PillTone, StateBox, btn, inputClass } from "@/components/ui";

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
const STATUS_TONE: Record<LoadingSheetRow["status"], PillTone> = {
  DRAFT: "neutral",
  STAGING: "hold",
  LOADED: "hold",
  VERIFIED: "qc",
  GATE_PASSED: "qc",
  DISPATCHED: "ok",
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

  const openCount = sheets.filter((s) => s.status !== "DISPATCHED").length;
  const dispatchedCount = sheets.filter((s) => s.status === "DISPATCHED").length;
  const exportCount = sheets.filter((s) => s.exportDomestic === "EXPORT").length;
  const dispatchedCartons = sheets.filter((s) => s.status === "DISPATCHED").reduce((sum, s) => sum + s.totalCartons, 0);

  return (
    <>
      <PageHeader
        breadcrumb="Operations / Dispatch & Loading"
        title="Loading Sheets"
        actions={<Pill tone="ok">only OK / available stock selectable</Pill>}
      />
      <div className="flex flex-col gap-5 bg-canvas p-4 sm:p-6">
        {loadState === "ready" && sheets.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard color="#D97706" label="In progress" value={openCount} sub="draft → gate pass" />
            <KpiCard color="#059669" label="Dispatched" value={dispatchedCount} sub="immutable" />
            <KpiCard color="#2563EB" label="Cartons out" value={dispatchedCartons} sub="dispatched sheets" />
            <KpiCard color="#7C3AED" label="Export" value={exportCount} sub="QC approval needed" />
          </div>
        ) : null}

        <Card title="New loading sheet" sub="vehicle + party details · pallets are picked FIFO on the next screen">
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={handleSubmit}>
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
              <button type="submit" disabled={submitState === "submitting"} className={btn("teal", "w-full sm:w-auto")}>
                {submitState === "submitting" ? "Creating..." : "Create draft loading sheet"}
              </button>
            </div>
          </form>
        </Card>

        <section>
          <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-widest text-muted2">Existing loading sheets</h2>
          {loadState === "loading" ? (
            <StateBox>Loading...</StateBox>
          ) : loadState === "error" ? (
            <StateBox tone="danger">{loadError}</StateBox>
          ) : sheets.length === 0 ? (
            <StateBox>No loading sheets yet.</StateBox>
          ) : (
            <ul className="flex flex-col gap-3">
              {sheets.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/outward/loading-sheets/${s.id}`}
                    className="relative grid min-h-[64px] grid-cols-1 gap-2 overflow-hidden rounded-xl border border-line bg-white p-4 pl-5 shadow-card transition hover:-translate-y-0.5 hover:border-teal sm:grid-cols-[1.2fr_1.5fr_1fr_auto] sm:items-center"
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-1"
                      style={{ background: s.status === "DISPATCHED" ? "#059669" : s.exportDomestic === "EXPORT" ? "#7C3AED" : "#0D9488" }}
                    />
                    <div>
                      <div className="text-sm font-extrabold text-ink">{s.loadingSheetNumber}</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-muted2">{s.date}</div>
                    </div>
                    <div className="text-xs">
                      <div className="font-bold text-ink2">{s.partyName}</div>
                      <div className="text-muted2">
                        {s.destination} - vehicle {s.vehicleNumber}
                      </div>
                    </div>
                    <div className="text-xs text-ink2">
                      <b className="text-ink">{s.totalCartons}</b> cartons · {s.palletCount} pallet(s)
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      <Pill tone={STATUS_TONE[s.status]}>
                        {STATUS_LABEL[s.status]}
                        {s.exportDomestic === "EXPORT" ? " · Export" : ""}
                      </Pill>
                      <span className="text-muted2" aria-hidden>
                        →
                      </span>
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
