"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, Field, Note, Pill, type PillTone, StatTile, StateBox, btn, inputClass } from "@/components/ui";

type WarehouseOption = { id: string; code: string; name: string; type: string };

type TransferOrderRow = {
  id: string;
  transferNumber: string;
  sourceWarehouseCode: string;
  destinationWarehouseCode: string | null;
  transferType: "NORMAL" | "HOLD_TAG" | "BULK_TAG";
  vehicleNumber: string | null;
  status: "DRAFT" | "PICKED" | "LOADED" | "IN_TRANSIT" | "RECEIVED" | "COMPLETED" | "CANCELLED";
  palletCount: number;
  totalCartons: number;
};

type LoadState = "loading" | "ready" | "error";

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  sourceWarehouseId: "",
  destinationWarehouseId: "",
  transferType: "NORMAL" as "NORMAL" | "HOLD_TAG" | "BULK_TAG",
};

const STATUS_LABEL: Record<TransferOrderRow["status"], string> = {
  DRAFT: "Draft",
  PICKED: "Picked",
  LOADED: "Loaded",
  IN_TRANSIT: "In transit",
  RECEIVED: "Received",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
const STATUS_TONE: Record<TransferOrderRow["status"], PillTone> = {
  DRAFT: "neutral",
  PICKED: "hold",
  LOADED: "hold",
  IN_TRANSIT: "transit",
  RECEIVED: "qc",
  COMPLETED: "ok",
  CANCELLED: "rejected",
};
const TYPE_CHIP: Record<TransferOrderRow["transferType"], string> = {
  NORMAL: "bg-[#E0F2F1] text-[#0F766E]",
  HOLD_TAG: "bg-[#FFEDD5] text-[#C2410C]",
  BULK_TAG: "bg-[#EDE9FE] text-[#6D28D9]",
};
const TYPE_LABEL: Record<TransferOrderRow["transferType"], string> = {
  NORMAL: "Normal",
  HOLD_TAG: "Hold tag",
  BULK_TAG: "Bulk tag",
};

export default function TransfersPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orders, setOrders] = useState<TransferOrderRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);

  async function loadAll() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const [ordersRes, warehousesRes] = await Promise.all([
        fetch("/api/transfer-orders"),
        fetch("/api/masters/warehouses"),
      ]);
      const ordersBody = await ordersRes.json();
      if (!ordersRes.ok) throw new Error(ordersBody?.error ?? "Could not load transfer orders.");
      setOrders(ordersBody.transferOrders as TransferOrderRow[]);
      if (warehousesRes.ok) {
        const warehousesBody = await warehousesRes.json();
        setWarehouses(warehousesBody.warehouses as WarehouseOption[]);
      }
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load transfer orders.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitNotice(null);
    if (!form.sourceWarehouseId || !form.destinationWarehouseId) {
      setSubmitError("Pick both a source and a destination warehouse.");
      return;
    }
    if (form.sourceWarehouseId === form.destinationWarehouseId) {
      setSubmitError("Source and destination warehouse must be different.");
      return;
    }
    setSubmitState("submitting");
    try {
      const res = await fetch("/api/transfer-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 503) setSubmitNotice(body.error);
        else setSubmitError(body.error ?? `Request failed (${res.status}).`);
        return;
      }
      setForm({ ...EMPTY_FORM, date: form.date });
      await loadAll();
    } catch {
      setSubmitError("Network error - could not reach the server.");
    } finally {
      setSubmitState("idle");
    }
  }

  const inPrep = orders.filter((o) => o.status === "DRAFT" || o.status === "PICKED" || o.status === "LOADED").length;
  const inTransit = orders.filter((o) => o.status === "IN_TRANSIT").length;
  const received = orders.filter((o) => o.status === "RECEIVED").length;
  const completed = orders.filter((o) => o.status === "COMPLETED").length;

  return (
    <>
      <PageHeader breadcrumb="Operations / Transfers" title="Inter-Warehouse Transfers" />
      <div className="flex flex-col gap-5 bg-canvas p-4 sm:p-6">
        {loadState === "ready" && orders.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile color="#D97706" label="In preparation" value={inPrep} sub="draft / picked / loaded" />
            <StatTile color="#2563EB" label="In transit" value={inTransit} sub="on the road" />
            <StatTile color="#7C3AED" label="Received" value={received} sub="awaiting close" />
            <StatTile color="#059669" label="Completed" value={completed} sub="archived" />
          </div>
        ) : null}

        <Card title="New transfer order" sub="batch + pallet IDs stay the same across warehouses">
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={handleSubmit}>
            <Field label="Date">
              <input
                type="date"
                className={inputClass()}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label="Transfer type">
              <select
                className={inputClass()}
                value={form.transferType}
                onChange={(e) => setForm({ ...form, transferType: e.target.value as typeof form.transferType })}
              >
                <option value="NORMAL">Normal (released/OK)</option>
                <option value="HOLD_TAG">Hold tag (HOLD material)</option>
                <option value="BULK_TAG">Bulk tag (BULK material)</option>
              </select>
            </Field>
            <Field label="Source warehouse">
              <select
                className={inputClass()}
                value={form.sourceWarehouseId}
                onChange={(e) => setForm({ ...form, sourceWarehouseId: e.target.value })}
              >
                <option value="">Select...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} - {w.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Destination warehouse">
              <select
                className={inputClass()}
                value={form.destinationWarehouseId}
                onChange={(e) => setForm({ ...form, destinationWarehouseId: e.target.value })}
              >
                <option value="">Select...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} - {w.name} ({w.type})
                  </option>
                ))}
              </select>
            </Field>

            <div className="sm:col-span-2 lg:col-span-4">
              {submitNotice ? (
                <p className="mb-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-[#B45309]" role="status">
                  {submitNotice}
                </p>
              ) : null}
              {submitError ? (
                <p className="mb-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                  {submitError}
                </p>
              ) : null}
              <button type="submit" disabled={submitState === "submitting"} className={btn("teal", "w-full sm:w-auto")}>
                {submitState === "submitting" ? "Creating..." : "Create draft transfer order"}
              </button>
            </div>
          </form>
        </Card>

        <section>
          <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-widest text-muted2">Existing transfer orders</h2>
          {loadState === "loading" ? (
            <StateBox>Loading...</StateBox>
          ) : loadState === "error" ? (
            <StateBox tone="danger">{loadError}</StateBox>
          ) : orders.length === 0 ? (
            <StateBox>No transfer orders yet.</StateBox>
          ) : (
            <ul className="flex flex-col gap-3">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/transfers/${o.id}`}
                    className="grid min-h-[64px] grid-cols-1 gap-2 rounded-xl border border-line bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-teal sm:grid-cols-[1.1fr_1.4fr_1fr_auto] sm:items-center"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-ink">{o.transferNumber}</span>
                      <span className={"rounded-md px-2 py-0.5 text-[10px] font-extrabold " + TYPE_CHIP[o.transferType]}>
                        {TYPE_LABEL[o.transferType]}
                      </span>
                    </div>
                    <div className="text-xs">
                      <span className="font-bold text-ink2">{o.sourceWarehouseCode}</span>
                      <span className="mx-1.5 text-teal">&rarr;</span>
                      <span className="font-bold text-ink2">{o.destinationWarehouseCode ?? "?"}</span>
                      {o.vehicleNumber ? <span className="text-muted2">{` - vehicle ${o.vehicleNumber}`}</span> : null}
                    </div>
                    <div className="text-xs text-ink2">
                      <b className="text-ink">{o.totalCartons}</b> cartons · {o.palletCount} pallet(s)
                    </div>
                    <div className="sm:text-right">
                      <Pill tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Pill>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Note>
          HOLD tag → the receiving warehouse gets the material in HOLD status and must re-inspect it before it becomes
          dispatchable. Pallet ID and batch stay the same — full traceability.
        </Note>
      </div>
    </>
  );
}
