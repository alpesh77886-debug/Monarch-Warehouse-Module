"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";

type ReceivingSheet = {
  id: string;
  sheetNumber: string;
  date: string;
  shift: "A" | "B" | "C";
  line: "FF" | "SPECIALITY";
  materialId: string;
  materialCode: string;
  materialDescription: string;
  batchNumber: string;
  totalQty: number;
  totalBoxes: number;
  packingConfirmedAt: string | null;
  warehouseConfirmedAt: string | null;
  status: "DRAFT" | "PENDING_PACKING" | "PENDING_WAREHOUSE" | "LOCKED";
  defaultPalletStatus: "QC_HOLD" | "BULK";
};

type PalletRow = {
  id: string;
  srNo: number;
  palletNumber: string;
  qty: number;
  receivingTime: string;
  cartonCondition: "OK" | "BULGING" | "DAMAGED" | "WET" | "SHORT_QUANTITY" | "OTHER";
  temperatureC: number | null;
  remarks: string | null;
};

const CARTON_CONDITIONS = ["OK", "BULGING", "DAMAGED", "WET", "SHORT_QUANTITY", "OTHER"] as const;
const TEMPERATURE_WARNING_THRESHOLD_C = -15;

const EMPTY_PALLET_FORM = {
  palletNumber: "",
  qty: "",
  receivingTime: new Date().toTimeString().slice(0, 5),
  cartonCondition: "OK" as (typeof CARTON_CONDITIONS)[number],
  temperatureC: "",
  remarks: "",
};

type LoadState = "loading" | "ready" | "error";

