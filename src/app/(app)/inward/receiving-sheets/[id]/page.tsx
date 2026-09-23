"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  Field,
  Pill,
  type PillTone,
  StateBox,
  Steps,
  TableWrap,
  btn,
  inputClass,
  rowFlagCls,
  tableCls,
  tdCls,
  thCls,
  trCls,
} from "@/components/ui";

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
  status: "DRAFT" | "PENDING_PACKING" | "PENDING_WAREHOUSE" | "LOCKED" | "CANCELLED";
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

  const [cancelling, setCancelling] = useState(false);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

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

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    setCancelNotice(null);
    try {
      const res = await fetch(`/api/receiving-sheets/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          setCancelNotice(body.error);
        } else {
          setCancelError(body.error ?? `Request failed (${res.status}).`);
        }
        return;
      }
      await load();
    } catch {
      setCancelError("Network error - could not reach the server.");
    } finally {
      setCancelling(false);
    }
  }

  if (loadState === "loading") {
    return (
      <>
        <PageHeader title="Loading..." />
        <div className="bg-canvas p-4 sm:p-6">
          <StateBox>Loading...</StateBox>
        </div>
      </>
    );
  }

  if (loadState === "error" || !sheet) {
    return (
      <>
        <PageHeader title="Not found" />
        <div className="bg-canvas p-4 sm:p-6">
          <StateBox tone="danger">{loadError}</StateBox>
        </div>
      </>
    );
  }

  const isDraft = sheet.status === "DRAFT";
  const isLocked = sheet.status === "LOCKED";
  const isCancelled = sheet.status === "CANCELLED";

  const currentStep = isLocked ? 4 : sheet.status === "DRAFT" ? 2 : 3;
  const isWarm = (p: PalletRow) =>
    typeof p.temperatureC === "number" && p.temperatureC > TEMPERATURE_WARNING_THRESHOLD_C;
  const conditionFlagCount = pallets.filter((p) => p.cartonCondition !== "OK").length;
  const tempFlagCount = pallets.filter(isWarm).length;
  let runningTotal = 0;

  return (
    <>
      <PageHeader
        title={sheet.sheetNumber}
        actions={<StatusPill status={sheet.status} />}
      />
      <div className="flex flex-col gap-5 bg-canvas p-4 sm:p-6">
        {!isCancelled ? (
          <Steps steps={["Sheet Details", "Pallet Entry", "Dual Confirmation"]} current={currentStep} />
        ) : null}

        <section className="rounded-xl border border-[#99F6E4] bg-gradient-to-r from-[#F0FDFA] to-white p-4 shadow-card sm:px-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:flex sm:flex-wrap sm:items-end">
            <Detail label="Date" value={sheet.date} />
            <Detail label="Line / Shift" value={`${sheet.line} · Shift ${sheet.shift}`} />
            <Detail label="Material" value={`${sheet.materialCode} - ${sheet.materialDescription}`} />
            <Detail label="Batch" value={sheet.batchNumber} />
            <Detail label="Default status" value={sheet.defaultPalletStatus} />
            <Detail label="Total boxes" value={String(sheet.totalBoxes)} />
            <div className="col-span-2 sm:ml-auto sm:text-right">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-muted2">Total qty</dt>
              <dd className="text-xl font-extrabold text-teal-2">{sheet.totalQty} cartons</dd>
            </div>
          </dl>
        </section>

        <Card
          title="Pallet-wise Entry"
          sub={`${pallets.length} of 35 · temp flag above ${TEMPERATURE_WARNING_THRESHOLD_C}°C`}
          bodyClassName="px-4 pb-4 pt-1"
        >
          <TableWrap minWidth={680}>
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Sr</th>
                  <th className={thCls}>Pallet No</th>
                  <th className={thCls + " text-right"}>Qty</th>
                  <th className={thCls}>Time</th>
                  <th className={thCls + " text-right"}>Total</th>
                  <th className={thCls}>Condition</th>
                  <th className={thCls}>Temp °C</th>
                  <th className={thCls}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {pallets.map((p) => {
                  const warm = isWarm(p);
                  runningTotal += p.qty;
                  const flag = warm
                    ? "critical"
                    : p.cartonCondition === "SHORT_QUANTITY"
                      ? "violet"
                      : p.cartonCondition !== "OK"
                        ? "warn"
                        : "ok";
                  return (
                    <tr key={p.id} className={trCls + " " + rowFlagCls(flag)}>
                      <td className={tdCls + " text-muted"}>{p.srNo}</td>
                      <td className={tdCls + " font-bold text-ink"}>{p.palletNumber}</td>
                      <td className={tdCls + " text-right"}>{p.qty}</td>
                      <td className={tdCls}>{p.receivingTime}</td>
                      <td className={tdCls + " text-right font-semibold text-ink2"}>{runningTotal}</td>
                      <td className={tdCls}>
                        <Pill tone={p.cartonCondition === "OK" ? "ok" : p.cartonCondition === "SHORT_QUANTITY" ? "bulk" : "hold"}>
                          {p.cartonCondition}
                        </Pill>
                      </td>
                      <td className={tdCls + " font-extrabold " + (warm ? "text-danger" : "text-sky")}>
                        {p.temperatureC ?? "-"}
                        {warm ? " ⚠" : ""}
                      </td>
                      <td className={tdCls + " text-xs italic " + (p.cartonCondition !== "OK" ? "text-[#B45309]" : "text-muted2")}>
                        {p.remarks ?? ""}
                      </td>
                    </tr>
                  );
                })}
                {pallets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={tdCls + " text-center text-muted"}>
                      No pallets added yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </TableWrap>

          {pallets.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted2">
              Flags:
              {conditionFlagCount === 0 && tempFlagCount === 0 ? <Pill tone="ok">None</Pill> : null}
              {conditionFlagCount > 0 ? <Pill tone="hold">{conditionFlagCount} carton condition</Pill> : null}
              {tempFlagCount > 0 ? <Pill tone="rejected">{tempFlagCount} temp</Pill> : null}
            </div>
          ) : null}

          {isDraft && pallets.length < 35 ? (
            <form
              className="mt-4 grid grid-cols-1 gap-4 rounded-xl border-[1.5px] border-dashed border-[#CBD5E1] bg-[#FAFBFC] p-4 sm:grid-cols-3"
              onSubmit={handleAddPallet}
            >
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
                  <p className="mb-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-[#B45309]" role="status">
                    {palletNotice}
                  </p>
                ) : null}
                {palletError ? (
                  <p className="mb-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                    {palletError}
                  </p>
                ) : null}
                <button type="submit" disabled={palletSubmitting} className={btn("teal", "w-full sm:w-auto")}>
                  {palletSubmitting ? "Adding..." : "+ Add Pallet Row"}
                </button>
              </div>
            </form>
          ) : null}
        </Card>

        {isCancelled ? (
          <section className="rounded-xl border border-danger/30 bg-danger-light/40 p-4 text-sm font-semibold text-danger shadow-card sm:p-5">
            Cancelled - this draft was withdrawn before either side confirmed it.
          </section>
        ) : isLocked ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-navy to-navy-3 p-5 text-white shadow-elevated">
            <div>
              <div className="text-base font-extrabold">🔒 Locked - both sides confirmed. This sheet is now a permanent, immutable record.</div>
              <div className="mt-1 text-xs text-[#8FA3C0]">
                Packing: {sheet.packingConfirmedAt} · Warehouse: {sheet.warehouseConfirmedAt}
              </div>
            </div>
          </section>
        ) : (
          <Card
            title="Dual Confirmation & Lock"
            action={
              <Pill tone="qc">
                {sheet.packingConfirmedAt && !sheet.warehouseConfirmedAt
                  ? "awaiting warehouse side"
                  : !sheet.packingConfirmedAt && sheet.warehouseConfirmedAt
                    ? "awaiting packing side"
                    : "awaiting both sides"}
              </Pill>
            }
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ConfirmPanel
                title="Packing side"
                confirmedAt={sheet.packingConfirmedAt}
                button={
                  <button
                    type="button"
                    disabled={confirming !== null || pallets.length === 0}
                    onClick={() => handleConfirm("packing")}
                    className={btn("gold", "w-full")}
                  >
                    {confirming === "packing" ? "Confirming..." : "Login → Confirm (Packing)"}
                  </button>
                }
              />
              <ConfirmPanel
                title="Warehouse side"
                confirmedAt={sheet.warehouseConfirmedAt}
                button={
                  <button
                    type="button"
                    disabled={confirming !== null || pallets.length === 0}
                    onClick={() => handleConfirm("warehouse")}
                    className={btn("gold", "w-full")}
                  >
                    {confirming === "warehouse" ? "Confirming..." : "Login → Confirm (Warehouse)"}
                  </button>
                }
              />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted2">
              Both sides confirmed → sheet locks as a legal record → pallets move to{" "}
              <Pill tone={sheet.defaultPalletStatus === "BULK" ? "bulk" : "qc"}>{sheet.defaultPalletStatus}</Pill>
            </p>
            {pallets.length === 0 ? (
              <p className="mt-3 text-xs text-muted">Add at least one pallet row before confirming.</p>
            ) : null}
            {confirmNotice ? (
              <p className="mt-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-[#B45309]" role="status">
                {confirmNotice}
              </p>
            ) : null}
            {confirmError ? (
              <p className="mt-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                {confirmError}
              </p>
            ) : null}

            {isDraft ? (
              <div className="mt-4 border-t border-line pt-4">
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={handleCancel}
                  className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[11px] border-[1.5px] border-danger bg-white px-4 text-sm font-bold text-danger disabled:opacity-60 sm:w-auto"
                >
                  {cancelling ? "Cancelling..." : "Cancel this draft"}
                </button>
                {cancelNotice ? (
                  <p className="mt-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-[#B45309]" role="status">
                    {cancelNotice}
                  </p>
                ) : null}
                {cancelError ? (
                  <p className="mt-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                    {cancelError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>
        )}
      </div>
    </>
  );
}

function ConfirmPanel({
  title,
  confirmedAt,
  button,
}: {
  title: string;
  confirmedAt: string | null;
  button: React.ReactNode;
}) {
  return (
    <div
      className={
        "rounded-xl border-[1.5px] p-4 " +
        (confirmedAt ? "border-[#A7F3D0] bg-[#F0FDF9]" : "border-[#FDE68A] bg-[#FFFBEB]")
      }
    >
      <div
        className={
          "text-xs font-extrabold uppercase tracking-wide " + (confirmedAt ? "text-teal-2" : "text-[#B45309]")
        }
      >
        {title}
      </div>
      {confirmedAt ? (
        <div className="mt-3 flex items-center justify-between rounded-lg border-[1.5px] border-teal bg-teal-light px-3.5 py-3 text-xs">
          <span className="font-semibold text-ink">Confirmed at {confirmedAt}</span>
          <span className="text-sm font-extrabold text-success">✓</span>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border-[1.5px] border-dashed border-warning bg-white p-3">
          <div className="mb-2 text-xs font-bold text-[#B45309]">Awaiting…</div>
          {button}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-muted2">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-bold text-ink">{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: ReceivingSheet["status"] }) {
  const label: Record<ReceivingSheet["status"], string> = {
    DRAFT: "Draft",
    PENDING_PACKING: "Awaiting packing confirm",
    PENDING_WAREHOUSE: "Awaiting warehouse confirm",
    LOCKED: "Locked",
    CANCELLED: "Cancelled",
  };
  const tone: Record<ReceivingSheet["status"], PillTone> = {
    DRAFT: "neutral",
    PENDING_PACKING: "hold",
    PENDING_WAREHOUSE: "hold",
    LOCKED: "ok",
    CANCELLED: "rejected",
  };
  return <Pill tone={tone[status]}>{label[status]}</Pill>;
}
