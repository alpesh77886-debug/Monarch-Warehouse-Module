"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

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

const AGE_STYLE: Record<BulkPalletRow["ageBucket"], string> = {
  RED: "bg-danger-light text-danger",
  AMBER: "bg-warning-light text-warning",
  OK: "bg-line text-muted",
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
      <PageHeader breadcrumb="Home / Bulk Management" title="Bulk Management" />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Pending repack" value={bulkPallets.length} />
          <StatTile label="Total cartons" value={totalCartons} />
          <StatTile label="Aging > 7d" value={redCount} tone="danger" />
          <StatTile label="Aging > 3d" value={amberCount} tone="warning" />
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

        <section>
          <h2 className="mb-3 text-sm font-bold text-navy">
            Pending repack - FIFO on bulk age ({bulkPallets.length})
          </h2>
          {loadState === "loading" ? (
            <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">Loading...</div>
          ) : loadState === "error" ? (
            <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
              {loadError}
            </div>
          ) : bulkPallets.length === 0 ? (
            <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
              No bulk stock pending repack.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-line text-muted2">
                  <tr>
                    <th className="p-3">Material</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">Qty</th>
                    <th className="p-3">Age</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {bulkPallets.map((p) => (
                    <tr key={p.id}>
                      <td className="p-3">
                        <div className="font-bold text-navy">{p.materialCode}</div>
                        <div className="text-muted">
                          {p.materialDescription} - {p.batchNumber ?? "no batch"} - pallet {p.palletNumber}
                        </div>
                      </td>
                      <td className="p-3">{p.bulkReason ?? "-"}</td>
                      <td className="p-3">
                        {p.totalCartons} bx ({p.totalWeightKg} kg)
                      </td>
                      <td className="p-3">
                        <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + AGE_STYLE[p.ageBucket]}>
                          {p.ageDays}d
                        </span>
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => openRepackForm(p.id)}
                          className="min-h-[36px] rounded-lg bg-teal px-3 text-xs font-bold text-white"
                        >
                          Repack Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {repackTargetId ? (
          <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
            <h2 className="text-sm font-bold text-navy">Repack receipt - new receiving sheet</h2>
            <p className="mt-1 text-xs text-muted">
              Sends this bulk pallet to Packing (status -&gt; QC_HOLD) and opens a linked, empty DRAFT receiving
              sheet - add its pallet rows and confirm it from Receiving Sheets, same as any other sheet.
            </p>
            <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleRepack}>
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
              <div className="flex gap-3 sm:col-span-2">
                {submitNotice ? (
                  <p className="rounded-lg bg-warning-light p-3 text-xs font-semibold text-warning" role="status">
                    {submitNotice}
                  </p>
                ) : null}
                {submitError ? (
                  <p className="rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                    {submitError}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-3 sm:col-span-2">
                <button
                  type="submit"
                  disabled={submitState === "submitting"}
                  className="min-h-[48px] rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
                >
                  {submitState === "submitting" ? "Creating..." : "Create repack receipt"}
                </button>
                <button
                  type="button"
                  onClick={() => setRepackTargetId(null)}
                  className="min-h-[48px] rounded-lg border border-line px-4 text-sm font-bold text-ink2"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        ) : null}
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
