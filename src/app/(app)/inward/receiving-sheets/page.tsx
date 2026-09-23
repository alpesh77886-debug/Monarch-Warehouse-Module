"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  Field,
  KpiCard,
  Pill,
  type PillTone,
  StateBox,
  Steps,
  SubText,
  TableWrap,
  btn,
  inputClass,
  rowFlagCls,
  tableCls,
  tdCls,
  thCls,
  trCls,
} from "@/components/ui";

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

  const draftCount = sheets.filter((s) => s.status === "DRAFT").length;
  const awaitingCount = sheets.filter((s) => s.status === "PENDING_PACKING" || s.status === "PENDING_WAREHOUSE").length;
  const lockedCount = sheets.filter((s) => s.status === "LOCKED").length;
  const totalCartons = sheets.filter((s) => s.status !== "CANCELLED").reduce((sum, s) => sum + s.totalQty, 0);

  return (
    <>
      <PageHeader title="Receiving Sheets" />
      <div className="flex flex-col gap-5 bg-canvas p-4 sm:p-6">
        <Steps steps={["Sheet Details", "Pallet Entry", "Dual Confirmation"]} current={1} />

        {loadState === "ready" && sheets.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard color="#64748B" label="Draft" value={draftCount} sub="pallet entry open" />
            <KpiCard color="#D97706" label="Awaiting Confirm" value={awaitingCount} sub="packing / warehouse side" />
            <KpiCard color="#059669" label="Locked" value={lockedCount} sub="legal record" />
            <KpiCard color="#0D9488" label="Cartons Received" value={totalCartons} sub="excl. cancelled" />
          </div>
        ) : null}

        <Card
          title="New receiving sheet"
          sub="Step 1 · sheet details - pallets are added on the next screen"
          className="bg-gradient-to-r from-[#F0FDFA] to-white"
          bodyClassName="p-4 sm:p-5"
        >
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={handleSubmit}>
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

            <div className="sm:col-span-2 lg:col-span-3">
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
                {submitState === "submitting" ? "Creating..." : "Create draft sheet"}
              </button>
            </div>
          </form>
        </Card>

        {loadState === "loading" ? (
          <StateBox>Loading...</StateBox>
        ) : loadState === "error" ? (
          <StateBox tone="danger">{loadError}</StateBox>
        ) : sheets.length === 0 ? (
          <StateBox>No receiving sheets yet.</StateBox>
        ) : (
          <Card title="Existing sheets" sub={`${sheets.length} sheet(s) · newest first`} bodyClassName="px-4 pb-2 pt-1">
            <TableWrap minWidth={760}>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>Sheet No</th>
                    <th className={thCls}>Date / Shift</th>
                    <th className={thCls}>Material</th>
                    <th className={thCls}>Batch</th>
                    <th className={thCls + " text-right"}>Pallets</th>
                    <th className={thCls + " text-right"}>Cartons</th>
                    <th className={thCls}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((s) => (
                    <tr key={s.id} className={trCls + " " + rowFlagCls(s.status === "CANCELLED" ? "critical" : s.bulkReason ? "violet" : null)}>
                      <td className={tdCls}>
                        <Link
                          href={`/inward/receiving-sheets/${s.id}`}
                          className="flex min-h-[44px] flex-col justify-center font-extrabold text-teal-2 hover:underline"
                        >
                          {s.sheetNumber}
                        </Link>
                        {s.bulkReason ? <div className="text-[11px] font-semibold text-accent">Bulk - {s.bulkReason}</div> : null}
                        {s.originalBulkPalletId ? (
                          <div className="text-[11px] font-semibold text-accent">Repack receipt (linked to original bulk pallet)</div>
                        ) : null}
                      </td>
                      <td className={tdCls}>
                        <div className="font-semibold text-ink">{s.date}</div>
                        <div className="mt-0.5">
                          <Pill tone="shift">Shift {s.shift}</Pill> <span className="text-[11px] text-muted2">{s.line}</span>
                        </div>
                      </td>
                      <td className={tdCls}>
                        <div className="font-bold text-ink">{s.materialCode}</div>
                        <SubText>{s.materialDescription}</SubText>
                      </td>
                      <td className={tdCls + " font-semibold text-ink2"}>{s.batchNumber}</td>
                      <td className={tdCls + " text-right"}>{s.totalBoxes}</td>
                      <td className={tdCls + " text-right font-bold text-ink"}>{s.totalQty}</td>
                      <td className={tdCls}>
                        <StatusPill status={s.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}
      </div>
    </>
  );
}

function StatusPill({ status }: { status: ReceivingSheetRow["status"] }) {
  const tone: Record<ReceivingSheetRow["status"], PillTone> = {
    DRAFT: "neutral",
    PENDING_PACKING: "hold",
    PENDING_WAREHOUSE: "hold",
    LOCKED: "ok",
    CANCELLED: "rejected",
  };
  return <Pill tone={tone[status]}>{STATUS_LABEL[status]}</Pill>;
}
