"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  Field,
  KpiCard,
  Note,
  Pill,
  type PillTone,
  StateBox,
  SubText,
  TableWrap,
  btn,
  inputClass,
  tableCls,
  tdCls,
  thCls,
  trCls,
} from "@/components/ui";

type BulkPalletRow = {
  id: string;
  palletNumber: string;
  materialCode: string;
  materialDescription: string;
  batchNumber: string | null;
  bulkReason: string | null;
  totalWeightKg: number;
  totalCartons: number;
  ageDays: number;
  ageBucket: "RED" | "AMBER" | "OK";
};

type LoadState = "loading" | "ready" | "error";

const AGE_TONE: Record<BulkPalletRow["ageBucket"], PillTone> = {
  RED: "rejected",
  AMBER: "hold",
  OK: "ok",
};

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  shift: "A" as "A" | "B" | "C",
  line: "FF" as "FF" | "SPECIALITY",
  batchNumber: "",
};

export default function BulkManagementPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bulkPallets, setBulkPallets] = useState<BulkPalletRow[]>([]);

  const [repackTargetId, setRepackTargetId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [lastCreatedSheetNumber, setLastCreatedSheetNumber] = useState<string | null>(null);

  async function loadAll() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/bulk-pallets");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Could not load bulk stock.");
      setBulkPallets(body.bulkPallets as BulkPalletRow[]);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load bulk stock.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const redCount = bulkPallets.filter((p) => p.ageBucket === "RED").length;
  const amberCount = bulkPallets.filter((p) => p.ageBucket === "AMBER").length;
  const totalCartons = bulkPallets.reduce((sum, p) => sum + p.totalCartons, 0);

  function openRepackForm(palletId: string) {
    setRepackTargetId(palletId);
    setForm(EMPTY_FORM);
    setSubmitError(null);
    setSubmitNotice(null);
    setLastCreatedSheetNumber(null);
  }

  async function handleRepack(event: FormEvent) {
    event.preventDefault();
    if (!repackTargetId) return;
    setSubmitError(null);
    setSubmitNotice(null);
    setSubmitState("submitting");
    try {
      const res = await fetch(`/api/bulk-pallets/${repackTargetId}/repack`, {
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
      setLastCreatedSheetNumber(body.receivingSheet.sheetNumber);
      setRepackTargetId(null);
      await loadAll();
    } catch {
      setSubmitError("Network error - could not reach the server.");
    } finally {
      setSubmitState("idle");
    }
  }

  return (
    <>
      <PageHeader title="Bulk Management" />
      <div className="flex flex-col gap-5 bg-canvas p-4 sm:p-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard color="#7C3AED" label="Pending repack" value={bulkPallets.length} sub="bulk pallets" />
          <KpiCard color="#475569" label="Total cartons" value={totalCartons} sub="in bulk" />
          <KpiCard color="#DC2626" label="Aging > 7d" value={redCount} sub="repack first" subTone={redCount > 0 ? "danger" : "muted"} />
          <KpiCard color="#D97706" label="Aging > 3d" value={amberCount} sub="follow up" />
        </section>

        {lastCreatedSheetNumber ? (
          <div className="rounded-xl border border-success bg-success-light p-4 text-sm text-success shadow-card" role="status">
            Repack receipt created: <span className="font-bold">{lastCreatedSheetNumber}</span>. Add pallet rows and
            confirm it from{" "}
            <Link href="/inward/receiving-sheets" className="underline">
              Receiving Sheets
            </Link>
            .
          </div>
        ) : null}

        {loadState === "loading" ? (
          <StateBox>Loading...</StateBox>
        ) : loadState === "error" ? (
          <StateBox tone="danger">{loadError}</StateBox>
        ) : bulkPallets.length === 0 ? (
          <StateBox>No bulk stock pending repack.</StateBox>
        ) : (
          <Card
            title={`Pending repack - FIFO on bulk age (${bulkPallets.length})`}
            sub="bulk = over-production / defective, packed in bulk cartons"
            bodyClassName="px-4 pb-3 pt-1"
          >
            <TableWrap minWidth={760}>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>Material</th>
                    <th className={thCls}>Pallet</th>
                    <th className={thCls}>Type</th>
                    <th className={thCls + " text-right"}>Qty</th>
                    <th className={thCls + " text-center"}>Age</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody>
                  {bulkPallets.map((p) => (
                    <tr key={p.id} className={trCls + (repackTargetId === p.id ? " bg-accent-light/40" : "")}>
                      <td className={tdCls}>
                        <div className="font-bold text-ink">{p.materialCode}</div>
                        <SubText>
                          {p.materialDescription} · {p.batchNumber ?? "no batch"}
                        </SubText>
                      </td>
                      <td className={tdCls + " font-semibold text-ink2"}>{p.palletNumber}</td>
                      <td className={tdCls}>
                        {p.bulkReason ? (
                          <span className="inline-block rounded-md bg-[#EDE9FE] px-2 py-0.5 text-[10px] font-extrabold text-[#6D28D9]">
                            {p.bulkReason}
                          </span>
                        ) : (
                          <span className="text-muted2">-</span>
                        )}
                      </td>
                      <td className={tdCls + " text-right"}>
                        <div className="font-bold text-ink">{p.totalCartons} bx</div>
                        <SubText>{p.totalWeightKg} kg</SubText>
                      </td>
                      <td className={tdCls + " text-center"}>
                        <Pill tone={AGE_TONE[p.ageBucket]}>{p.ageDays}d</Pill>
                      </td>
                      <td className={tdCls + " text-right"}>
                        <button type="button" onClick={() => openRepackForm(p.id)} className={btn("teal", "px-3 text-xs")}>
                          Repack Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}

        {repackTargetId ? (
          <Card title="Repack receipt - new receiving sheet" accentColor="#7C3AED">
            <p className="text-xs text-muted">
              Sends this bulk pallet to Packing (status -&gt; QC_HOLD) and opens a linked, empty DRAFT receiving
              sheet - add its pallet rows and confirm it from Receiving Sheets, same as any other sheet.
            </p>
            <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={handleRepack}>
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
                  <option value="SPECIALITY">SPECIALITY</option>
                </select>
              </Field>
              <Field label="New batch number">
                <input
                  className={inputClass()}
                  placeholder="L26I070938"
                  value={form.batchNumber}
                  onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
                />
              </Field>
              {submitNotice || submitError ? (
                <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
                  {submitNotice ? (
                    <p className="rounded-lg bg-warning-light p-3 text-xs font-semibold text-[#B45309]" role="status">
                      {submitNotice}
                    </p>
                  ) : null}
                  {submitError ? (
                    <p className="rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                      {submitError}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-4">
                <button type="submit" disabled={submitState === "submitting"} className={btn("teal")}>
                  {submitState === "submitting" ? "Creating..." : "Create repack receipt"}
                </button>
                <button type="button" onClick={() => setRepackTargetId(null)} className={btn("outline")}>
                  Cancel
                </button>
              </div>
            </form>
          </Card>
        ) : null}

        <Note>
          Lifecycle: warehouse → Packing dept → repacked in branded cartons → <b>new Receiving Sheet</b> (new pallet IDs,
          linked to the original bulk pallet) → QC HOLD → release → dispatchable. Full traceability.
        </Note>
      </div>
    </>
  );
}
