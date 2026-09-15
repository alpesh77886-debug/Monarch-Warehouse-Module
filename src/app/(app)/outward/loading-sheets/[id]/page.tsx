"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";

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
        <PageHeader breadcrumb="Home / Outward / Loading Sheets" title="Loading..." />
        <div className="p-4 sm:p-6">
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">Loading...</div>
        </div>
      </>
    );
  }
  if (loadState === "error" || !sheet) {
    return (
      <>
        <PageHeader breadcrumb="Home / Outward / Loading Sheets" title="Not found" />
        <div className="p-4 sm:p-6">
          <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
            {loadError}
          </div>
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

  return (
    <>
      <PageHeader breadcrumb="Home / Outward / Loading Sheets" title={sheet.loadingSheetNumber} />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy">Header</h2>
            <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-bold text-navy">
              {STATUS_LABEL[sheet.status]}
              {sheet.exportDomestic === "EXPORT" ? " · Export" : ""}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Detail label="Date" value={sheet.date} />
            <Detail label="Vehicle" value={sheet.vehicleNumber} />
            <Detail label="Driver" value={sheet.driverName} />
            <Detail label="Party" value={sheet.partyName} />
            <Detail label="Destination" value={sheet.destination} />
            <Detail label="Temperature" value={`${sheet.temperatureC} C`} />
            {sheet.containerNumber ? <Detail label="Container" value={sheet.containerNumber} /> : null}
            {sheet.gatePassNumber ? <Detail label="Gate pass" value={sheet.gatePassNumber} /> : null}
          </dl>
        </section>

        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-sm font-bold text-navy">Picked pallets ({pickedPallets.length})</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="text-muted2">
                <tr>
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">Pallet</th>
                  <th className="py-1 pr-2">Material</th>
                  <th className="py-1 pr-2">Batch</th>
                  <th className="py-1 pr-2">Cartons</th>
                  <th className="py-1 pr-2">FIFO override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pickedPallets.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-2">{p.loadingSequence}</td>
                    <td className="py-2 pr-2 font-bold text-navy">{p.palletNumber}</td>
                    <td className="py-2 pr-2">{p.materialCode}</td>
                    <td className="py-2 pr-2">{p.batchNumber}</td>
                    <td className="py-2 pr-2">{p.cartonQty}</td>
                    <td className="py-2 pr-2">{p.fifoOverrideReason ?? ""}</td>
                  </tr>
                ))}
                {pickedPallets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-3 text-muted">
                      No pallets picked yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {canPick ? (
            <form className="mt-4 flex flex-col gap-3 border-t border-line pt-4" onSubmit={handlePick}>
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
                <Field label="FIFO override reason (required - an older batch is still available)">
                  <input
                    className={inputClass()}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                  />
                </Field>
              ) : null}
              {pickNotice ? (
                <p className="rounded-lg bg-warning-light p-3 text-xs font-semibold text-warning" role="status">
                  {pickNotice}
                </p>
              ) : null}
              {pickError ? (
                <p className="rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                  {pickError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={pickState === "submitting"}
                className="min-h-[48px] w-full rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
              >
                {pickState === "submitting" ? "Picking..." : "Pick pallet"}
              </button>
            </form>
          ) : null}
        </section>

        {canQcApprove ? (
          <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
            <h2 className="text-sm font-bold text-navy">QC container approval (Export)</h2>
            {sheet.qcApprovalAt ? (
              <p className="mt-2 text-xs text-success">Approved at {sheet.qcApprovalAt}</p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                  <button
                    type="button"
                    onClick={() => runAction("qc-approve", qcForm)}
                    className="min-h-[48px] w-full rounded-lg bg-teal px-4 text-sm font-bold text-white sm:w-auto"
                  >
                    Approve container
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : null}

        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-sm font-bold text-navy">Actions</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {canLoad ? (
              <button
                type="button"
                disabled={actionState === "submitting"}
                onClick={() => runAction("load", {})}
                className="min-h-[48px] rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                Mark Loaded
              </button>
            ) : null}
            {canVerify ? (
              <button
                type="button"
                disabled={actionState === "submitting"}
                onClick={() => runAction("verify", {})}
                className="min-h-[48px] rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                Verify
              </button>
            ) : null}
            {canGatePass ? (
              <div className="flex flex-1 min-w-[240px] gap-2">
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
                  className="min-h-[48px] rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
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
                className="min-h-[48px] rounded-lg bg-success px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                Dispatch
              </button>
            ) : null}
            {sheet.status === "DISPATCHED" ? (
              <p className="text-sm font-semibold text-success">
                Dispatched - stock deducted, this loading sheet is now immutable.
              </p>
            ) : null}
          </div>
          {actionNotice ? (
            <p className="mt-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-warning" role="status">
              {actionNotice}
            </p>
          ) : null}
          {actionError ? (
            <p className="mt-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
              {actionError}
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted2">{label}</dt>
      <dd className="font-semibold text-navy">{value}</dd>
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
