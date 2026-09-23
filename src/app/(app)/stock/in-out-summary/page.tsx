"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Icon } from "@/components/icons";
import {
  Card,
  KpiCard,
  Note,
  Pill,
  StateBox,
  TableWrap,
  btn,
  tableCls,
  tdCls,
  thCls,
  trCls,
} from "@/components/ui";

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

  const byShift = Array.from(new Set(rows.map((r) => r.shift))).sort().map((shift) => {
    const shiftRows = rows.filter((r) => r.shift === shift);
    return {
      shift,
      inQty: shiftRows.reduce((sum, r) => sum + r.inQty, 0),
      outQty: shiftRows.reduce((sum, r) => sum + r.outQty, 0),
    };
  }).filter((s) => s.inQty > 0 || s.outQty > 0);
  const shiftMax = Math.max(1, ...byShift.map((s) => Math.max(s.inQty, s.outQty)));

  const byMaterialMap = new Map<string, { code: string; description: string; inQty: number; outQty: number }>();
  for (const r of rows) {
    const m = byMaterialMap.get(r.materialCode) ?? { code: r.materialCode, description: r.materialDescription, inQty: 0, outQty: 0 };
    m.inQty += r.inQty;
    m.outQty += r.outQty;
    byMaterialMap.set(r.materialCode, m);
  }
  const topMaterials = Array.from(byMaterialMap.values())
    .sort((a, b) => b.inQty + b.outQty - (a.inQty + a.outQty))
    .slice(0, 6);
  const materialMax = Math.max(1, ...topMaterials.map((m) => Math.max(m.inQty, m.outQty)));

  return (
    <>
      <PageHeader
        title="In-Out Summary"
        actions={
          <a href="/api/reports/in-out-summary/export" className={btn("primary")}>
            <Icon name="inward" size={18} strokeWidth={2.2} /> Export (summary + full detail)
          </a>
        }
      />
      <div className="flex flex-col gap-5 bg-canvas p-4 sm:p-6">
        <Note>
          IN vs OUT quantity by material, shift, and day - from real stock ledger transactions. Simple aggregation for now
          (not a literal DSR IN-OUT sheet match - see PEN-031).
        </Note>

        {state === "loading" ? (
          <StateBox>Loading...</StateBox>
        ) : state === "permission-denied" ? (
          <div
            className="rounded-xl border border-warning bg-warning-light p-6 text-sm font-semibold text-[#B45309] shadow-card"
            role="alert"
          >
            {message}
          </div>
        ) : state === "error" ? (
          <StateBox tone="danger">{message}</StateBox>
        ) : rows.length === 0 ? (
          <StateBox>
            No IN/OUT transactions yet - only Receiving Sheet (INWARD) writes real stock ledger rows today;
            Dispatch/Transfer/Bulk are not built yet.
          </StateBox>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard color="#0D9488" label="Total IN" value={totals.inQty} sub="cartons" />
              <KpiCard color="#DC2626" label="Total OUT" value={totals.outQty} sub="cartons" />
              <KpiCard color="#0B1F3A" label="Net" value={totals.inQty - totals.outQty} sub="IN − OUT" />
              <KpiCard color="#7C3AED" label="Rows" value={rows.length} sub={`${byMaterialMap.size} material(s)`} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="▥ Shift-wise IN vs OUT" sub="cartons">
                <div className="mb-3 flex gap-4 text-[11px] font-semibold text-ink2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-teal" /> IN
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-danger" /> OUT
                  </span>
                </div>
                <div className="space-y-3 text-xs">
                  {byShift.map((s) => (
                    <div key={s.shift} className="grid grid-cols-[56px_1fr_56px] items-center gap-x-2 gap-y-1">
                      <b className="row-span-2 text-ink">Shift {s.shift}</b>
                      <Bar pct={(s.inQty / shiftMax) * 100} gradient="linear-gradient(90deg,#2DD4BF,#0D9488)" />
                      <b className="text-right text-ink">{s.inQty}</b>
                      <Bar pct={(s.outQty / shiftMax) * 100} gradient="linear-gradient(90deg,#FCA5A5,#DC2626)" />
                      <span className="text-right text-muted">{s.outQty}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="◈ Top materials by movement" sub={`top ${topMaterials.length}`}>
                <div className="space-y-3 text-xs">
                  {topMaterials.map((m) => (
                    <div key={m.code} className="grid grid-cols-[84px_1fr_64px] items-center gap-x-2 gap-y-1">
                      <b className="row-span-2 truncate text-ink" title={m.description}>
                        {m.code}
                      </b>
                      <Bar pct={(m.inQty / materialMax) * 100} gradient="linear-gradient(90deg,#7DD3FC,#0284C7)" />
                      <b className="text-right text-ink">+{m.inQty}</b>
                      <Bar pct={(m.outQty / materialMax) * 100} gradient="linear-gradient(90deg,#C4B5FD,#7C3AED)" />
                      <span className="text-right text-muted">−{m.outQty}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <ul className="flex flex-col gap-2 sm:hidden">
              {rows.map((r) => (
                <li key={`${r.date}|${r.shift}|${r.materialCode}`} className="rounded-xl border border-line bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-ink">{r.materialCode}</span>
                    <span className="text-[11px] text-muted2">
                      {r.date} · Shift {r.shift}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted2">{r.materialDescription}</div>
                  <div className="mt-1.5 text-xs text-ink2">
                    IN <b className="text-success">{r.inQty}</b> · OUT <b className="text-danger">{r.outQty}</b> · Net{" "}
                    <b className="text-ink">{r.netQty}</b>
                  </div>
                </li>
              ))}
            </ul>

            <Card className="hidden sm:block" title="Material-wise IN-OUT" sub="by day and shift" bodyClassName="px-4 pb-2 pt-1">
              <TableWrap minWidth={760}>
                <table className={tableCls}>
                  <thead>
                    <tr>
                      <th className={thCls}>Date</th>
                      <th className={thCls}>Shift</th>
                      <th className={thCls}>Material</th>
                      <th className={thCls + " text-right"}>IN Qty</th>
                      <th className={thCls + " text-right"}>OUT Qty</th>
                      <th className={thCls + " text-right"}>Net Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={`${r.date}|${r.shift}|${r.materialCode}`} className={trCls}>
                        <td className={tdCls + " whitespace-nowrap"}>{r.date}</td>
                        <td className={tdCls}>
                          <Pill tone="shift">{r.shift}</Pill>
                        </td>
                        <td className={tdCls}>
                          <div className="font-bold text-ink">{r.materialCode}</div>
                          <div className="text-[11px] text-muted2">{r.materialDescription}</div>
                        </td>
                        <td className={tdCls + " text-right font-bold text-success"}>{r.inQty}</td>
                        <td className={tdCls + " text-right font-bold text-danger"}>{r.outQty}</td>
                        <td className={tdCls + " text-right font-extrabold text-ink"}>{r.netQty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function Bar({ pct, gradient }: { pct: number; gradient: string }) {
  return (
    <div className="h-3.5 rounded-md bg-[#F1F5F9]">
      <div className="h-full rounded-md" style={{ width: `${pct > 0 ? Math.max(3, pct) : 0}%`, background: gradient }} />
    </div>
  );
}
