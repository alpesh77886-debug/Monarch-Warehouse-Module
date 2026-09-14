"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";

type Status = {
  code: string;
  description: string;
  dispatchable: number;
  transferable: number;
  sapLimbasi: string;
  sapSabarkantha: string | null;
};

export default function StatusMasterPage() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [rows, setRows] = useState<Status[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/masters/statuses")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
        setRows(body.statuses as Status[]);
        setState("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load statuses.");
        setState("error");
      });
  }, []);

  return (
    <>
      <PageHeader breadcrumb="Home / Masters / Status Master" title="Status Master" />
      <div className="p-4 sm:p-6">
        {state === "loading" ? (
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
            Loading statuses...
          </div>
        ) : state === "error" ? (
          <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
            {error}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((s) => (
              <li key={s.code} className="rounded-xl border border-line bg-white p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-navy">{s.code}</span>
                  <div className="flex gap-1 text-xs font-bold">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 " +
                        (s.dispatchable ? "bg-success-light text-success" : "bg-line text-muted")
                      }
                    >
                      {s.dispatchable ? "Dispatchable" : "Not dispatchable"}
                    </span>
                    <span
                      className={
                        "rounded-full px-2 py-0.5 " +
                        (s.transferable ? "bg-sky-light text-sky" : "bg-line text-muted")
                      }
                    >
                      {s.transferable ? "Transferable" : "Not transferable"}
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-sm text-ink2">{s.description}</div>
                <div className="mt-1 text-xs text-muted">
                  SAP (Limbasi): {s.sapLimbasi}
                  {s.sapSabarkantha ? ` · SAP (Sabarkantha): ${s.sapSabarkantha}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
