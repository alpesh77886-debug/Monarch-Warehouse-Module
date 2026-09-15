"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

type MaterialOption = { id: string; code: string; description: string };

type ReceivingSheetRow = {
  id: string;
  sheetNumber: string;
  date: string;
  shift: "A" | "B" | "C";
  line: "FF" | "SPECIALITY";
  materialCode: string;
  materialDescription: string;
  batchNumber: string;
  totalQty: number;
  totalBoxes: number;
  status: "DRAFT" | "PENDING_PACKING" | "PENDING_WAREHOUSE" | "LOCKED" | "CANCELLED";
  defaultPalletStatus: "QC_HOLD" | "BULK";
  bulkReason: string | null;
  originalBulkPalletId: string | null;
};

type LoadState = "loading" | "ready" | "error";

const BULK_REASONS = ["Over-production (bulk)", "Defective fries (bulk)"] as const;

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  shift: "A" as "A" | "B" | "C",
  line: "FF" as "FF" | "SPECIALITY",
  materialCode: "",
  batchNumber: "",
  defaultPalletStatus: "QC_HOLD" as "QC_HOLD" | "BULK",
  bulkReason: BULK_REASONS[0] as (typeof BULK_REASONS)[number],
};

const STATUS_LABEL: Record<ReceivingSheetRow["status"], string> = {
  DRAFT: "Draft",
  PENDING_PACKING: "Awaiting packing confirm",
  PENDING_WAREHOUSE: "Awaiting warehouse confirm",
  LOCKED: "Locked",
  CANCELLED: "Cancelled",
};

export default function ReceivingSheetsPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<ReceivingSheetRow[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);

  async function loadAll() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const [sheetsRes, materialsRes] = await Promise.all([
        fetch("/api/receiving-sheets"),
        fetch("/api/masters/materials"),
      ]);
      const sheetsBody = await sheetsRes.json();
      const materialsBody = await materialsRes.json();
      if (!sheetsRes.ok) throw new Error(sheetsBody?.error ?? "Could not load receiving sheets.");
      setSheets(sheetsBody.receivingSheets as ReceivingSheetRow[]);
      if (materialsRes.ok) {
        setMaterials(
          (materialsBody.materials as { id: string; code: string; description: string }[]).map((m) => ({
            id: m.id,
            code: m.code,
            description: m.description,
          }))
        );
      }
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load receiving sheets.");
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
    const material = materials.find((m) => m.code.toUpperCase() === form.materialCode.trim().toUpperCase());
    if (!material) {
      errors.materialCode = "Pick a real material code out of the suggestions list.";
    }
    if (!form.batchNumber.trim()) {
      errors.batchNumber = "Batch number is required.";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitState("submitting");
    try {
      const res = await fetch("/api/receiving-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          shift: form.shift,
          line: form.line,
          materialId: material!.id,
          batchNumber: form.batchNumber.trim(),
          defaultPalletStatus: form.defaultPalletStatus,
          bulkReason: form.defaultPalletStatus === "BULK" ? form.bulkReason : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        // 503 = Clerk stub mode (same honest-refusal pattern as every
        // other mutation screen in this app).
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
      <PageHeader breadcrumb="Home / Inward / Receiving Sheets" title="Receiving Sheets" />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-sm font-bold text-navy">New receiving sheet</h2>
          <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <Field label="Date">
              <input
                type="date"
                className={inputClass()}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label="Shift">
              <select
                className={inputClass()}
                value={form.shift}
                onChange={(e) => setForm({ ...form, shift: e.target.value as typeof form.shift })}
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </Field>
            <Field label="Line">
              <select
                className={inputClass()}
                value={form.line}
                onChange={(e) => setForm({ ...form, line: e.target.value as typeof form.line })}
              >
                <option value="FF">FF</option>
                <option value="SPECIALITY">Speciality</option>
              </select>
            </Field>
            <Field label="Material (LFG/SFG code)" error={fieldErrors.materialCode}>
              <input
                className={inputClass(fieldErrors.materialCode)}
                list="material-options"
                placeholder="Search LFG/SFG..."
                value={form.materialCode}
                onChange={(e) => setForm({ ...form, materialCode: e.target.value })}
              />
              <datalist id="material-options">
                {materials.map((m) => (
                  <option key={m.id} value={m.code}>
                    {m.description}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field label="Batch No (L+YY+Month letter+DD+Seq)" error={fieldErrors.batchNumber}>
              <input
                className={inputClass(fieldErrors.batchNumber)}
                placeholder="L26I070938"
                value={form.batchNumber}
                onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
              />
            </Field>
            <Field label="Default pallet status">
              <select
                className={inputClass()}
                value={form.defaultPalletStatus}
                onChange={(e) =>
                  setForm({ ...form, defaultPalletStatus: e.target.value as typeof form.defaultPalletStatus })
                }
              >
                <option value="QC_HOLD">QC Hold (normal)</option>
                <option value="BULK">Bulk (over-production)</option>
              </select>
            </Field>
            {form.defaultPalletStatus === "BULK" ? (
              <Field label="Bulk reason">
                <select
                  className={inputClass()}
                  value={form.bulkReason}
                  onChange={(e) => setForm({ ...form, bulkReason: e.target.value as typeof form.bulkReason })}
                >
                  {BULK_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

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
                {submitState === "submitting" ? "Creating..." : "Create draft sheet"}
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold text-navy">Existing sheets</h2>
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
              No receiving sheets yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {sheets.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/inward/receiving-sheets/${s.id}`}
                    className="flex min-h-[64px] flex-col justify-center rounded-xl border border-line bg-white p-4 shadow-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-navy">{s.sheetNumber}</span>
                      <StatusPill status={s.status} />
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {s.materialCode} - {s.materialDescription} - batch {s.batchNumber}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {s.date} - Shift {s.shift} - {s.totalBoxes} pallet(s), {s.totalQty} cartons
                    </div>
                    {s.bulkReason ? (
                      <div className="mt-1 text-xs font-semibold text-accent">Bulk - {s.bulkReason}</div>
                    ) : null}
                    {s.originalBulkPalletId ? (
                      <div className="mt-1 text-xs font-semibold text-accent">Repack receipt (linked to original bulk pallet)</div>
                    ) : null}
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

function StatusPill({ status }: { status: ReceivingSheetRow["status"] }) {
  const styles: Record<ReceivingSheetRow["status"], string> = {
    DRAFT: "bg-line text-muted",
    PENDING_PACKING: "bg-warning-light text-warning",
    PENDING_WAREHOUSE: "bg-warning-light text-warning",
    LOCKED: "bg-success-light text-success",
    CANCELLED: "bg-danger-light text-danger",
  };
  return (
    <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + styles[status]}>
      {STATUS_LABEL[status]}
    </span>
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
