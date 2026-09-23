"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  Field,
  Pill,
  StateBox,
  TableWrap,
  btn,
  inputClass,
  statusTone,
  tableCls,
  tdCls,
  thCls,
  trCls,
} from "@/components/ui";

type LoadingSheet = {
  id: string;
  loadingSheetNumber: string;
  date: string;
  vehicleNumber: string;
  driverName: string;
  transporter: string | null;
  partyName: string;
  destination: string;
  exportDomestic: "EXPORT" | "DOMESTIC";
  temperatureC: number;
  qcApprovalById: string | null;
  qcApprovalAt: string | null;
  containerNumber: string | null;
  sealNumber: string | null;
  boltNumber: string | null;
  gatePassNumber: string | null;
  gatePassTime: string | null;
  loadedById: string | null;
  verifiedById: string | null;
  status: "DRAFT" | "STAGING" | "LOADED" | "VERIFIED" | "GATE_PASSED" | "DISPATCHED";
};

type PickedPallet = {
  id: string;
  palletId: string;
  palletNumber: string;
  materialCode: string;
  materialDescription: string;
  batchNumber: string;
  cartonQty: number;
  weightKg: number;
  loadingSequence: number;
  fifoOverrideReason: string | null;
};

type PalletOption = {
  id: string;
  palletNumber: string;
  materialCode: string;
  materialDescription: string;
  statusCode: string;
  totalCartons: number;
  batchId: string | null;
  batchNumber: string | null;
  productionDate: string | null;
};

type LoadState = "loading" | "ready" | "error";

const STATUS_LABEL: Record<LoadingSheet["status"], string> = {
  DRAFT: "Draft",
  STAGING: "Staging",
  LOADED: "Loaded",
  VERIFIED: "Verified",
  GATE_PASSED: "Gate passed",
  DISPATCHED: "Dispatched",
};

const STAGE_ORDER: LoadingSheet["status"][] = ["DRAFT", "STAGING", "LOADED", "VERIFIED", "GATE_PASSED", "DISPATCHED"];
// Deliberately not the STATUS_LABEL words - the header pill is the single place the status name appears.
const STAGE_LABELS = ["Create", "Pick", "Load", "Verify", "Gate pass", "Dispatch"];
const BLOCKED_STATUSES = ["HOLD", "QC_HOLD", "BULK", "REJECTED"];

