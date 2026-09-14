"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { materialCreateSchema } from "@/lib/validations/material";

type Material = {
  id: string;
  code: string;
  description: string;
  uomKgPerCarton: number;
  category: string;
  palletWeightLimitKg: number;
  palletType: "CARTON" | "ROLL" | "POUCH";
  shelfLifeDays: number | null;
  plantOrigin: "LIMBASI" | "SABARKANTHA";
  active: number;
};

type LoadState = "loading" | "ready" | "error";

const EMPTY_FORM = {
  code: "",
  description: "",
  uomKgPerCarton: "",
  category: "",
  palletWeightLimitKg: "",
  palletType: "CARTON" as const,
  shelfLifeDays: "",
  plantOrigin: "LIMBASI" as const,
};

export default function MaterialMasterPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);

  async function loadMaterials() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/masters/materials");
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error ?? `Request failed (${res.status}).`);
      }
      setMaterials(body.materials as Material[]);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load materials.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadMaterials();
  }, []);

  function parseFormValues() {
    return {
      code: form.code.trim().toUpperCase(),
      description: form.description,
      uomKgPerCarton: Number(form.uomKgPerCarton),
      category: form.category,
      palletWeightLimitKg: Number(form.palletWeightLimitKg),
      palletType: form.palletType,
      shelfLifeDays: form.shelfLifeDays === "" ? null : Number(form.shelfLifeDays),
      plantOrigin: form.plantOrigin,
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitNotice(null);

    const candidate = parseFormValues();
    const parsed = materialCreateSchema.safeParse(candidate);
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
      const res = await fetch("/api/masters/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json();
      if (!res.ok) {
        // 503 = Clerk stub mode: the server-side permission gate is
        // working correctly (no mutation can be authorized without a
        // real session yet) - surface that plainly instead of a
        // generic failure, matching the same stub-mode messaging the
        // sign-in/sign-up pages already use.
        if (res.status === 503) {
          setSubmitNotice(body.error);
        } else {
          setSubmitError(body.error ?? `Request failed (${res.status}).`);
        }
        return;
      }
      setForm(EMPTY_FORM);
      await loadMaterials();
    } catch {
      setSubmitError("Network error - could not reach the server.");
    } finally {
      setSubmitState("idle");
    }
  }

  return (
    <>
      <PageHeader breadcrumb="Home / Masters / Material Master" title="Material Master" />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-sm font-bold text-navy">New material</h2>
          <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <Field label="Code" error={fieldErrors.code}>
              <input
                className={inputClass(fieldErrors.code)}
                placeholder="LFG00938"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
            <Field label="Description" error={fieldErrors.description}>
              <input
                className={inputClass(fieldErrors.description)}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <Field label="UOM (kg/carton)" error={fieldErrors.uomKgPerCarton}>
              <input
                className={inputClass(fieldErrors.uomKgPerCarton)}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.uomKgPerCarton}
                onChange={(e) => setForm({ ...form, uomKgPerCarton: e.target.value })}
              />
            </Field>
            <Field label="Category" error={fieldErrors.category}>
              <input
                className={inputClass(fieldErrors.category)}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </Field>
            <Field label="Pallet weight limit (kg)" error={fieldErrors.palletWeightLimitKg}>
              <input
                className={inputClass(fieldErrors.palletWeightLimitKg)}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.palletWeightLimitKg}
                onChange={(e) => setForm({ ...form, palletWeightLimitKg: e.target.value })}
              />
            </Field>
            <Field label="Pallet type" error={fieldErrors.palletType}>
              <select
                className={inputClass(fieldErrors.palletType)}
                value={form.palletType}
                onChange={(e) =>
                  setForm({ ...form, palletType: e.target.value as typeof form.palletType })
                }
              >
                <option value="CARTON">CARTON</option>
                <option value="ROLL">ROLL</option>
                <option value="POUCH">POUCH</option>
              </select>
            </Field>
            <Field label="Shelf life (days, optional)" error={fieldErrors.shelfLifeDays}>
              <input
                className={inputClass(fieldErrors.shelfLifeDays)}
                type="number"
                inputMode="numeric"
                min="0"
                value={form.shelfLifeDays}
                onChange={(e) => setForm({ ...form, shelfLifeDays: e.target.value })}
              />
            </Field>
            <Field label="Plant origin" error={fieldErrors.plantOrigin}>
              <select
                className={inputClass(fieldErrors.plantOrigin)}
                value={form.plantOrigin}
                onChange={(e) =>
                  setForm({ ...form, plantOrigin: e.target.value as typeof form.plantOrigin })
                }
              >
                <option value="LIMBASI">LIMBASI</option>
                <option value="SABARKANTHA">SABARKANTHA</option>
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
                {submitState === "submitting" ? "Saving..." : "Add material"}
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold text-navy">Existing materials</h2>
          {loadState === "loading" ? (
            <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
              Loading materials...
            </div>
          ) : loadState === "error" ? (
            <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
              {loadError}
            </div>
          ) : materials.length === 0 ? (
            <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
              No materials yet. Add one above.
            </div>
          ) : (
            <MaterialList materials={materials} onUpdated={loadMaterials} />
          )}
        </section>
      </div>
    </>
  );
}

