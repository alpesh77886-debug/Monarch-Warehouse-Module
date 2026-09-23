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

const STAGE_ORDER: TransferOrder["status"][] = ["DRAFT", "PICKED", "LOADED", "IN_TRANSIT", "RECEIVED", "COMPLETED"];
// Deliberately not the STATUS_LABEL words - the header pill is the single place the status name appears.
const STAGE_LABELS = ["Create", "Pick", "Load", "Dispatch", "Receive", "Close"];

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
        <PageHeader breadcrumb="Operations / Transfers" title="Loading..." />
        <div className="bg-canvas p-4 sm:p-6">
          <StateBox>Loading...</StateBox>
        </div>
      </>
    );
  }
  if (loadState === "error" || !order) {
    return (
      <>
        <PageHeader breadcrumb="Operations / Transfers" title="Not found" />
        <div className="bg-canvas p-4 sm:p-6">
          <StateBox tone="danger">{loadError}</StateBox>
        </div>
      </>
    );
  }

  const canPick = order.status === "DRAFT" || order.status === "PICKED";
  const canLoad = order.status === "PICKED";
  const canDispatch = order.status === "LOADED";
  const canReceive = order.status === "IN_TRANSIT";
  const canComplete = order.status === "RECEIVED";
  const stageIndex = STAGE_ORDER.indexOf(order.status);
  const totalCartons = pickedPallets.reduce((sum, p) => sum + p.cartonQty, 0);

  return (
    <>
      <PageHeader
        breadcrumb="Operations / Transfers / Detail"
        title={order.transferNumber}
        actions={
          <Pill tone={statusTone(order.status)}>
            {STATUS_LABEL[order.status]} · {order.transferType}
          </Pill>
        }
      />
      <div className="flex flex-col gap-5 bg-canvas p-4 sm:p-6">
        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted2">Source</div>
              <div className="text-base font-extrabold text-ink">{order.sourceWarehouseCode ?? "?"}</div>
            </div>
            <div className="text-2xl text-teal">⇄</div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted2">Destination</div>
              <div className="text-base font-extrabold text-ink">
                {`${order.destinationWarehouseCode ?? "?"} (${order.destinationWarehouseType ?? "?"})`}
              </div>
            </div>
          </div>
          {order.vehicleNumber || order.driverName || order.lrNumber ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs sm:grid-cols-4">
              {order.vehicleNumber ? <Detail label="Vehicle" value={order.vehicleNumber} /> : null}
              {order.driverName ? <Detail label="Driver" value={order.driverName} /> : null}
              {order.transporter ? <Detail label="Transporter" value={order.transporter} /> : null}
              {order.lrNumber ? <Detail label="LR number" value={order.lrNumber} /> : null}
            </dl>
          ) : null}

          <ol className="mt-4 flex overflow-x-auto" aria-label="Transfer progress">
            {STAGE_LABELS.map((label, i) => {
              const done = i < stageIndex || order.status === "COMPLETED";
              const on = i === stageIndex && order.status !== "COMPLETED";
              return (
                <li key={label} className="flex min-w-[60px] flex-1 flex-col items-center gap-1">
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
                </li>
              );
            })}
          </ol>

          {order.transferType !== "NORMAL" ? (
            <p
              className={
                "mt-4 rounded-lg border-l-4 p-3 text-xs font-semibold " +
                (order.transferType === "HOLD_TAG"
                  ? "border-[#FDBA74] bg-[#FFEDD5]/60 text-[#C2410C]"
                  : "border-accent bg-accent-light text-accent")
              }
            >
              {order.transferType === "HOLD_TAG"
                ? "Hold tag transfer - material keeps HOLD status throughout; the receiving warehouse's own QC must release it before it can dispatch (INV-017)."
                : "Bulk tag transfer - material keeps BULK status throughout; the receiving warehouse must arrange repacking."}
            </p>
          ) : null}
        </section>

        <Card
          title={`Picked pallets (${pickedPallets.length})`}
          sub={pickedPallets.length > 0 ? `${totalCartons} cartons` : undefined}
          bodyClassName="px-4 pb-4 pt-1"
        >
          <TableWrap minWidth={520}>
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Pallet</th>
                  <th className={thCls}>Material</th>
                  <th className={thCls}>Batch</th>
                  <th className={thCls + " text-right"}>Cartons</th>
                </tr>
              </thead>
              <tbody>
                {pickedPallets.map((p) => (
                  <tr key={p.id} className={trCls}>
                    <td className={tdCls + " font-bold text-ink"}>{p.palletNumber}</td>
                    <td className={tdCls}>{p.materialCode}</td>
                    <td className={tdCls}>{p.batchNumber}</td>
                    <td className={tdCls + " text-right"}>{p.cartonQty}</td>
                  </tr>
                ))}
                {pickedPallets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={tdCls + " text-center text-muted"}>
                      No pallets picked yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </TableWrap>

          {canPick ? (
            <form
              className="mt-4 flex flex-col gap-3 rounded-xl border-[1.5px] border-dashed border-[#CBD5E1] bg-[#FAFBFC] p-4"
              onSubmit={handlePick}
            >
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
                <p className="rounded-lg bg-warning-light p-3 text-xs font-semibold text-[#B45309]" role="status">
                  {pickNotice}
                </p>
              ) : null}
              {pickError ? (
                <p className="rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                  {pickError}
                </p>
              ) : null}
              <button type="submit" disabled={pickState === "submitting"} className={btn("teal", "w-full sm:w-auto")}>
                {pickState === "submitting" ? "Picking..." : "Pick pallet"}
              </button>
            </form>
          ) : null}
        </Card>

        {canLoad ? (
          <Card title="Vehicle loading">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              <div className="sm:col-span-2 lg:col-span-4">
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
                  className={btn("teal", "w-full sm:w-auto")}
                >
                  Confirm loading
                </button>
              </div>
            </div>
          </Card>
        ) : null}

        {canDispatch || canReceive || canComplete || order.status === "COMPLETED" || actionNotice || actionError ? (
          <Card title="Actions">
            <div className="flex flex-wrap gap-3">
              {canDispatch ? (
                <button
                  type="button"
                  disabled={actionState === "submitting"}
                  onClick={() => runAction("dispatch", {})}
                  className={btn("primary")}
                >
                  Dispatch (mark in transit)
                </button>
              ) : null}
              {canReceive ? (
                <button
                  type="button"
                  disabled={actionState === "submitting"}
                  onClick={() => runAction("receive", {})}
                  className={btn("teal")}
                >
                  Receive at destination
                </button>
              ) : null}
              {canComplete ? (
                <button
                  type="button"
                  disabled={actionState === "submitting"}
                  onClick={() => runAction("complete", {}, "Transfer completed.")}
                  className={btn("teal")}
                >
                  Complete transfer
                </button>
              ) : null}
              {order.status === "COMPLETED" ? (
                <p className="w-full rounded-lg bg-success-light p-3 text-sm font-semibold text-success">
                  Completed - this transfer order is now archived.
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
          </Card>
        ) : null}
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
