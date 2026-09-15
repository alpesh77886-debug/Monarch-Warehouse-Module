"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";

type TransferOrder = {
  id: string;
  transferNumber: string;
  sourceWarehouseId: string;
  sourceWarehouseCode: string | null;
  destinationWarehouseId: string;
  destinationWarehouseCode: string | null;
  destinationWarehouseType: string | null;
  transferType: "NORMAL" | "HOLD_TAG" | "BULK_TAG";
  vehicleNumber: string | null;
  driverName: string | null;
  transporter: string | null;
  temperatureC: number | null;
  lrNumber: string | null;
  status: "DRAFT" | "PICKED" | "LOADED" | "IN_TRANSIT" | "RECEIVED" | "COMPLETED" | "CANCELLED";
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
};

type PalletOption = {
  id: string;
  palletNumber: string;
  materialCode: string;
  statusCode: string;
  currentWarehouseId: string;
  batchNumber: string | null;
};

type LoadState = "loading" | "ready" | "error";

const REQUIRED_STATUS: Record<TransferOrder["transferType"], string> = {
  NORMAL: "OK",
  HOLD_TAG: "HOLD",
  BULK_TAG: "BULK",
};

const STATUS_LABEL: Record<TransferOrder["status"], string> = {
  DRAFT: "Draft",
  PICKED: "Picked",
  LOADED: "Loaded",
  IN_TRANSIT: "In transit",
  RECEIVED: "Received",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default function TransferOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [order, setOrder] = useState<TransferOrder | null>(null);
  const [pickedPallets, setPickedPallets] = useState<PickedPallet[]>([]);
  const [allPallets, setAllPallets] = useState<PalletOption[]>([]);

  const [selectedPalletId, setSelectedPalletId] = useState("");
  const [pickState, setPickState] = useState<"idle" | "submitting">("idle");
  const [pickNotice, setPickNotice] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const [loadForm, setLoadForm] = useState({ vehicleNumber: "", driverName: "", transporter: "", lrNumber: "" });

  const [actionState, setActionState] = useState<"idle" | "submitting">("idle");
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const [orderRes, palletsRes] = await Promise.all([
        fetch(`/api/transfer-orders/${id}`),
        fetch("/api/pallets"),
      ]);
      const orderBody = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderBody?.error ?? `Request failed (${orderRes.status}).`);
      setOrder(orderBody.transferOrder as TransferOrder);
      setPickedPallets(orderBody.pallets as PickedPallet[]);
      if (palletsRes.ok) {
        const palletsBody = await palletsRes.json();
        setAllPallets(palletsBody.pallets as PalletOption[]);
      }
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this transfer order.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const pickedPalletIds = useMemo(() => new Set(pickedPallets.map((p) => p.palletId)), [pickedPallets]);
  const eligiblePallets = useMemo(() => {
    if (!order) return [];
    const requiredStatus = REQUIRED_STATUS[order.transferType];
    return allPallets.filter(
      (p) =>
        p.statusCode === requiredStatus &&
        p.currentWarehouseId === order.sourceWarehouseId &&
        p.batchNumber !== null &&
        !pickedPalletIds.has(p.id)
    );
  }, [allPallets, pickedPalletIds, order]);

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
      const res = await fetch(`/api/transfer-orders/${id}/pallets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ palletId: selectedPalletId }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 503) setPickNotice(body.error);
        else setPickError(body.error ?? `Request failed (${res.status}).`);
        return;
      }
      setSelectedPalletId("");
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
      const res = await fetch(`/api/transfer-orders/${id}/${path}`, {
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
        <PageHeader breadcrumb="Home / Transfers" title="Loading..." />
        <div className="p-4 sm:p-6">
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">Loading...</div>
        </div>
      </>
    );
  }
  if (loadState === "error" || !order) {
    return (
      <>
        <PageHeader breadcrumb="Home / Transfers" title="Not found" />
        <div className="p-4 sm:p-6">
          <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
            {loadError}
          </div>
        </div>
      </>
    );
  }

  const canPick = order.status === "DRAFT" || order.status === "PICKED";
  const canLoad = order.status === "PICKED";
  const canDispatch = order.status === "LOADED";
  const canReceive = order.status === "IN_TRANSIT";
  const canComplete = order.status === "RECEIVED";

  return (
    <>
      <PageHeader breadcrumb="Home / Transfers" title={order.transferNumber} />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy">Header</h2>
            <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-bold text-navy">
              {STATUS_LABEL[order.status]} · {order.transferType}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Detail label="Source" value={order.sourceWarehouseCode ?? "?"} />
            <Detail label="Destination" value={`${order.destinationWarehouseCode ?? "?"} (${order.destinationWarehouseType ?? "?"})`} />
            {order.vehicleNumber ? <Detail label="Vehicle" value={order.vehicleNumber} /> : null}
            {order.driverName ? <Detail label="Driver" value={order.driverName} /> : null}
            {order.lrNumber ? <Detail label="LR number" value={order.lrNumber} /> : null}
          </dl>
          {order.transferType !== "NORMAL" ? (
            <p className="mt-3 rounded-lg bg-accent-light p-3 text-xs font-semibold text-accent">
              {order.transferType === "HOLD_TAG"
                ? "Hold tag transfer - material keeps HOLD status throughout; the receiving warehouse's own QC must release it before it can dispatch (INV-017)."
                : "Bulk tag transfer - material keeps BULK status throughout; the receiving warehouse must arrange repacking."}
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-sm font-bold text-navy">Picked pallets ({pickedPallets.length})</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="text-muted2">
                <tr>
                  <th className="py-1 pr-2">Pallet</th>
                  <th className="py-1 pr-2">Material</th>
                  <th className="py-1 pr-2">Batch</th>
                  <th className="py-1 pr-2">Cartons</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pickedPallets.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-2 font-bold text-navy">{p.palletNumber}</td>
                    <td className="py-2 pr-2">{p.materialCode}</td>
                    <td className="py-2 pr-2">{p.batchNumber}</td>
                    <td className="py-2 pr-2">{p.cartonQty}</td>
                  </tr>
                ))}
                {pickedPallets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-3 text-muted">
                      No pallets picked yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {canPick ? (
            <form className="mt-4 flex flex-col gap-3 border-t border-line pt-4" onSubmit={handlePick}>
              <Field label={`Pick a ${REQUIRED_STATUS[order.transferType]}-status pallet from the source warehouse`}>
                <select
                  className={inputClass()}
                  value={selectedPalletId}
                  onChange={(e) => setSelectedPalletId(e.target.value)}
                >
                  <option value="">Select a pallet...</option>
                  {eligiblePallets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.palletNumber} - {p.materialCode} - batch {p.batchNumber}
                    </option>
                  ))}
                </select>
              </Field>
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

        {canLoad ? (
          <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
            <h2 className="text-sm font-bold text-navy">Vehicle loading</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Vehicle number">
                <input
                  className={inputClass()}
                  value={loadForm.vehicleNumber}
                  onChange={(e) => setLoadForm({ ...loadForm, vehicleNumber: e.target.value })}
                />
              </Field>
              <Field label="Driver name">
                <input
                  className={inputClass()}
                  value={loadForm.driverName}
                  onChange={(e) => setLoadForm({ ...loadForm, driverName: e.target.value })}
                />
              </Field>
              <Field label="Transporter (optional)">
                <input
                  className={inputClass()}
                  value={loadForm.transporter}
                  onChange={(e) => setLoadForm({ ...loadForm, transporter: e.target.value })}
                />
              </Field>
              <Field label="LR number (optional, 3PL)">
                <input
                  className={inputClass()}
                  value={loadForm.lrNumber}
                  onChange={(e) => setLoadForm({ ...loadForm, lrNumber: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() =>
                    runAction("load", {
                      vehicleNumber: loadForm.vehicleNumber,
                      driverName: loadForm.driverName,
                      transporter: loadForm.transporter || null,
                      lrNumber: loadForm.lrNumber || null,
                    })
                  }
                  className="min-h-[48px] w-full rounded-lg bg-teal px-4 text-sm font-bold text-white sm:w-auto"
                >
                  Confirm loading
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-sm font-bold text-navy">Actions</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {canDispatch ? (
              <button
                type="button"
                disabled={actionState === "submitting"}
                onClick={() => runAction("dispatch", {})}
                className="min-h-[48px] rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                Dispatch (mark in transit)
              </button>
            ) : null}
            {canReceive ? (
              <button
                type="button"
                disabled={actionState === "submitting"}
                onClick={() => runAction("receive", {})}
                className="min-h-[48px] rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                Receive at destination
              </button>
            ) : null}
            {canComplete ? (
              <button
                type="button"
                disabled={actionState === "submitting"}
                onClick={() => runAction("complete", {}, "Transfer completed.")}
                className="min-h-[48px] rounded-lg bg-success px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                Complete transfer
              </button>
            ) : null}
            {order.status === "COMPLETED" ? (
              <p className="text-sm font-semibold text-success">Completed - this transfer order is now archived.</p>
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
