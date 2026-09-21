"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/PageHeader";

type MaterialOption = { id: string; code: string; description: string };

type PalletOption = {
  id: string;
  palletNumber: string;
  materialId: string;
  materialCode: string;
  statusCode: string;
  totalCartons: number;
  batchId: string | null;
  batchNumber: string | null;
};

type AgeBucket = "RED" | "AMBER" | "OK" | null;

type Hold = {
  id: string;
  holdNumber: string;
  materialCode: string;
  materialDescription: string;
  batchNumber: string;
  holdReason: string;
  customReason: string | null;
  placedByDepartment: string;
  placedAt: string;
  status: "ACTIVE" | "RELEASED" | "REJECTED" | "PARTIALLY_RELEASED";
  qcFollowupCount: number;
  lastFollowupAt: string | null;
  palletCount: number;
  totalCartons: number;
  totalWeightKg: number;
  palletNumbers: string[];
  ageDays: number;
  ageBucket: AgeBucket;
};

type LoadState = "loading" | "ready" | "error" | "permission-denied";

const HOLD_REASONS = [
  "High Temperature",
  "Metal piece found (repass needed)",
  "Thread contamination",
  "Enzyme test positive",
  "Uneven coating / Belt mark",
  "High defects / Major defects",
  "Dull appearance and color difference",
  "Short length",
  "Black particles",
  "White patches on product surface",
  "Wrong batch code printed",
  "Batter bubbles",
  "Product carton not available",
  "Low retention time",
  "Bad smell in product",
  "Misshapes",
  "Over-production (bulk)",
  "Defective fries (bulk)",
  "Trial / Sample",
  "Other (requires supervisor approval)",
];
const OTHER_REASON = "Other (requires supervisor approval)";

const AGE_DOT: Record<Exclude<AgeBucket, null>, string> = {
  RED: "bg-danger",
  AMBER: "bg-warning",
  OK: "bg-muted2",
};
const AGE_LABEL: Record<Exclude<AgeBucket, null>, string> = { RED: "d", AMBER: "d", OK: "d" };

// Loop 50 / PEN-037: a hold with a partial release still has real
// ACTIVE pallets that need the same age/action treatment as a plain
// ACTIVE hold - only RELEASED/REJECTED (every pallet done) is "closed".
function isOpenHold(status: Hold["status"]): boolean {
  return status === "ACTIVE" || status === "PARTIALLY_RELEASED";
}

type HeldPalletDetail = {
  id: string;
  palletNumber: string;
  totalCartons: number;
  holdPalletStatus: "ACTIVE" | "RELEASED" | "REJECTED";
};

const EMPTY_FORM = {
  materialCode: "",
  holdReason: HOLD_REASONS[0],
  customReason: "",
  placedByDepartment: "",
};

