"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  Field,
  Note,
  Pill,
  StatTile,
  StateBox,
  SubText,
  btn,
  inputClass,
  tableCls,
  tdCls,
  thCls,
  trCls,
} from "@/components/ui";

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
      <PageHeader breadcrumb="Operations / Hold Tracking" title="Hold Management" />
      <div className="flex flex-col gap-5 bg-canvas p-4 sm:p-6">
        {loadState === "loading" ? (
          <StateBox>Loading...</StateBox>
        ) : loadState === "permission-denied" ? (
          <div
            className="rounded-xl border border-warning bg-warning-light p-6 text-sm font-semibold text-[#B45309] shadow-card"
            role="alert"
          >
            {loadMessage}
          </div>
        ) : loadState === "error" ? (
          <StateBox tone="danger">{loadMessage}</StateBox>
        ) : (
          <>
            <section aria-label="Hold Summary">
              <h2 className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-muted2">Hold Summary</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile color="#DC2626" label="Red · overdue (>7d)" value={summary.red} sub="needs escalation" />
                <StatTile color="#D97706" label="Amber (>3d)" value={summary.amber} sub="follow up" />
                <StatTile color="#0284C7" label="Active Holds" value={summary.active} sub={`${summary.ok} within 3 days`} />
                <StatTile color="#475569" label="Total Cartons" value={summary.totalCartons} sub="on active holds" />
              </div>
            </section>

            <Card title="Place a hold" sub="QC_HOLD pallets of one batch · fixed reason list">
              <form className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={handleCreate}>
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

                <div className="sm:col-span-2 lg:col-span-3">
                  <div className="text-xs font-bold text-ink2">QC_HOLD pallets for this material</div>
                  {fieldErrors.pallets ? (
                    <div className="mt-1 text-xs font-semibold text-danger">{fieldErrors.pallets}</div>
                  ) : null}
                  {!selectedMaterial ? (
                    <div className="mt-2 text-xs text-muted">Pick a material to see its QC_HOLD pallets.</div>
                  ) : eligiblePallets.length === 0 ? (
                    <div className="mt-2 text-xs text-muted">No QC_HOLD pallets for this material right now.</div>
                  ) : (
                    <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {eligiblePallets.map((p) => {
                        const checked = selectedPalletIds.includes(p.id);
                        return (
                          <li key={p.id}>
                            <label
                              className={
                                "flex min-h-[48px] items-center gap-2.5 rounded-[11px] border-[1.5px] px-3 text-sm text-ink2 transition " +
                                (checked ? "border-teal bg-teal-light/50" : "border-line bg-white")
                              }
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-teal"
                                checked={checked}
                                onChange={() => togglePallet(p.id)}
                              />
                              <span className="font-bold text-ink">{p.palletNumber}</span>
                              <span className="text-xs text-muted">
                                batch {p.batchNumber} - {p.totalCartons} cartons
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  {formNotice ? (
                    <p className="mb-3 rounded-lg bg-warning-light p-3 text-xs font-semibold text-[#B45309]" role="status">
                      {formNotice}
                    </p>
                  ) : null}
                  {formError ? (
                    <p className="mb-3 rounded-lg bg-danger-light p-3 text-xs font-semibold text-danger" role="alert">
                      {formError}
                    </p>
                  ) : null}
                  <button type="submit" disabled={submitState === "submitting"} className={btn("gold", "w-full sm:w-auto")}>
                    {submitState === "submitting" ? "Placing hold..." : "Place hold"}
                  </button>
                </div>
              </form>
            </Card>

            {actionMessage ? (
              <p
                className={
                  "rounded-lg p-3 text-xs font-semibold " +
                  (actionMessage.kind === "notice" ? "bg-warning-light text-[#B45309]" : "bg-danger-light text-danger")
                }
                role="status"
              >
                {actionMessage.text}
              </p>
            ) : null}

            <Card
              title="Active Holds"
              sub={`${filteredHolds.length} hold(s) · ${filteredHolds.reduce((sum, h) => sum + h.totalCartons, 0)} cartons`}
              action={
                agedHolds.length > 0 ? (
                  <button type="button" onClick={sendReminderToAll} className={btn("gold")}>
                    ⚡ Send Reminder
                  </button>
                ) : null
              }
              bodyClassName="px-4 pb-4 pt-3"
            >
              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select className={inputClass()} value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}>
                  <option value="">All Reasons</option>
                  {HOLD_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <select className={inputClass()} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                  <option value="">All Depts</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <select className={inputClass()} value={agingFilter} onChange={(e) => setAgingFilter(e.target.value)}>
                  <option value="">All Aging</option>
                  <option value="RED">Red (&gt;7d)</option>
                  <option value="AMBER">Amber (&gt;3d)</option>
                  <option value="OK">OK</option>
                </select>
              </div>

              {filteredHolds.length === 0 ? (
                <div className="rounded-lg bg-canvas p-5 text-center text-sm text-muted">No holds match these filters.</div>
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

                  <div className="hidden overflow-x-auto sm:block">
                    <table className={tableCls + " min-w-[1000px]"}>
                      <thead>
                        <tr>
                          <th className={thCls}>Hold ID</th>
                          <th className={thCls}>Material</th>
                          <th className={thCls}>Pallets / Qty</th>
                          <th className={thCls}>Reason</th>
                          <th className={thCls}>Placed By</th>
                          <th className={thCls + " text-center"}>Aging</th>
                          <th className={thCls}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHolds.map((h) => (
                          <tr key={h.id} className={trCls + " " + holdRowTint(h)}>
                            <td className={tdCls + " font-extrabold text-ink"}>{h.holdNumber}</td>
                            <td className={tdCls}>
                              <div className="font-bold text-ink">{h.materialCode}</div>
                              <SubText>{h.batchNumber}</SubText>
                            </td>
                            <td className={tdCls}>
                              <div className="text-ink2">{h.palletNumbers.join(", ")}</div>
                              <SubText>
                                {h.palletCount} pallet(s) · {h.totalCartons} ctn
                              </SubText>
                            </td>
                            <td className={tdCls + " text-ink2"}>
                              {h.holdReason === OTHER_REASON ? h.customReason : h.holdReason}
                            </td>
                            <td className={tdCls + " text-ink2"}>{h.placedByDepartment}</td>
                            <td className={tdCls + " text-center"}>
                              <AgeBadge hold={h} />
                            </td>
                            <td className={tdCls}>
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
                                <span className="text-xs text-muted2">{h.status.toLowerCase()} by QC</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>

            <Card title="Follow-Up Nudge" accentColor="#D97706">
              {agedHolds.length === 0 ? (
                <p className="text-sm text-muted">No aged holds (amber/red) right now.</p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink2">
                    Send reminder to QC LAB about {agedHolds.length} aged hold{agedHolds.length === 1 ? "" : "s"}?
                  </p>
                  <button type="button" onClick={sendReminderToAll} className={btn("gold")}>
                    Send Reminder
                  </button>
                </div>
              )}
            </Card>

            <Note>
              🚫 <b>Hard block:</b> HOLD / QC_HOLD material cannot be selected for party dispatch. A 3PL transfer keeps the
              HOLD tag. Release or reject is QC role only.
            </Note>
          </>
        )}
      </div>
    </>
  );
}

function holdRowTint(h: Hold) {
  if (!isOpenHold(h.status)) return "bg-[#F0FDF9]";
  if (h.ageBucket === "RED") return "bg-[#FEF2F2]";
  return "";
}

function AgeBadge({ hold }: { hold: Hold }) {
  if (!isOpenHold(hold.status)) {
    return <Pill tone={hold.status === "RELEASED" ? "ok" : "rejected"}>{hold.status}</Pill>;
  }
  const tone = hold.ageBucket === "RED" ? "rejected" : hold.ageBucket === "AMBER" ? "hold" : "ok";
  return (
    <span className="inline-flex items-center gap-1">
      <Pill tone={tone}>
        {hold.ageDays}
        {AGE_LABEL[hold.ageBucket!]}
      </Pill>
      {hold.status === "PARTIALLY_RELEASED" ? <Pill tone="hold">PARTIAL</Pill> : null}
    </span>
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
          className={btn("outline", "px-3 text-xs")}
        >
          Follow Up
        </button>
        <button
          type="button"
          onClick={() => openActionRow(hold.id, "release")}
          className={btn("teal", "px-3 text-xs")}
        >
          Release
        </button>
        <button
          type="button"
          onClick={() => openActionRow(hold.id, "reject")}
          className={btn("danger", "px-3 text-xs")}
        >
          Reject
        </button>
      </div>
      {isThisRow ? (
        <div className="flex flex-col gap-2 rounded-xl border-[1.5px] border-dashed border-[#CBD5E1] bg-[#FAFBFC] p-3">
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
                    <label className="flex min-h-[44px] items-center gap-2 rounded-lg border border-line bg-white px-2.5 text-xs text-ink2">
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
            className={inputClass()}
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
              className={btn("primary", "flex-1 px-3 text-xs")}
            >
              Confirm {actionRow!.kind === "reject" ? "Reject" : "Release"}
              {actionPallets.length > 1 ? ` (${actionSelectedPalletIds.length})` : ""}
            </button>
            <button
              type="button"
              onClick={() => setActionRow(null)}
              className={btn("outline", "px-3 text-xs")}
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
    <li className={"rounded-xl border border-line p-4 shadow-card " + (holdRowTint(hold) || "bg-white")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-extrabold text-ink">{hold.holdNumber}</span>
        <AgeBadge hold={hold} />
      </div>
      <div className="mt-1.5 text-xs">
        <span className="font-bold text-ink">{hold.materialCode}</span>{" "}
        <span className="text-muted2">- batch {hold.batchNumber}</span>
      </div>
      <div className="mt-1 text-xs text-ink2">{hold.holdReason === OTHER_REASON ? hold.customReason : hold.holdReason}</div>
      <div className="mt-1 text-xs text-muted2">
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
