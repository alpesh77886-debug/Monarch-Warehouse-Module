"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";

type LedgerEntry = {
  id: string;
  date: string;
  shift: string;
  transactionType: string;
  materialCode: string;
  qtyChange: number;
  qtyAfter: number;
  weightChangeKg: number;
  weightAfterKg: number;
  statusBefore: string | null;
  statusAfter: string | null;
  referenceType: string;
  referenceId: string;
  remarks: string | null;
  createdAt: string;
};

type LoadState = "loading" | "ready" | "error" | "permission-denied";

const TRANSACTION_TYPES = [
  "INWARD",
  "MOVE",
  "HOLD",
  "RELEASE",
  "DISPATCH",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "ADJUSTMENT",
  "BULK_SEND",
  "BULK_RECEIVE",
];

export default function StockLedgerPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [transactionType, setTransactionType] = useState("");

  useEffect(() => {
    async function load() {
      setState("loading");
      setMessage(null);
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (transactionType) params.set("transactionType", transactionType);
        const res = await fetch(`/api/stock/ledger?${params.toString()}`);
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
        setEntries(body.entries as LedgerEntry[]);
        setTotalPages(body.totalPages as number);
        setTotal(body.total as number);
        setState("ready");
      } catch {
        setMessage("Network error - could not reach the server.");
        setState("error");
      }
    }
    load();
  }, [page, transactionType]);

  return (
    <>
      <PageHeader
        breadcrumb="Home / Stock / Ledger"
        title="Stock Ledger"
        actions={
          <a
            href={
              transactionType
                ? `/api/stock/ledger/export?transactionType=${transactionType}`
                : "/api/stock/ledger/export"
            }
            className="flex min-h-[48px] items-center rounded-lg bg-teal px-4 text-sm font-bold text-white"
          >
            Export (DSR format)
          </a>
        }
      />
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <select
          className="min-h-[48px] w-full rounded-lg border border-line bg-white px-3 text-sm text-ink2 outline-none focus:border-teal sm:w-64"
          value={transactionType}
          onChange={(e) => {
            setPage(1);
            setTransactionType(e.target.value);
          }}
        >
          <option value="">All transaction types</option>
          {TRANSACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {state === "loading" ? (
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
            Loading ledger...
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
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
            No ledger entries {transactionType ? `of type ${transactionType} ` : ""}yet.
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2 sm:hidden">
              {entries.map((e) => (
                <li key={e.id} className="rounded-xl border border-line bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-navy">{e.transactionType}</span>
                    <span className="text-xs text-muted">
                      {e.date} · {e.shift}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-ink2">{e.materialCode}</div>
                  <div className="mt-1 text-xs text-muted">
                    qty {e.qtyChange >= 0 ? "+" : ""}
                    {e.qtyChange} (after {e.qtyAfter}) · {e.weightChangeKg} kg
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto rounded-xl border border-line bg-white shadow-card sm:block">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-canvas text-xs font-semibold uppercase text-muted2">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Shift</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Material</th>
                    <th className="px-4 py-3">Qty change</th>
                    <th className="px-4 py-3">Qty after</th>
                    <th className="px-4 py-3">Weight change kg</th>
                    <th className="px-4 py-3">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-3">{e.date}</td>
                      <td className="px-4 py-3">{e.shift}</td>
                      <td className="px-4 py-3 font-bold text-navy">{e.transactionType}</td>
                      <td className="px-4 py-3">{e.materialCode}</td>
                      <td className="px-4 py-3">{e.qtyChange}</td>
                      <td className="px-4 py-3">{e.qtyAfter}</td>
                      <td className="px-4 py-3">{e.weightChangeKg}</td>
                      <td className="px-4 py-3">
                        {e.referenceType} / {e.referenceId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                Page {page} of {totalPages} ({total} total)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-[48px] rounded-lg border border-line bg-white px-4 font-bold text-ink2 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-[48px] rounded-lg border border-line bg-white px-4 font-bold text-ink2 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
