"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";

type SapCode = {
  sapCode: string;
  sapName: string;
  plant: string;
  type: string;
  moduleStatusMapping: string;
  fgRelevant: number;
};

export default function SapWarehouseMasterPage() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [rows, setRows] = useState<SapCode[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/masters/sap-codes")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
        setRows(body.sapCodes as SapCode[]);
        setState("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load SAP codes.");
        setState("error");
      });
  }, []);

  return (
    <>
      <PageHeader breadcrumb="Home / Masters / SAP Warehouse Master" title="SAP Warehouse Master" />
      <div className="p-4 sm:p-6">
        {state === "loading" ? (
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
            Loading SAP codes...
          </div>
        ) : state === "error" ? (
          <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
            {error}
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted">{rows.length} FG-relevant SAP codes seeded.</p>
            <ul className="flex flex-col gap-2 sm:hidden">
              {rows.map((r) => (
                <li key={r.sapCode} className="rounded-xl border border-line bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-navy">{r.sapCode}</span>
                    <span className="rounded-full bg-line px-2 py-0.5 text-xs font-bold text-muted">
                      {r.type}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-ink2">{r.sapName}</div>
                  <div className="mt-1 text-xs text-muted">
                    {r.plant} · {r.moduleStatusMapping}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto rounded-xl border border-line bg-white shadow-card sm:block">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-canvas text-xs font-semibold uppercase text-muted2">
                  <tr>
                    <th className="px-4 py-3">SAP code</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Plant</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Module status mapping</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.sapCode}>
                      <td className="px-4 py-3 font-bold text-navy">{r.sapCode}</td>
                      <td className="px-4 py-3">{r.sapName}</td>
                      <td className="px-4 py-3">{r.plant}</td>
                      <td className="px-4 py-3">{r.type}</td>
                      <td className="px-4 py-3">{r.moduleStatusMapping}</td>
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
