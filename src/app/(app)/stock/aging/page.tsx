"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";

type AgingEntry = {
  batchId: string;
  batchNumber: string;
  materialCode: string;
  productionDate: string;
  ageDays: number;
  ageBucket: "0-30" | "31-60" | "61-90" | "90+";
  totalCartons: number;
  palletCount: number;
};

type FifoCompliance = {
  totalDispatchedPicks: number;
  compliantPicks: number;
  overriddenPicks: number;
  compliancePct: number | null;
};

type LoadState = "loading" | "ready" | "error" | "permission-denied";

function bucketToneClass(bucket: AgingEntry["ageBucket"]) {
  if (bucket === "90+") return "bg-danger-light text-danger";
  if (bucket === "61-90") return "bg-warning-light text-warning";
  return "bg-line text-muted";
}

export default function StockAgingPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [agingByBatch, setAgingByBatch] = useState<AgingEntry[]>([]);
  const [fifoCompliance, setFifoCompliance] = useState<FifoCompliance | null>(null);

  useEffect(() => {
    async function load() {
      setState("loading");
      setMessage(null);
      try {
        const res = await fetch("/api/stock/aging");
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
        setAgingByBatch(body.agingByBatch as AgingEntry[]);
        setFifoCompliance(body.fifoCompliance as FifoCompliance);
        setState("ready");
      } catch {
        setMessage("Network error - could not reach the server.");
        setState("error");
      }
    }
    load();
  }, []);

  return (
    <>
      <PageHeader breadcrumb="Home / Stock / Stock Aging" title="Stock Aging (FIFO)" />
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <p className="text-xs text-muted">
          Currently OK (dispatchable) stock, grouped by batch and aged from its real production date - the
          same order the Loading Sheet pick screen's own FIFO-sorted list already uses. FIFO compliance below
          covers only picks belonging to sheets that have actually DISPATCHED.
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
        ) : (
          <>
            {fifoCompliance ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryTile label="Dispatched picks" value={fifoCompliance.totalDispatchedPicks} />
                <SummaryTile label="FIFO-compliant" value={fifoCompliance.compliantPicks} />
                <SummaryTile label="Overridden" value={fifoCompliance.overriddenPicks} />
                <div className="rounded-lg border border-line bg-canvas p-3">
                  <div className="text-xs font-semibold text-muted">FIFO compliance rate</div>
                  <div className="mt-1 text-xl font-bold text-navy">
                    {fifoCompliance.compliancePct === null ? "No dispatches yet" : `${fifoCompliance.compliancePct}%`}
                  </div>
                </div>
              </div>
            ) : null}

            {agingByBatch.length === 0 ? (
              <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
                No OK-status stock right now.
              </div>
            ) : (
              <>
                <ul className="flex flex-col gap-2 sm:hidden">
                  {agingByBatch.map((b) => (
                    <li key={b.batchId} className="rounded-xl border border-line bg-white p-4 shadow-card">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-navy">{b.batchNumber}</span>
                        <span
                          className={"rounded-full px-2 py-0.5 text-xs font-bold " + bucketToneClass(b.ageBucket)}
                        >
                          {b.ageBucket}d
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted">{b.materialCode}</div>
                      <div className="mt-1 text-xs text-ink2">
                        Produced {b.productionDate} · {b.ageDays}d old · {b.totalCartons} ctn ({b.palletCount}{" "}
                        pallets)
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="hidden overflow-x-auto rounded-xl border border-line bg-white shadow-card sm:block">
                  <table className="w-full min-w-[800px] text-left text-sm">
                    <thead className="bg-canvas text-xs font-semibold uppercase text-muted2">
                      <tr>
                        <th className="px-4 py-3">Batch</th>
                        <th className="px-4 py-3">Material</th>
                        <th className="px-4 py-3">Production Date</th>
                        <th className="px-4 py-3">Age</th>
                        <th className="px-4 py-3">Cartons</th>
                        <th className="px-4 py-3">Pallets</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {agingByBatch.map((b) => (
                        <tr key={b.batchId}>
                          <td className="px-4 py-3">{b.batchNumber}</td>
                          <td className="px-4 py-3">{b.materialCode}</td>
                          <td className="px-4 py-3">{b.productionDate}</td>
                          <td className="px-4 py-3">
                            <span
                              className={
                                "rounded-full px-2 py-0.5 text-xs font-bold " + bucketToneClass(b.ageBucket)
                              }
                            >
                              {b.ageDays}d ({b.ageBucket})
                            </span>
                          </td>
                          <td className="px-4 py-3">{b.totalCartons}</td>
                          <td className="px-4 py-3">{b.palletCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
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
