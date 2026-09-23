"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { warehouseCreateSchema } from "@/lib/validations/warehouse";

type Warehouse = {
  id: string;
  code: string;
  name: string;
  type: "OWN" | "3PL" | "CROSS_PLANT";
  plant: "LIMBASI" | "SABARKANTHA" | "PATAN";
  sapCode: string;
  address: string | null;
  locationStructure: "RACK" | "FLAT";
  active: number;
};

type LoadState = "loading" | "ready" | "error";

const EMPTY_FORM = {
  code: "",
  name: "",
  type: "OWN" as const,
  plant: "LIMBASI" as const,
  sapCode: "",
  address: "",
  locationStructure: "RACK" as const,
};

export default function WarehouseMasterPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);

  async function loadWarehouses() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/masters/warehouses");
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error ?? `Request failed (${res.status}).`);
      }
      setWarehouses(body.warehouses as Warehouse[]);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load warehouses.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadWarehouses();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitNotice(null);

    const candidate = {
      ...form,
      address: form.address.trim() === "" ? null : form.address,
    };
    const parsed = warehouseCreateSchema.safeParse(candidate);
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
      const res = await fetch("/api/masters/warehouses", {
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
      await loadWarehouses();
    } catch {
      setSubmitError("Network error - could not reach the server.");
    } finally {
      setSubmitState("idle");
    }
  }

  return (
    <>
      <PageHeader title="Warehouse Master" />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-sm font-bold text-navy">New warehouse</h2>
          <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <Field label="Code" error={fieldErrors.code}>
              <input
                className={inputClass(fieldErrors.code)}
                placeholder="LIMBASI-CR1"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
            <Field label="Name" error={fieldErrors.name}>
              <input
                className={inputClass(fieldErrors.name)}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Type" error={fieldErrors.type}>
              <select
                className={inputClass(fieldErrors.type)}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
              >
                <option value="OWN">OWN</option>
                <option value="3PL">3PL</option>
                <option value="CROSS_PLANT">CROSS_PLANT</option>
              </select>
            </Field>
            <Field label="Plant" error={fieldErrors.plant}>
              <select
                className={inputClass(fieldErrors.plant)}
                value={form.plant}
                onChange={(e) => setForm({ ...form, plant: e.target.value as typeof form.plant })}
              >
                <option value="LIMBASI">LIMBASI</option>
                <option value="SABARKANTHA">SABARKANTHA</option>
                <option value="PATAN">PATAN</option>
              </select>
            </Field>
            <Field label="SAP code" error={fieldErrors.sapCode}>
              <input
                className={inputClass(fieldErrors.sapCode)}
                placeholder="LMFGA"
                value={form.sapCode}
                onChange={(e) => setForm({ ...form, sapCode: e.target.value })}
              />
            </Field>
            <Field label="Location structure" error={fieldErrors.locationStructure}>
              <select
                className={inputClass(fieldErrors.locationStructure)}
                value={form.locationStructure}
                onChange={(e) =>
                  setForm({
                    ...form,
                    locationStructure: e.target.value as typeof form.locationStructure,
                  })
                }
              >
                <option value="RACK">RACK</option>
                <option value="FLAT">FLAT</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address (optional)" error={fieldErrors.address}>
                <input
                  className={inputClass(fieldErrors.address)}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              {submitNotice ? (
                <p
                  className="mb-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-warning"
                  role="status"
                >
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
                {submitState === "submitting" ? "Saving..." : "Add warehouse"}
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold text-navy">Existing warehouses</h2>
          {loadState === "loading" ? (
            <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
              Loading warehouses...
            </div>
          ) : loadState === "error" ? (
            <div
              className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card"
              role="alert"
            >
              {loadError}
            </div>
          ) : warehouses.length === 0 ? (
            <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
              No warehouses yet. Add one above.
            </div>
          ) : (
            <WarehouseList warehouses={warehouses} />
          )}
        </section>
      </div>
    </>
  );
}

function WarehouseList({ warehouses }: { warehouses: Warehouse[] }) {
  return (
    <>
      <ul className="flex flex-col gap-2 sm:hidden">
        {warehouses.map((w) => (
          <li key={w.id} className="rounded-xl border border-line bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-navy">{w.code}</span>
              <StatusPill active={w.active === 1} />
            </div>
            <div className="mt-1 text-sm text-ink2">{w.name}</div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted">
              <span>{w.type}</span>
              <span>{w.plant}</span>
              <span>{w.sapCode}</span>
              <span>{w.locationStructure}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-line bg-white shadow-card sm:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-canvas text-xs font-semibold uppercase text-muted2">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Plant</th>
              <th className="px-4 py-3">SAP code</th>
              <th className="px-4 py-3">Structure</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {warehouses.map((w) => (
              <tr key={w.id}>
                <td className="px-4 py-3 font-bold text-navy">{w.code}</td>
                <td className="px-4 py-3">{w.name}</td>
                <td className="px-4 py-3">{w.type}</td>
                <td className="px-4 py-3">{w.plant}</td>
                <td className="px-4 py-3">{w.sapCode}</td>
                <td className="px-4 py-3">{w.locationStructure}</td>
                <td className="px-4 py-3">
                  <StatusPill active={w.active === 1} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={
        "rounded-full px-2 py-0.5 text-xs font-bold " +
        (active ? "bg-success-light text-success" : "bg-line text-muted")
      }
    >
      {active ? "Active" : "Inactive"}
    </span>
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