export default function HoldsPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [pallets, setPallets] = useState<PalletOption[]>([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedPalletIds, setSelectedPalletIds] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [reasonFilter, setReasonFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [agingFilter, setAgingFilter] = useState("");

  const [actionRow, setActionRow] = useState<{ id: string; kind: "release" | "reject" } | null>(null);
  const [actionRemarks, setActionRemarks] = useState("");
  const [actionMessage, setActionMessage] = useState<{ text: string; kind: "notice" | "error" } | null>(null);
  // Loop 50 / PEN-037: which specific ACTIVE pallets on the open action
  // row are selected to release/reject - fetched fresh per hold when the
  // action row opens, defaulted to "all of them" (the same whole-hold
  // behavior this screen already had), and narrowable from there.
  const [actionPallets, setActionPallets] = useState<HeldPalletDetail[]>([]);
  const [actionSelectedPalletIds, setActionSelectedPalletIds] = useState<string[]>([]);
  const [actionPalletsLoading, setActionPalletsLoading] = useState(false);

  async function loadAll() {
    setLoadState("loading");
    setLoadMessage(null);
    try {
      const [holdsRes, materialsRes, palletsRes] = await Promise.all([
        fetch("/api/holds"),
        fetch("/api/masters/materials"),
        fetch("/api/pallets"),
      ]);
      const holdsBody = await holdsRes.json();
      if (!holdsRes.ok) {
        if (holdsRes.status === 401 || holdsRes.status === 403 || holdsRes.status === 503) {
          setLoadMessage(holdsBody.error);
          setLoadState("permission-denied");
        } else {
          setLoadMessage(holdsBody.error ?? `Request failed (${holdsRes.status}).`);
          setLoadState("error");
        }
        return;
      }
      setHolds(holdsBody.holds as Hold[]);

      if (materialsRes.ok) {
        const materialsBody = await materialsRes.json();
        setMaterials(
          (materialsBody.materials as { id: string; code: string; description: string }[]).map((m) => ({
            id: m.id,
            code: m.code,
            description: m.description,
          }))
        );
      }
      if (palletsRes.ok) {
        const palletsBody = await palletsRes.json();
        setPallets(palletsBody.pallets as PalletOption[]);
      }
      setLoadState("ready");
    } catch {
      setLoadMessage("Network error - could not reach the server.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const selectedMaterial = materials.find((m) => m.code.toUpperCase() === form.materialCode.trim().toUpperCase());
  const eligiblePallets = useMemo(() => {
    if (!selectedMaterial) return [];
    return pallets.filter(
      (p) => p.materialId === selectedMaterial.id && p.statusCode === "QC_HOLD" && p.batchId !== null
    );
  }, [pallets, selectedMaterial]);

  const departments = useMemo(
    () => Array.from(new Set(holds.map((h) => h.placedByDepartment))).sort(),
    [holds]
  );

  const filteredHolds = holds.filter((h) => {
    if (reasonFilter && h.holdReason !== reasonFilter) return false;
    if (deptFilter && h.placedByDepartment !== deptFilter) return false;
    if (agingFilter && h.ageBucket !== agingFilter) return false;
    return true;
  });

  const activeHolds = holds.filter((h) => isOpenHold(h.status));
  const summary = {
    active: activeHolds.length,
    totalCartons: activeHolds.reduce((sum, h) => sum + h.totalCartons, 0),
    red: activeHolds.filter((h) => h.ageBucket === "RED").length,
    amber: activeHolds.filter((h) => h.ageBucket === "AMBER").length,
    ok: activeHolds.filter((h) => h.ageBucket === "OK").length,
  };
  const agedHolds = activeHolds.filter((h) => h.ageBucket === "RED" || h.ageBucket === "AMBER");

  function togglePallet(id: string) {
    setSelectedPalletIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFormNotice(null);

    const errors: Record<string, string> = {};
    if (!selectedMaterial) {
      errors.materialCode = "Pick a real material code out of the suggestions list.";
    }
    if (selectedPalletIds.length === 0) {
      errors.pallets = "Select at least one QC_HOLD pallet.";
    }
    const chosenPallets = pallets.filter((p) => selectedPalletIds.includes(p.id));
    const batchIds = new Set(chosenPallets.map((p) => p.batchId));
    if (batchIds.size > 1) {
      errors.pallets = "Selected pallets have different batches - a hold can only cover one batch.";
    }
    if (form.holdReason === OTHER_REASON && !form.customReason.trim()) {
      errors.customReason = "A custom reason is required for \"Other\".";
    }
    if (!form.placedByDepartment.trim()) {
      errors.placedByDepartment = "Department is required.";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitState("submitting");
    try {
      const res = await fetch("/api/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: selectedMaterial!.id,
          batchId: chosenPallets[0].batchId,
          palletIds: selectedPalletIds,
          holdReason: form.holdReason,
          customReason: form.holdReason === OTHER_REASON ? form.customReason.trim() : null,
          placedByDepartment: form.placedByDepartment.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          setFormNotice(body.error);
        } else {
          setFormError(body.error ?? `Request failed (${res.status}).`);
        }
        return;
      }
      setForm(EMPTY_FORM);
      setSelectedPalletIds([]);
      await loadAll();
    } catch {
      setFormError("Network error - could not reach the server.");
    } finally {
      setSubmitState("idle");
    }
  }

  async function openActionRow(holdId: string, kind: "release" | "reject") {
    setActionRow({ id: holdId, kind });
    setActionRemarks("");
    setActionPallets([]);
    setActionSelectedPalletIds([]);
    setActionPalletsLoading(true);
    try {
      const res = await fetch(`/api/holds/${holdId}`);
      const body = await res.json();
      if (!res.ok) {
        setActionMessage({ text: body.error ?? `Request failed (${res.status}).`, kind: "error" });
        setActionRow(null);
        return;
      }
      const activePallets = (body.pallets as HeldPalletDetail[]).filter((p) => p.holdPalletStatus === "ACTIVE");
      setActionPallets(activePallets);
      setActionSelectedPalletIds(activePallets.map((p) => p.id));
    } catch {
      setActionMessage({ text: "Network error - could not reach the server.", kind: "error" });
      setActionRow(null);
    } finally {
      setActionPalletsLoading(false);
    }
  }

  function toggleActionPallet(id: string) {
    setActionSelectedPalletIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function runAction(holdId: string, path: "release" | "reject" | "followup", body?: unknown) {
    setActionMessage(null);
    try {
      const res = await fetch(`/api/holds/${holdId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const responseBody = await res.json();
      if (!res.ok) {
        setActionMessage({ text: responseBody.error ?? `Request failed (${res.status}).`, kind: "error" });
        return;
      }
      setActionMessage({
        text:
          path === "followup"
            ? "Follow-up nudge recorded."
            : path === "release"
              ? "Hold released."
              : "Hold rejected.",
        kind: "notice",
      });
      setActionRow(null);
      setActionRemarks("");
      setActionPallets([]);
      setActionSelectedPalletIds([]);
      await loadAll();
    } catch {
      setActionMessage({ text: "Network error - could not reach the server.", kind: "error" });
    }
  }

  async function sendReminderToAll() {
    for (const h of agedHolds) {
      // eslint-disable-next-line no-await-in-loop
      await runAction(h.id, "followup");
    }
  }

  return (
    <>
      <PageHeader breadcrumb="Home / Hold Management" title="Hold Management" />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        {loadState === "loading" ? (
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
            Loading...
          </div>
        ) : loadState === "permission-denied" ? (
          <div
            className="rounded-xl border border-warning bg-warning-light p-6 text-sm text-warning shadow-card"
            role="alert"
          >
            {loadMessage}
          </div>
        ) : loadState === "error" ? (
          <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
            {loadMessage}
          </div>
        ) : (
          <>
            <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
              <h2 className="text-sm font-bold text-navy">Hold Summary</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryTile label="Active Holds" value={summary.active} />
                <SummaryTile label="Total Cartons" value={summary.totalCartons} />
                <SummaryTile label="Red (>7d)" value={summary.red} dot="bg-danger" />
                <SummaryTile label="Amber (>3d)" value={summary.amber} dot="bg-warning" />
              </div>
            </section>

            <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
              <h2 className="text-sm font-bold text-navy">Place a hold</h2>
              <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleCreate}>
                <Field label="Material (LFG/SFG code)" error={fieldErrors.materialCode}>
                  <input
                    className={inputClass(fieldErrors.materialCode)}
                    list="hold-material-options"
                    placeholder="Search LFG/SFG..."
                    value={form.materialCode}
                    onChange={(e) => {
                      setForm({ ...form, materialCode: e.target.value });
                      setSelectedPalletIds([]);
                    }}
                  />
                  <datalist id="hold-material-options">
                    {materials.map((m) => (
                      <option key={m.id} value={m.code}>
                        {m.description}
                      </option>
                    ))}
                  </datalist>
                </Field>
                <Field label="Hold reason">
                  <select
                    className={inputClass()}
                    value={form.holdReason}
                    onChange={(e) => setForm({ ...form, holdReason: e.target.value })}
                  >
                    {HOLD_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                {form.holdReason === OTHER_REASON ? (
                  <Field label="Custom reason" error={fieldErrors.customReason}>
                    <input
                      className={inputClass(fieldErrors.customReason)}
                      value={form.customReason}
                      onChange={(e) => setForm({ ...form, customReason: e.target.value })}
                      placeholder="Describe the issue (supervisor approval required)"
                    />
                  </Field>
                ) : null}
                <Field label="Department" error={fieldErrors.placedByDepartment}>
                  <input
                    className={inputClass(fieldErrors.placedByDepartment)}
                    value={form.placedByDepartment}
                    onChange={(e) => setForm({ ...form, placedByDepartment: e.target.value })}
                    placeholder="QC Lab"
                  />
                </Field>

                <div className="sm:col-span-2">
                  <div className="text-xs font-semibold text-ink2">
                    QC_HOLD pallets for this material{fieldErrors.pallets ? "" : null}
                  </div>
                  {fieldErrors.pallets ? (
                    <div className="mt-1 text-xs font-semibold text-danger">{fieldErrors.pallets}</div>
                  ) : null}
                  {!selectedMaterial ? (
                    <div className="mt-2 text-xs text-muted">Pick a material to see its QC_HOLD pallets.</div>
                  ) : eligiblePallets.length === 0 ? (
                    <div className="mt-2 text-xs text-muted">No QC_HOLD pallets for this material right now.</div>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {eligiblePallets.map((p) => (
                        <li key={p.id}>
                          <label className="flex min-h-[44px] items-center gap-2 rounded-lg border border-line px-3 text-sm text-ink2">
                            <input
                              type="checkbox"
                              checked={selectedPalletIds.includes(p.id)}
                              onChange={() => togglePallet(p.id)}
                            />
                            <span className="font-bold">{p.palletNumber}</span>
                            <span className="text-muted">
                              batch {p.batchNumber} - {p.totalCartons} cartons
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="sm:col-span-2">
                  {formNotice ? (
                    <p className="mb-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-warning" role="status">
                      {formNotice}
                    </p>
                  ) : null}
                  {formError ? (
                    <p className="mb-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                      {formError}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={submitState === "submitting"}
                    className="min-h-[48px] w-full rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
                  >
                    {submitState === "submitting" ? "Placing hold..." : "Place hold"}
                  </button>
                </div>
              </form>
            </section>

            <section>
              <div className="flex flex-wrap gap-2">
                <select className={inputClass() + " sm:w-56"} value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}>
                  <option value="">All Reasons</option>
                  {HOLD_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <select className={inputClass() + " sm:w-48"} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                  <option value="">All Depts</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <select className={inputClass() + " sm:w-40"} value={agingFilter} onChange={(e) => setAgingFilter(e.target.value)}>
                  <option value="">All Aging</option>
                  <option value="RED">Red (&gt;7d)</option>
                  <option value="AMBER">Amber (&gt;3d)</option>
                  <option value="OK">OK</option>
                </select>
              </div>
            </section>

            {actionMessage ? (
              <p
                className={
                  "rounded-lg p-3 text-xs font-semibold " +
                  (actionMessage.kind === "notice" ? "bg-warning-light text-warning" : "bg-danger-light text-danger")
                }
                role="status"
              >
                {actionMessage.text}
              </p>
            ) : null}

            <section>
              <h2 className="mb-3 text-sm font-bold text-navy">Active Holds</h2>
              {filteredHolds.length === 0 ? (
                <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
                  No holds match these filters.
                </div>
              ) : (
                <>
                  <ul className="flex flex-col gap-3 sm:hidden">
                    {filteredHolds.map((h) => (
                      <HoldCard
                        key={h.id}
                        hold={h}
                        actionRow={actionRow}
                        actionRemarks={actionRemarks}
                        setActionRemarks={setActionRemarks}
                        openActionRow={openActionRow}
                        setActionRow={setActionRow}
                        runAction={runAction}
                        actionPallets={actionPallets}
                        actionSelectedPalletIds={actionSelectedPalletIds}
                        toggleActionPallet={toggleActionPallet}
                        actionPalletsLoading={actionPalletsLoading}
                      />
                    ))}
                  </ul>

                  <div className="hidden overflow-x-auto rounded-xl border border-line bg-white shadow-card sm:block">
                    <table className="w-full min-w-[1000px] text-left text-sm">
                      <thead className="bg-canvas text-xs font-semibold uppercase text-muted2">
                        <tr>
                          <th className="px-4 py-3">Hold ID</th>
                          <th className="px-4 py-3">Material</th>
                          <th className="px-4 py-3">Batch</th>
                          <th className="px-4 py-3">Qty</th>
                          <th className="px-4 py-3">Pallets</th>
                          <th className="px-4 py-3">Reason</th>
                          <th className="px-4 py-3">Age</th>
                          <th className="px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {filteredHolds.map((h) => (
                          <tr key={h.id}>
                            <td className="px-4 py-3 font-bold text-navy">{h.holdNumber}</td>
                            <td className="px-4 py-3">{h.materialCode}</td>
                            <td className="px-4 py-3">{h.batchNumber}</td>
                            <td className="px-4 py-3">{h.totalCartons}</td>
                            <td className="px-4 py-3">{h.palletNumbers.join(", ")}</td>
                            <td className="px-4 py-3">{h.holdReason === OTHER_REASON ? h.customReason : h.holdReason}</td>
                            <td className="px-4 py-3">
                              {isOpenHold(h.status) ? (
                                <span className="flex items-center gap-1.5">
                                  <span className={"h-2.5 w-2.5 rounded-full " + AGE_DOT[h.ageBucket!]} />
                                  {h.ageDays}
                                  {AGE_LABEL[h.ageBucket!]}
                                  {h.status === "PARTIALLY_RELEASED" ? (
                                    <span className="ml-1 rounded bg-warning-light px-1.5 py-0.5 text-[10px] font-bold text-warning">
                                      PARTIAL
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                <span className="text-muted">{h.status}</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {isOpenHold(h.status) ? (
                                <RowActions
                                  hold={h}
                                  actionRow={actionRow}
                                  actionRemarks={actionRemarks}
                                  setActionRemarks={setActionRemarks}
                                  openActionRow={openActionRow}
                                  setActionRow={setActionRow}
                                  runAction={runAction}
                                  actionPallets={actionPallets}
                                  actionSelectedPalletIds={actionSelectedPalletIds}
                                  toggleActionPallet={toggleActionPallet}
                                  actionPalletsLoading={actionPalletsLoading}
                                />
                              ) : (
                                <span className="text-xs text-muted">
                                  {h.status.toLowerCase()} by {h.status === "RELEASED" ? "QC" : "QC"}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <section className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-6">
              <h2 className="text-sm font-bold text-navy">Follow-Up Nudge</h2>
              {agedHolds.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No aged holds (amber/red) right now.</p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-ink2">
                    Send reminder to QC LAB about {agedHolds.length} aged hold{agedHolds.length === 1 ? "" : "s"}?
                  </p>
                  <button
                    type="button"
                    onClick={sendReminderToAll}
                    className="mt-3 min-h-[48px] rounded-lg bg-teal px-4 text-sm font-bold text-white"
                  >
                    Send Reminder
                  </button>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}

function SummaryTile({ label, value, dot }: { label: string; value: number; dot?: string }) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        {dot ? <span className={"h-2.5 w-2.5 rounded-full " + dot} /> : null}
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-navy">{value}</div>
    </div>
  );
}

type ActionRunner = (holdId: string, path: "release" | "reject" | "followup", body?: unknown) => Promise<void>;
type ActionRowState = { id: string; kind: "release" | "reject" } | null;
type OpenActionRow = (holdId: string, kind: "release" | "reject") => Promise<void>;

function RowActions({
  hold,
  actionRow,
  actionRemarks,
  setActionRemarks,
  openActionRow,
  setActionRow,
  runAction,
  actionPallets,
  actionSelectedPalletIds,
  toggleActionPallet,
  actionPalletsLoading,
}: {
  hold: Hold;
  actionRow: ActionRowState;
  actionRemarks: string;
  setActionRemarks: (v: string) => void;
  openActionRow: OpenActionRow;
  setActionRow: (v: ActionRowState) => void;
  runAction: ActionRunner;
  actionPallets: HeldPalletDetail[];
  actionSelectedPalletIds: string[];
  toggleActionPallet: (id: string) => void;
  actionPalletsLoading: boolean;
}) {
  const isThisRow = actionRow?.id === hold.id;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => runAction(hold.id, "followup")}
          className="min-h-[36px] rounded-lg border border-line px-3 text-xs font-bold text-ink2"
        >
          Follow Up
        </button>
        <button
          type="button"
          onClick={() => openActionRow(hold.id, "release")}
          className="min-h-[36px] rounded-lg bg-success px-3 text-xs font-bold text-white"
        >
          Release
        </button>
        <button
          type="button"
          onClick={() => openActionRow(hold.id, "reject")}
          className="min-h-[36px] rounded-lg bg-danger px-3 text-xs font-bold text-white"
        >
          Reject
        </button>
      </div>
      {isThisRow ? (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-canvas p-2">
          {actionPalletsLoading ? (
            <div className="text-xs text-muted">Loading pallets...</div>
          ) : actionPallets.length > 1 ? (
            <div>
              {/* Loop 50 / PEN-037: only shown when a hold covers more than
                  one pallet - unchecking a pallet here is exactly the
                  "release 300 of 1200 boxes" case (uncheck the pallets not
                  ready yet), all checked by default so a single click still
                  does the old full-hold action. */}
              <div className="mb-1 text-[11px] font-semibold text-ink2">
                Pallets to {actionRow!.kind} ({actionSelectedPalletIds.length}/{actionPallets.length} selected)
              </div>
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {actionPallets.map((p) => (
                  <li key={p.id}>
                    <label className="flex min-h-[36px] items-center gap-2 rounded border border-line bg-white px-2 text-xs text-ink2">
                      <input
                        type="checkbox"
                        checked={actionSelectedPalletIds.includes(p.id)}
                        onChange={() => toggleActionPallet(p.id)}
                      />
                      <span className="font-bold">{p.palletNumber}</span>
                      <span className="text-muted">{p.totalCartons} cartons</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <input
            className="min-h-[40px] rounded-lg border border-line bg-white px-2 text-xs text-ink2 outline-none focus:border-teal"
            placeholder={actionRow!.kind === "reject" ? "Reason (required)" : "Remarks (optional)"}
            value={actionRemarks}
            onChange={(e) => setActionRemarks(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={actionSelectedPalletIds.length === 0}
              onClick={() =>
                runAction(hold.id, actionRow!.kind, {
                  releaseRemarks: actionRemarks,
                  palletIds: actionSelectedPalletIds,
                })
              }
              className="min-h-[36px] flex-1 rounded-lg bg-navy px-3 text-xs font-bold text-white disabled:opacity-60"
            >
              Confirm {actionRow!.kind === "reject" ? "Reject" : "Release"}
              {actionPallets.length > 1 ? ` (${actionSelectedPalletIds.length})` : ""}
            </button>
            <button
              type="button"
              onClick={() => setActionRow(null)}
              className="min-h-[36px] rounded-lg border border-line px-3 text-xs font-bold text-ink2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HoldCard({
  hold,
  actionRow,
  actionRemarks,
  setActionRemarks,
  openActionRow,
  setActionRow,
  runAction,
  actionPallets,
  actionSelectedPalletIds,
  toggleActionPallet,
  actionPalletsLoading,
}: {
  hold: Hold;
  actionRow: ActionRowState;
  actionRemarks: string;
  setActionRemarks: (v: string) => void;
  openActionRow: OpenActionRow;
  setActionRow: (v: ActionRowState) => void;
  runAction: ActionRunner;
  actionPallets: HeldPalletDetail[];
  actionSelectedPalletIds: string[];
  toggleActionPallet: (id: string) => void;
  actionPalletsLoading: boolean;
}) {
  return (
    <li className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-navy">{hold.holdNumber}</span>
        {isOpenHold(hold.status) ? (
          <span className="flex items-center gap-1.5 text-xs text-ink2">
            <span className={"h-2.5 w-2.5 rounded-full " + AGE_DOT[hold.ageBucket!]} />
            {hold.ageDays}d
            {hold.status === "PARTIALLY_RELEASED" ? (
              <span className="rounded bg-warning-light px-1.5 py-0.5 text-[10px] font-bold text-warning">PARTIAL</span>
            ) : null}
          </span>
        ) : (
          <span className="text-xs text-muted">{hold.status}</span>
        )}
      </div>
      <div className="mt-1 text-xs text-muted">
        {hold.materialCode} - batch {hold.batchNumber}
      </div>
      <div className="mt-1 text-xs text-muted">
        {hold.holdReason === OTHER_REASON ? hold.customReason : hold.holdReason}
      </div>
      <div className="mt-1 text-xs text-muted">
        {hold.palletCount} pallet(s), {hold.totalCartons} cartons - {hold.palletNumbers.join(", ")}
      </div>
      {isOpenHold(hold.status) ? (
        <div className="mt-3">
          <RowActions
            hold={hold}
            actionRow={actionRow}
            actionRemarks={actionRemarks}
            setActionRemarks={setActionRemarks}
            openActionRow={openActionRow}
            setActionRow={setActionRow}
            runAction={runAction}
            actionPallets={actionPallets}
            actionSelectedPalletIds={actionSelectedPalletIds}
            toggleActionPallet={toggleActionPallet}
            actionPalletsLoading={actionPalletsLoading}
          />
        </div>
      ) : null}
    </li>
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