function MaterialList({ materials, onUpdated }: { materials: Material[]; onUpdated: () => void }) {
  return (
    <>
      {/* Phone: stacked cards, never a wide table - avoids horizontal scroll. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {materials.map((m) => (
          <li key={m.id} className="rounded-xl border border-line bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-navy">{m.code}</span>
              <StatusPill active={m.active === 1} />
            </div>
            <div className="mt-1 text-sm text-ink2">{m.description}</div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted">
              <span>{m.category}</span>
              <span>{m.palletType}</span>
              <span>{m.uomKgPerCarton} kg/carton</span>
              <span>{m.plantOrigin}</span>
              <span>{m.shelfLifeDays ? `${m.shelfLifeDays}d shelf life` : "no shelf life"}</span>
            </div>
            <div className="mt-2">
              <PalletWeightEditor material={m} onUpdated={onUpdated} />
            </div>
          </li>
        ))}
      </ul>

      {/* Tablet/desktop: real table, contained in its own scroll box per
          the mobile-first rule (only tables/code/diagrams may scroll,
          the page itself never does). */}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-white shadow-card sm:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-canvas text-xs font-semibold uppercase text-muted2">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Pallet type</th>
              <th className="px-4 py-3">UOM kg/carton</th>
              <th className="px-4 py-3">Pallet limit kg</th>
              <th className="px-4 py-3">Plant</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {materials.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-bold text-navy">{m.code}</td>
                <td className="px-4 py-3">{m.description}</td>
                <td className="px-4 py-3">{m.category}</td>
                <td className="px-4 py-3">{m.palletType}</td>
                <td className="px-4 py-3">{m.uomKgPerCarton}</td>
                <td className="px-4 py-3">
                  <PalletWeightEditor material={m} onUpdated={onUpdated} />
                </td>
                <td className="px-4 py-3">{m.plantOrigin}</td>
                <td className="px-4 py-3">
                  <StatusPill active={m.active === 1} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Per-material pallet weight limit editor (Loop 29 - Alpesh asked
 * that admins be able to set this per material, since the real DSR
 * source has no such field to seed a real value from). Same
 * stub-mode-honest pattern as every other mutation in this app: a
 * 503 in Clerk stub mode is shown plainly, not hidden.
 */
function PalletWeightEditor({ material, onUpdated }: { material: Material; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(material.palletWeightLimitKg));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(String(material.palletWeightLimitKg));
          setError(null);
          setNotice(null);
          setEditing(true);
        }}
        className="min-h-[32px] text-left underline decoration-dotted"
        title="Edit pallet weight limit"
      >
        {material.palletWeightLimitKg} kg
      </button>
    );
  }

  async function save() {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      setError("Must be a positive number.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/masters/materials/${material.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ palletWeightLimitKg: num }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          setNotice(body.error);
        } else {
          setError(body.error ?? `Request failed (${res.status}).`);
        }
        return;
      }
      setEditing(false);
      onUpdated();
    } catch {
      setError("Network error - could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-[36px] w-20 rounded-lg border border-line bg-white px-2 text-sm text-ink2 outline-none focus:border-teal"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="min-h-[36px] rounded-lg bg-teal px-2 text-xs font-bold text-white disabled:opacity-60"
        >
          {saving ? "..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="min-h-[36px] rounded-lg border border-line px-2 text-xs font-bold text-ink2"
        >
          Cancel
        </button>
      </div>
      {error ? <span className="text-xs font-semibold text-danger">{error}</span> : null}
      {notice ? <span className="text-xs font-semibold text-warning">{notice}</span> : null}
    </div>
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