export default function LoadingSheetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<LoadingSheet | null>(null);
  const [pickedPallets, setPickedPallets] = useState<PickedPallet[]>([]);
  const [allPallets, setAllPallets] = useState<PalletOption[]>([]);

  const [selectedPalletId, setSelectedPalletId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [pickState, setPickState] = useState<"idle" | "submitting">("idle");
  const [pickNotice, setPickNotice] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const [qcForm, setQcForm] = useState({ containerNumber: "", sealNumber: "", boltNumber: "" });
  const [gatePassNumber, setGatePassNumber] = useState("");

  const [actionState, setActionState] = useState<"idle" | "submitting">("idle");
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const [sheetRes, palletsRes] = await Promise.all([
        fetch(`/api/loading-sheets/${id}`),
        fetch("/api/pallets"),
      ]);
      const sheetBody = await sheetRes.json();
      if (!sheetRes.ok) throw new Error(sheetBody?.error ?? `Request failed (${sheetRes.status}).`);
      setSheet(sheetBody.loadingSheet as LoadingSheet);
      setPickedPallets(sheetBody.pallets as PickedPallet[]);
      if (palletsRes.ok) {
        const palletsBody = await palletsRes.json();
        setAllPallets(palletsBody.pallets as PalletOption[]);
      }
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this loading sheet.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const pickedPalletIds = useMemo(() => new Set(pickedPallets.map((p) => p.palletId)), [pickedPallets]);
  const eligiblePallets = useMemo(
    () =>
      allPallets
        .filter((p) => p.statusCode === "OK" && p.batchId !== null && !pickedPalletIds.has(p.id))
        .sort((a, b) => (a.productionDate ?? "").localeCompare(b.productionDate ?? "")),
    [allPallets, pickedPalletIds]
  );
  const selectedPallet = eligiblePallets.find((p) => p.id === selectedPalletId);
  const isFifoViolation = useMemo(() => {
    if (!selectedPallet?.productionDate) return false;
    return eligiblePallets.some(
      (p) => p.id !== selectedPallet.id && (p.productionDate ?? "") < selectedPallet.productionDate!
    );
  }, [selectedPallet, eligiblePallets]);

  async function handlePick(event: FormEvent) {
    event.preventDefault();
    setPickError(null);
    setPickNotice(null);
    if (!selectedPalletId) {
      setPickError("Select a pallet to pick.");
      return;
    }
    setPickState("submitting");
    try {
      const res = await fetch(`/api/loading-sheets/${id}/pallets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ palletId: selectedPalletId, overrideReason: overrideReason.trim() || null }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 503) setPickNotice(body.error);
        else setPickError(body.error ?? `Request failed (${res.status}).`);
        return;
      }
      setSelectedPalletId("");
      setOverrideReason("");
      await load();
    } catch {
      setPickError("Network error - could not reach the server.");
    } finally {
      setPickState("idle");
    }
  }

  async function runAction(path: string, body: unknown, successMessage?: string) {
    setActionState("submitting");
    setActionError(null);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/loading-sheets/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const responseBody = await res.json();
      if (!res.ok) {
        if (res.status === 503) setActionNotice(responseBody.error);
        else setActionError(responseBody.error ?? `Request failed (${res.status}).`);
        return;
      }
      if (successMessage) setActionNotice(successMessage);
      await load();
    } catch {
      setActionError("Network error - could not reach the server.");
    } finally {
      setActionState("idle");
    }
  }

  if (loadState === "loading") {
    return (
      <>
        <PageHeader breadcrumb="Operations / Dispatch & Loading" title="Loading..." />
        <div className="bg-canvas p-4 sm:p-6">
          <StateBox>Loading...</StateBox>
        </div>
      </>
    );
  }
  if (loadState === "error" || !sheet) {
    return (
      <>
        <PageHeader breadcrumb="Operations / Dispatch & Loading" title="Not found" />
        <div className="bg-canvas p-4 sm:p-6">
          <StateBox tone="danger">{loadError}</StateBox>
        </div>
      </>
    );
  }

  const canPick = sheet.status === "DRAFT" || sheet.status === "STAGING";
  const canQcApprove = sheet.exportDomestic === "EXPORT" && sheet.status !== "DISPATCHED";
  const canLoad = sheet.status === "STAGING";
  const canVerify = sheet.status === "LOADED";
  const canGatePass = sheet.status === "VERIFIED";
  const canDispatch = sheet.status === "GATE_PASSED";

  const blockedPallets = allPallets.filter((p) => BLOCKED_STATUSES.includes(p.statusCode));
  const totalCartons = pickedPallets.reduce((sum, p) => sum + p.cartonQty, 0);
  const totalKg = pickedPallets.reduce((sum, p) => sum + p.weightKg, 0);
  const stageIndex = STAGE_ORDER.indexOf(sheet.status);

  return (
    <>
      <PageHeader
        breadcrumb="Operations / Dispatch & Loading / Detail"
        title={sheet.loadingSheetNumber}
        actions={
          <Pill tone={statusTone(sheet.status)}>
            {STATUS_LABEL[sheet.status]}
            {sheet.exportDomestic === "EXPORT" ? " · Export" : ""}
          </Pill>
        }
      />
      <div className="flex flex-col gap-5 bg-canvas p-4 sm:p-6">
        <ol className="flex overflow-x-auto rounded-xl border border-line bg-white p-3 shadow-card" aria-label="Loading progress">
          {STAGE_LABELS.map((label, i) => {
            const done = i < stageIndex || sheet.status === "DISPATCHED";
            const on = i === stageIndex && sheet.status !== "DISPATCHED";
            return (
              <li key={label} className="flex min-w-[64px] flex-1 items-start">
                <div className="flex w-full flex-col items-center gap-1">
                  <span
                    className={
                      "flex h-7 w-7 items-center justify-center rounded-full border-[2.5px] text-[11px] font-extrabold " +
                      (done
                        ? "border-teal bg-teal-light text-teal"
                        : on
                          ? "border-gold bg-[#FFEDD5] text-gold"
                          : "border-[#CBD5E1] bg-[#F1F5F9] text-muted2")
                    }
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className="text-center text-[9px] font-extrabold uppercase tracking-wide text-muted2">{label}</span>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.15fr]">
          <div className="flex flex-col gap-5">
            {canPick ? (
              <Card title="FIFO Pick List" sub="OK / available pallets only · oldest production date first">
                <form className="flex flex-col gap-3" onSubmit={handlePick}>
                  <Field label="Pick an OK pallet (FIFO order - oldest first)">
                    <select
                      className={inputClass()}
                      value={selectedPalletId}
                      onChange={(e) => setSelectedPalletId(e.target.value)}
                    >
                      <option value="">Select a pallet...</option>
                      {eligiblePallets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.palletNumber} - {p.materialCode} - batch {p.batchNumber} ({p.productionDate})
                        </option>
                      ))}
                    </select>
                  </Field>
                  {isFifoViolation ? (
                    <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3">
                      <p className="mb-2 text-xs font-semibold text-[#92400E]">
                        ⚠ An older batch is still available - this pick needs a logged FIFO override reason.
                      </p>
                      <Field label="FIFO override reason (required - an older batch is still available)">
                        <input
                          className={inputClass()}
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                        />
                      </Field>
                    </div>
                  ) : null}
                  {pickNotice ? (
                    <p className="rounded-lg bg-warning-light p-3 text-xs font-semibold text-[#B45309]" role="status">
                      {pickNotice}
                    </p>
                  ) : null}
                  {pickError ? (
                    <p className="rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                      {pickError}
                    </p>
                  ) : null}
                  <button type="submit" disabled={pickState === "submitting"} className={btn("teal", "w-full")}>
                    {pickState === "submitting" ? "Picking..." : "Pick pallet"}
                  </button>
                </form>
              </Card>
            ) : null}

            {canPick && blockedPallets.length > 0 ? (
              <section className="rounded-xl border-[1.5px] border-dashed border-[#FCA5A5] bg-white p-4 shadow-card">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-danger">
                  Auto-blocked — not selectable ({blockedPallets.length})
                </div>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {blockedPallets.slice(0, 6).map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-1.5">
                      <span className="font-extrabold text-danger">✗</span>
                      <span className="text-ink2">batch {p.batchNumber ?? "-"}</span>
                      <Pill tone={statusTone(p.statusCode)}>{p.statusCode}</Pill>
                      <span className="text-muted2">· {p.totalCartons} bx</span>
                    </li>
                  ))}
                </ul>
                {blockedPallets.length > 6 ? (
                  <div className="mt-1.5 text-[11px] text-muted2">+ {blockedPallets.length - 6} more</div>
                ) : null}
              </section>
            ) : null}

            {canQcApprove ? (
              <Card title="QC container approval (Export)" accentColor="#7C3AED">
                {sheet.qcApprovalAt ? (
                  <p className="text-xs font-semibold text-success">✓ Approved at {sheet.qcApprovalAt}</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field label="Container number">
                      <input
                        className={inputClass()}
                        value={qcForm.containerNumber}
                        onChange={(e) => setQcForm({ ...qcForm, containerNumber: e.target.value })}
                      />
                    </Field>
                    <Field label="Seal number">
                      <input
                        className={inputClass()}
                        value={qcForm.sealNumber}
                        onChange={(e) => setQcForm({ ...qcForm, sealNumber: e.target.value })}
                      />
                    </Field>
                    <Field label="Bolt number">
                      <input
                        className={inputClass()}
                        value={qcForm.boltNumber}
                        onChange={(e) => setQcForm({ ...qcForm, boltNumber: e.target.value })}
                      />
                    </Field>
                    <div className="sm:col-span-3">
                      <button type="button" onClick={() => runAction("qc-approve", qcForm)} className={btn("teal", "w-full sm:w-auto")}>
                        Approve container
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            ) : null}
          </div>

          <section className="relative overflow-hidden rounded-xl border-[1.5px] border-[#CBD5E1] bg-white p-4 shadow-card sm:p-5">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-navy-3 to-teal" />
            <div className="mb-3 flex items-end justify-between border-b-[2.5px] border-navy pb-2.5">
              <div>
                <h2 className="text-base font-extrabold tracking-[2px] text-navy">LOADING SHEET</h2>
                <div className="text-[11px] font-bold text-muted">{sheet.exportDomestic}</div>
              </div>
              <div className="text-right text-[11px] font-bold text-muted">{sheet.date}</div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <Detail label="Vehicle" value={sheet.vehicleNumber} />
              <Detail label="Driver" value={sheet.driverName} />
              <Detail label="Party" value={sheet.partyName} />
              <Detail label="Destination" value={sheet.destination} />
              {sheet.transporter ? <Detail label="Transporter" value={sheet.transporter} /> : null}
              <Detail label="Temperature" value={`${sheet.temperatureC} C`} />
              {sheet.containerNumber ? <Detail label="Container" value={sheet.containerNumber} /> : null}
              {sheet.sealNumber ? <Detail label="Seal / Bolt" value={`${sheet.sealNumber} · ${sheet.boltNumber ?? "-"}`} /> : null}
              {sheet.gatePassNumber ? <Detail label="Gate pass" value={sheet.gatePassNumber} /> : null}
            </dl>

            <div className="mt-4">
              <TableWrap minWidth={560}>
                <table className={tableCls}>
                  <thead>
                    <tr>
                      <th className={thCls}>#</th>
                      <th className={thCls}>Pallet</th>
                      <th className={thCls}>Material</th>
                      <th className={thCls}>Batch</th>
                      <th className={thCls + " text-right"}>Cartons</th>
                      <th className={thCls + " text-right"}>kg</th>
                      <th className={thCls}>FIFO override</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickedPallets.map((p) => (
                      <tr key={p.id} className={trCls + (p.fifoOverrideReason ? " bg-[#FFFBEB]" : "")}>
                        <td className={tdCls + " text-muted"}>{p.loadingSequence}</td>
                        <td className={tdCls + " font-bold text-ink"}>{p.palletNumber}</td>
                        <td className={tdCls}>{p.materialCode}</td>
                        <td className={tdCls}>{p.batchNumber}</td>
                        <td className={tdCls + " text-right"}>{p.cartonQty}</td>
                        <td className={tdCls + " text-right text-muted"}>{p.weightKg}</td>
                        <td className={tdCls + " text-xs italic text-[#92400E]"}>{p.fifoOverrideReason ?? ""}</td>
                      </tr>
                    ))}
                    {pickedPallets.length === 0 ? (
                      <tr>
                        <td colSpan={7} className={tdCls + " text-center text-muted"}>
                          No pallets picked yet.
                        </td>
                      </tr>
                    ) : (
                      <tr className="bg-[#F8FAFC]">
                        <td colSpan={4} className={tdCls + " text-right font-extrabold text-ink"}>
                          TOTAL · {pickedPallets.length} pallet(s)
                        </td>
                        <td className={tdCls + " text-right font-extrabold text-ink"}>{totalCartons}</td>
                        <td className={tdCls + " text-right font-extrabold text-ink"}>{totalKg}</td>
                        <td className={tdCls}></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TableWrap>
            </div>

            <div className="mt-4 border-t border-dashed border-[#CBD5E1] pt-4">
              <div className="flex flex-wrap gap-3">
                {canLoad ? (
                  <button
                    type="button"
                    disabled={actionState === "submitting"}
                    onClick={() => runAction("load", {})}
                    className={btn("teal", "flex-1")}
                  >
                    Mark Loaded
                  </button>
                ) : null}
                {canVerify ? (
                  <button
                    type="button"
                    disabled={actionState === "submitting"}
                    onClick={() => runAction("verify", {})}
                    className={btn("teal", "flex-1")}
                  >
                    Verify
                  </button>
                ) : null}
                {canGatePass ? (
                  <div className="flex min-w-[240px] flex-1 gap-2">
                    <input
                      className={inputClass() + " flex-1"}
                      placeholder="Gate pass number"
                      value={gatePassNumber}
                      onChange={(e) => setGatePassNumber(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={actionState === "submitting"}
                      onClick={() => runAction("gate-pass", { gatePassNumber })}
                      className={btn("primary")}
                    >
                      Record Gate Pass
                    </button>
                  </div>
                ) : null}
                {canDispatch ? (
                  <button
                    type="button"
                    disabled={actionState === "submitting"}
                    onClick={() => runAction("dispatch", {}, "Dispatched.")}
                    className={btn("primary", "flex-1")}
                  >
                    Dispatch
                  </button>
                ) : null}
                {sheet.status === "DISPATCHED" ? (
                  <p className="w-full rounded-lg bg-success-light p-3 text-sm font-semibold text-success">
                    Dispatched - stock deducted, this loading sheet is now immutable.
                  </p>
                ) : null}
              </div>
              {actionNotice ? (
                <p className="mt-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-[#B45309]" role="status">
                  {actionNotice}
                </p>
              ) : null}
              {actionError ? (
                <p className="mt-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                  {actionError}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-muted2">{label}</dt>
      <dd className="font-bold text-ink">{value}</dd>
    </div>
  );
}
