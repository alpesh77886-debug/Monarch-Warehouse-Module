"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { locationCreateSchema } from "@/lib/validations/location";

type Location = {
  id: string;
  warehouseId: string;
  coldRoom: "CR1" | "CR2" | "FLOOR" | "NA";
  block: string | null;
  position: string | null;
  floor: number | null;
  fullCode: string;
  capacityPallets: number;
  currentPalletId: string | null;
  status: "EMPTY" | "OCCUPIED" | "PARTIAL" | "BLOCKED";
};

type LoadState = "loading" | "ready" | "error";

const EMPTY_FORM = {
  warehouseId: "",
  coldRoom: "CR1" as const,
  block: "",
  position: "",
  floor: "",
  fullCode: "",
  capacityPallets: "1",
};

export default function LocationsPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);

  async function loadLocations() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/storage/locations");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
      setLocations(body.locations as Location[]);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load locations.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadLocations();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitNotice(null);

    const candidate = {
      warehouseId: form.warehouseId,
      coldRoom: form.coldRoom,
      block: form.block.trim() === "" ? null : form.block,
      position: form.position.trim() === "" ? null : form.position,
      floor: form.floor.trim() === "" ? null : Number(form.floor),
      fullCode: form.fullCode,
      capacityPallets: form.capacityPallets.trim() === "" ? 1 : Number(form.capacityPallets),
    };
    const parsed = locationCreateSchema.safeParse(candidate);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[String(issue.path[0])] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitState("submitting");
    try {
      const res = await fetch("/api/storage/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          setSubmitNotice(body.error);
        } else {
          setSubmitError(body.error ?? `Request failed (${res.status}).`);
        }
        return;
      }
      setForm(EMPTY_FORM);
      await loadLocations();
    } catch {
      setSubmitError("Network error - could not reach the server.");
    } finally {
      setSubmitState("idle");
    }
  }

  return (
    <>
      <PageHeader title="Locations" />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-sm font-bold text-navy">New location</h2>
          <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <Field label="Warehouse ID" error={fieldErrors.warehouseId}>
              <input
                className={inputClass(fieldErrors.warehouseId)}
                placeholder="paste a Warehouse Master id"
                value={form.warehouseId}
                onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
              />
            </Field>
            <Field label="Full code" error={fieldErrors.fullCode}>
              <input
                className={inputClass(fieldErrors.fullCode)}
                placeholder="CR1-01-A-4"
                value={form.fullCode}
                onChange={(e) => setForm({ ...form, fullCode: e.target.value })}
              />
            </Field>
            <Field label="Cold room" error={fieldErrors.coldRoom}>
              <select
                className={inputClass(fieldErrors.coldRoom)}
                value={form.coldRoom}
                onChange={(e) => setForm({ ...form, coldRoom: e.target.value as typeof form.coldRoom })}
              >
                <option value="CR1">CR1</option>
                <option value="CR2">CR2</option>
                <option value="FLOOR">FLOOR</option>
                <option value="NA">NA</option>
              </select>
            </Field>
            <Field label="Capacity (pallets)" error={fieldErrors.capacityPallets}>
              <input
                className={inputClass(fieldErrors.capacityPallets)}
                type="number"
                inputMode="numeric"
                min="1"
                value={form.capacityPallets}
                onChange={(e) => setForm({ ...form, capacityPallets: e.target.value })}
              />
            </Field>
            <Field label="Block (optional)" error={fieldErrors.block}>
              <input
                className={inputClass(fieldErrors.block)}
                value={form.block}
                onChange={(e) => setForm({ ...form, block: e.target.value })}
              />
            </Field>
            <Field label="Position (optional)" error={fieldErrors.position}>
              <input
                className={inputClass(fieldErrors.position)}
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
              />
            </Field>
            <Field label="Floor (optional)" error={fieldErrors.floor}>
              <input
                className={inputClass(fieldErrors.floor)}
                type="number"
                inputMode="numeric"
                min="1"
                value={form.floor}
                onChange={(e) => setForm({ ...form, floor: e.target.value })}
              />
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
                {submitState === "submitting" ? "Saving..." : "Add location"}
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold text-navy">Existing locations</h2>
          {loadState === "loading" ? (
            <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
              Loading locations...
            </div>
          ) : loadState === "error" ? (
            <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
              {loadError}
            </div>
          ) : locations.length === 0 ? (
            <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
              No locations yet. Add one above.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {locations.map((l) => (
                <li key={l.id} className="rounded-xl border border-line bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-navy">{l.fullCode}</span>
                    <StatusPill status={l.status} />
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {l.coldRoom} · capacity {l.capacityPallets} pallet(s)
                    {l.currentPalletId ? ` · pallet id ${l.currentPalletId}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function StatusPill({ status }: { status: Location["status"] }) {
  const styles: Record<Location["status"], string> = {
    EMPTY: "bg-success-light text-success",
    OCCUPIED: "bg-danger-light text-danger",
    PARTIAL: "bg-sky-light text-sky",
    BLOCKED: "bg-line text-muted",
  };
  return <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + styles[status]}>{status}</span>;
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
