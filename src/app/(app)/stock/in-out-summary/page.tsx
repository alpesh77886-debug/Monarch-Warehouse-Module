"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";

type SummaryRow = {
  date: string;
  shift: string;
  materialCode: string;
  materialDescription: string;
  inQty: number;
  outQty: number;
  netQty: number;
};

type LoadState = "loading" | "ready" | "error" | "permission-denied";

export default function InOutSummaryPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<SummaryRow[]>([]);

  useEffect(() => {
    async function load() {
      setState("loading");
      setMessage(null);
      try {
        const res = await fetch("/api/reports/in-out-summary");
        const body = await res.json();
        if (!res.ok) {
          if (res.status === 401 || res.status === 403 || res.status === 503) {
            setMessage(body.error);
            setState("permission-denied");
          } else {
            setMessage(body.error ?? `Request failed (${res.status}).`);
            setState("error");
          }
          return;
        }
        setRows(body.summary as SummaryRow[]);
        setState("ready");
      } catch {
        setMessage("Network error - could not reach the server.");
        setState("error");
      }
    }
    load();
  }, []);

  const totals = rows.reduce(
    (acc, r) => ({ inQty: acc.inQty + r.inQty, outQty: acc.outQty + r.outQty }),
    { inQty: 0, outQty: 0 }
  );

  return (
    <>
      <PageHeader
        breadcrumb="Home / Stock / In-Out Summary"
        title="In-Out Summary"
        actions={
          <a
            href="/api/reports/in-out-summary/export"
            className="flex min-h-[48px] items-center rounded-lg bg-teal px-4 text-sm font-bold text-white"
          >
            Export (summary + full detail)
          </a>
        }
      />
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <p className="text-xs text-muted">
          IN vs OUT quantity by material, shift, and day - from real stock ledger transactions. Simple
          aggregation for now (not a literal DSR IN-OUT sheet match - see PEN-031).
        </p>

        {state === "loading" ? (
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
            Loading...
          </div>
        ) : state === "permission-denied" ? (
          <div
            className="rounded-xl border border-warning bg-warning-light p-6 text-sm text-warning shadow-card"
            role="alert"
          >
            {message}
          </div>
        ) : state === "error" ? (
          <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
            {message}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
            No IN/OUT transactions yet - only Receiving Sheet (INWARD) writes real stock ledger rows today;
            Dispatch/Transfer/Bulk are not built yet.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <SummaryTile label="Rows" value={rows.length} />
              <SummaryTile label="Total IN" value={totals.inQty} />
              <SummaryTile label="Total OUT" value={totals.outQty} />
            </div>

            <ul className="flex flex-col gap-2 sm:hidden">
              {rows.map((r) => (
                <li key={`${r.date}|${r.shift}|${r.materialCode}`} className="rounded-xl border border-line bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-navy">{r.materialCode}</span>
                    <span className="text-xs text-muted">
                      {r.date} · Shift {r.shift}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted">{r.materialDescription}</div>
                  <div className="mt-1 text-xs text-ink2">
                    IN {r.inQty} · OUT {r.outQty} · Net {r.netQty}
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto rounded-xl border border-line bg-white shadow-card sm:block">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="bg-canvas text-xs font-semibold uppercase text-muted2">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Shift</th>
                    <th className="px-4 py-3">Material</th>
                    <th className="px-4 py-3">IN Qty</th>
                    <th className="px-4 py-3">OUT Qty</th>
                    <th className="px-4 py-3">Net Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={`${r.date}|${r.shift}|${r.materialCode}`}>
                      <td className="px-4 py-3">{r.date}</td>
                      <td className="px-4 py-3">{r.shift}</td>
                      <td className="px-4 py-3">
                        {r.materialCode} - {r.materialDescription}
                      </td>
                      <td className="px-4 py-3 font-bold text-success">{r.inQty}</td>
                      <td className="px-4 py-3 font-bold text-danger">{r.outQty}</td>
                      <td className="px-4 py-3">{r.netQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-3">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold text-navy">{value}</div>
    </div>
  );
}
