"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Icon } from "@/components/icons";
import {
  Card,
  Pill,
  type PillTone,
  StateBox,
  TableWrap,
  btn,
  inputClass,
  tableCls,
  tdCls,
  thCls,
  trCls,
} from "@/components/ui";

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
        title="Stock Ledger"
        actions={
          <a
            href={
              transactionType
                ? `/api/stock/ledger/export?transactionType=${transactionType}`
                : "/api/stock/ledger/export"
            }
            className={btn("primary")}
          >
            <Icon name="inward" size={18} strokeWidth={2.2} /> Export (DSR format)
          </a>
        }
      />
      <div className="flex flex-col gap-4 bg-canvas p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className={inputClass() + " sm:w-64"}
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
          <span className="text-[11px] text-muted2">Append-only · every row is who / when / what / why</span>
        </div>

        {state === "loading" ? (
          <StateBox>Loading ledger...</StateBox>
        ) : state === "permission-denied" ? (
          <div
            className="rounded-xl border border-warning bg-warning-light p-6 text-sm font-semibold text-[#B45309] shadow-card"
            role="alert"
          >
            {message}
          </div>
        ) : state === "error" ? (
          <StateBox tone="danger">{message}</StateBox>
        ) : entries.length === 0 ? (
          <StateBox>No ledger entries {transactionType ? `of type ${transactionType} ` : ""}yet.</StateBox>
        ) : (
          <>
            <ul className="flex flex-col gap-2 sm:hidden">
              {entries.map((e) => (
                <li key={e.id} className={"rounded-xl border border-line p-4 shadow-card " + (ledgerRowTint(e.transactionType) || "bg-white")}>
                  <div className="flex items-center justify-between gap-2">
                    <Pill tone={typeTone(e.transactionType)}>{e.transactionType}</Pill>
                    <span className="text-[11px] text-muted2">
                      {e.date} · {e.shift}
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm font-bold text-ink">{e.materialCode}</div>
                  <div className="mt-1 text-xs text-muted">
                    qty <QtyChange value={e.qtyChange} /> (after {e.qtyAfter}) · {e.weightChangeKg} kg
                  </div>
                </li>
              ))}
            </ul>

            <Card
              className="hidden sm:block"
              title="Transactions"
              sub={`${total} total · running balance per pallet`}
              bodyClassName="px-4 pb-2 pt-1"
            >
              <TableWrap minWidth={960}>
                <table className={tableCls + " text-xs"}>
                  <thead>
                    <tr>
                      <th className={thCls}>Date</th>
                      <th className={thCls}>Shift</th>
                      <th className={thCls}>Type</th>
                      <th className={thCls}>FG Code</th>
                      <th className={thCls + " text-right"}>Qty change</th>
                      <th className={thCls + " text-right"}>Qty after</th>
                      <th className={thCls + " text-right"}>Weight change kg</th>
                      <th className={thCls}>Status</th>
                      <th className={thCls}>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className={trCls + " " + ledgerRowTint(e.transactionType)}>
                        <td className={tdCls + " whitespace-nowrap"}>{e.date}</td>
                        <td className={tdCls}>
                          <Pill tone="shift">{e.shift}</Pill>
                        </td>
                        <td className={tdCls}>
                          <Pill tone={typeTone(e.transactionType)}>{e.transactionType}</Pill>
                        </td>
                        <td className={tdCls + " font-bold text-ink"}>{e.materialCode}</td>
                        <td className={tdCls + " text-right"}>
                          <QtyChange value={e.qtyChange} />
                        </td>
                        <td className={tdCls + " text-right font-semibold text-ink"}>{e.qtyAfter}</td>
                        <td className={tdCls + " text-right text-muted"}>{e.weightChangeKg}</td>
                        <td className={tdCls + " whitespace-nowrap text-[11px] text-muted"}>
                          {e.statusBefore || e.statusAfter ? (
                            <>
                              {e.statusBefore ?? "—"} → <b className="text-ink2">{e.statusAfter ?? "—"}</b>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={tdCls + " text-[11px] text-muted2"}>
                          {e.referenceType} / {e.referenceId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Card>

            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                Page {page} of {totalPages} ({total} total)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={btn("outline")}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={btn("outline")}
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function typeTone(t: string): PillTone {
  switch (t) {
    case "INWARD":
    case "RELEASE":
    case "BULK_RECEIVE":
      return "ok";
    case "HOLD":
      return "hold";
    case "DISPATCH":
    case "TRANSFER_OUT":
      return "transit";
    case "TRANSFER_IN":
      return "qc";
    case "BULK_SEND":
      return "bulk";
    case "ADJUSTMENT":
      return "rejected";
    default:
      return "neutral";
  }
}

function ledgerRowTint(t: string) {
  if (t === "HOLD") return "bg-[#FFFBEB]";
  if (t === "RELEASE") return "bg-[#F0FDF9]";
  return "";
}

function QtyChange({ value }: { value: number }) {
  return (
    <span className={"font-bold " + (value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-muted")}>
      {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}
