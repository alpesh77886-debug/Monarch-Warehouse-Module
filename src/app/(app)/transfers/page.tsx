"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

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
const STATUS_STYLE: Record<TransferOrderRow["status"], string> = {
  DRAFT: "bg-line text-muted",
  PICKED: "bg-warning-light text-warning",
  LOADED: "bg-warning-light text-warning",
  IN_TRANSIT: "bg-sky-light text-sky",
  RECEIVED: "bg-accent-light text-accent",
  COMPLETED: "bg-success-light text-success",
  CANCELLED: "bg-danger-light text-danger",
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

  return (
    <>
      <PageHeader breadcrumb="Home / Transfers" title="Inter-Warehouse Transfers" />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-sm font-bold text-navy">New transfer order</h2>
          <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
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

            <div className="sm:col-span-2">
              {submitNotice ? (
                <p className="mb-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-warning" role="status">
                  {submitNotice}
                </p>
              ) : null}
              {submitError ? (
                <p className="mb-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                  {submitError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={submitState === "submitting"}
                className="min-h-[48px] w-full rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
              >
                {submitState === "submitting" ? "Creating..." : "Create draft transfer order"}
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold text-navy">Existing transfer orders</h2>
          {loadState === "loading" ? (
            <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">Loading...</div>
          ) : loadState === "error" ? (
            <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
              {loadError}
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
              No transfer orders yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/transfers/${o.id}`}
                    className="flex min-h-[64px] flex-col justify-center rounded-xl border border-line bg-white p-4 shadow-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-navy">{o.transferNumber}</span>
                      <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + STATUS_STYLE[o.status]}>
                        {STATUS_LABEL[o.status]} · {TYPE_LABEL[o.transferType]}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {o.sourceWarehouseCode} &rarr; {o.destinationWarehouseCode ?? "?"}
                      {o.vehicleNumber ? ` - vehicle ${o.vehicleNumber}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {o.palletCount} pallet(s), {o.totalCartons} cartons
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
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