export default function ReceivingSheetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ReceivingSheet | null>(null);
  const [pallets, setPallets] = useState<PalletRow[]>([]);

  const [palletForm, setPalletForm] = useState(EMPTY_PALLET_FORM);
  const [palletFieldErrors, setPalletFieldErrors] = useState<Record<string, string>>({});
  const [palletSubmitting, setPalletSubmitting] = useState(false);
  const [palletNotice, setPalletNotice] = useState<string | null>(null);
  const [palletError, setPalletError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState<"packing" | "warehouse" | null>(null);
  const [confirmNotice, setConfirmNotice] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function load() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch(`/api/receiving-sheets/${id}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
      setSheet(body.receivingSheet as ReceivingSheet);
      setPallets(body.pallets as PalletRow[]);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this receiving sheet.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAddPallet(event: FormEvent) {
    event.preventDefault();
    setPalletError(null);
    setPalletNotice(null);

    const errors: Record<string, string> = {};
    const qty = Number(palletForm.qty);
    if (!palletForm.palletNumber.trim()) errors.palletNumber = "Pallet number is required.";
    if (!Number.isFinite(qty) || qty <= 0) errors.qty = "Quantity must be a positive number.";
    if (palletForm.cartonCondition !== "OK" && !palletForm.remarks.trim()) {
      errors.remarks = "Remarks are required for a non-OK carton condition.";
    }
    if (Object.keys(errors).length > 0) {
      setPalletFieldErrors(errors);
      return;
    }
    setPalletFieldErrors({});
    setPalletSubmitting(true);
    try {
      const res = await fetch(`/api/receiving-sheets/${id}/pallets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          palletNumber: palletForm.palletNumber.trim(),
          qty,
          receivingTime: palletForm.receivingTime,
          cartonCondition: palletForm.cartonCondition,
          temperatureC: palletForm.temperatureC === "" ? null : Number(palletForm.temperatureC),
          remarks: palletForm.remarks.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          setPalletNotice(body.error);
        } else {
          setPalletError(body.error ?? `Request failed (${res.status}).`);
        }
        return;
      }
      setPalletForm({ ...EMPTY_PALLET_FORM, receivingTime: new Date().toTimeString().slice(0, 5) });
      await load();
    } catch {
      setPalletError("Network error - could not reach the server.");
    } finally {
      setPalletSubmitting(false);
    }
  }

  async function handleConfirm(side: "packing" | "warehouse") {
    setConfirming(side);
    setConfirmError(null);
    setConfirmNotice(null);
    try {
      const res = await fetch(`/api/receiving-sheets/${id}/confirm-${side}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          setConfirmNotice(body.error);
        } else {
          setConfirmError(body.error ?? `Request failed (${res.status}).`);
        }
        return;
      }
      await load();
    } catch {
      setConfirmError("Network error - could not reach the server.");
    } finally {
      setConfirming(null);
    }
  }

  if (loadState === "loading") {
    return (
      <>
        <PageHeader breadcrumb="Home / Inward / Receiving Sheets" title="Loading..." />
        <div className="p-4 sm:p-6">
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">Loading...</div>
        </div>
      </>
    );
  }

  if (loadState === "error" || !sheet) {
    return (
      <>
        <PageHeader breadcrumb="Home / Inward / Receiving Sheets" title="Not found" />
        <div className="p-4 sm:p-6">
          <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
            {loadError}
          </div>
        </div>
      </>
    );
  }

  const isDraft = sheet.status === "DRAFT";
  const isLocked = sheet.status === "LOCKED";

  return (
    <>
      <PageHeader breadcrumb="Home / Inward / Receiving Sheets" title={sheet.sheetNumber} />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy">Header</h2>
            <StatusPill status={sheet.status} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Detail label="Date" value={sheet.date} />
            <Detail label="Shift" value={sheet.shift} />
            <Detail label="Line" value={sheet.line} />
            <Detail label="Default status" value={sheet.defaultPalletStatus} />
            <Detail label="Material" value={`${sheet.materialCode} - ${sheet.materialDescription}`} />
            <Detail label="Batch" value={sheet.batchNumber} />
            <Detail label="Total qty" value={String(sheet.totalQty)} />
            <Detail label="Total boxes" value={String(sheet.totalBoxes)} />
          </dl>
        </section>

        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-sm font-bold text-navy">Pallets ({pallets.length}/35)</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="text-muted2">
                <tr>
                  <th className="py-1 pr-2">Sr</th>
                  <th className="py-1 pr-2">Pallet No</th>
                  <th className="py-1 pr-2">Qty</th>
                  <th className="py-1 pr-2">Time</th>
                  <th className="py-1 pr-2">Condition</th>
                  <th className="py-1 pr-2">Temp</th>
                  <th className="py-1 pr-2">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pallets.map((p) => {
                  const warm =
                    typeof p.temperatureC === "number" && p.temperatureC > TEMPERATURE_WARNING_THRESHOLD_C;
                  return (
                    <tr key={p.id}>
                      <td className="py-2 pr-2">{p.srNo}</td>
                      <td className="py-2 pr-2 font-bold text-navy">{p.palletNumber}</td>
                      <td className="py-2 pr-2">{p.qty}</td>
                      <td className="py-2 pr-2">{p.receivingTime}</td>
                      <td className="py-2 pr-2">
                        {p.cartonCondition === "OK" ? (
                          "OK"
                        ) : (
                          <span className="font-semibold text-warning">{p.cartonCondition}</span>
                        )}
                      </td>
                      <td className={"py-2 pr-2 " + (warm ? "font-semibold text-warning" : "")}>
                        {p.temperatureC ?? "-"}
                        {warm ? " ⚠" : ""}
                      </td>
                      <td className="py-2 pr-2">{p.remarks ?? ""}</td>
                    </tr>
                  );
                })}
                {pallets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-3 text-muted">
                      No pallets added yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {isDraft && pallets.length < 35 ? (
            <form className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-3" onSubmit={handleAddPallet}>
              <Field label="Pallet No" error={palletFieldErrors.palletNumber}>
                <input
                  className={inputClass(palletFieldErrors.palletNumber)}
                  value={palletForm.palletNumber}
                  onChange={(e) => setPalletForm({ ...palletForm, palletNumber: e.target.value })}
                />
              </Field>
              <Field label="Qty (cartons)" error={palletFieldErrors.qty}>
                <input
                  type="number"
                  inputMode="numeric"
                  className={inputClass(palletFieldErrors.qty)}
                  value={palletForm.qty}
                  onChange={(e) => setPalletForm({ ...palletForm, qty: e.target.value })}
                />
              </Field>
              <Field label="Receiving time">
                <input
                  type="time"
                  className={inputClass()}
                  value={palletForm.receivingTime}
                  onChange={(e) => setPalletForm({ ...palletForm, receivingTime: e.target.value })}
                />
              </Field>
              <Field label="Carton condition">
                <select
                  className={inputClass()}
                  value={palletForm.cartonCondition}
                  onChange={(e) =>
                    setPalletForm({ ...palletForm, cartonCondition: e.target.value as typeof palletForm.cartonCondition })
                  }
                >
                  {CARTON_CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Temperature (C, optional)">
                <input
                  type="number"
                  inputMode="decimal"
                  className={inputClass()}
                  value={palletForm.temperatureC}
                  onChange={(e) => setPalletForm({ ...palletForm, temperatureC: e.target.value })}
                />
              </Field>
              <Field
                label={palletForm.cartonCondition === "OK" ? "Remarks (optional)" : "Remarks (required)"}
                error={palletFieldErrors.remarks}
              >
                <input
                  className={inputClass(palletFieldErrors.remarks)}
                  value={palletForm.remarks}
                  onChange={(e) => setPalletForm({ ...palletForm, remarks: e.target.value })}
                />
              </Field>

              <div className="sm:col-span-3">
                {palletNotice ? (
                  <p className="mb-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-warning" role="status">
                    {palletNotice}
                  </p>
                ) : null}
                {palletError ? (
                  <p className="mb-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                    {palletError}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={palletSubmitting}
                  className="min-h-[48px] w-full rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
                >
                  {palletSubmitting ? "Adding..." : "+ Add Pallet Row"}
                </button>
              </div>
            </form>
          ) : null}
        </section>

        {!isLocked ? (
          <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
            <h2 className="text-sm font-bold text-navy">Confirmation</h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold text-ink2">Packing side</div>
                {sheet.packingConfirmedAt ? (
                  <p className="mt-2 text-xs text-success">Confirmed at {sheet.packingConfirmedAt}</p>
                ) : (
                  <button
                    type="button"
                    disabled={confirming !== null || pallets.length === 0}
                    onClick={() => handleConfirm("packing")}
                    className="mt-2 min-h-[48px] w-full rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {confirming === "packing" ? "Confirming..." : "Login → Confirm (Packing)"}
                  </button>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold text-ink2">Warehouse side</div>
                {sheet.warehouseConfirmedAt ? (
                  <p className="mt-2 text-xs text-success">Confirmed at {sheet.warehouseConfirmedAt}</p>
                ) : (
                  <button
                    type="button"
                    disabled={confirming !== null || pallets.length === 0}
                    onClick={() => handleConfirm("warehouse")}
                    className="mt-2 min-h-[48px] w-full rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {confirming === "warehouse" ? "Confirming..." : "Login → Confirm (Warehouse)"}
                  </button>
                )}
              </div>
            </div>
            {pallets.length === 0 ? (
              <p className="mt-3 text-xs text-muted">Add at least one pallet row before confirming.</p>
            ) : null}
            {confirmNotice ? (
              <p className="mt-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-warning" role="status">
                {confirmNotice}
              </p>
            ) : null}
            {confirmError ? (
              <p className="mt-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                {confirmError}
              </p>
            ) : null}
          </section>
        ) : (
          <section className="rounded-xl border border-success bg-success-light p-4 text-sm font-semibold text-success shadow-card sm:p-6">
            Locked - both sides confirmed. This sheet is now a permanent, immutable record.
          </section>
        )}
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

function StatusPill({ status }: { status: ReceivingSheet["status"] }) {
  const label: Record<ReceivingSheet["status"], string> = {
    DRAFT: "Draft",
    PENDING_PACKING: "Awaiting packing confirm",
    PENDING_WAREHOUSE: "Awaiting warehouse confirm",
    LOCKED: "Locked",
  };
  const styles: Record<ReceivingSheet["status"], string> = {
    DRAFT: "bg-line text-muted",
    PENDING_PACKING: "bg-warning-light text-warning",
    PENDING_WAREHOUSE: "bg-warning-light text-warning",
    LOCKED: "bg-success-light text-success",
  };
  return (
    <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + styles[status]}>{label[status]}</span>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold text-ink2">
      {label}
      <div className="mt-1">{children}</div>
      {error ? <span className="mt-1 block text-xs font-semibold text-danger">{error}</span> : null}
    </label>
  );
}

function inputClass(error?: string) {
  return (
    "min-h-[48px] w-full rounded-lg border bg-white px-3 text-sm text-ink2 outline-none focus:border-teal " +
    (error ? "border-danger" : "border-line")
  );
}
