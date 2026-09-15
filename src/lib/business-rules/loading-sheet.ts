import { ValidationError } from "../errors";

/**
 * Loading Sheet business rules (Loop 41 / TASK-008, Flow 5/6).
 *
 * Grounded directly in the domain entities contract's `loading_sheet`
 * entity (ENTITY-013), invariants INV-001 through INV-004 and
 * INV-010/011/012/018/019, and the negative-tests contract's NS-001/002/
 * 008/009/010/013 - nothing here is invented beyond the status sequence
 * itself, which the contract lists as a fixed 6-value CHECK constraint
 * but never expresses as an explicit transition table the way
 * pallet_status/receiving_sheet_status are - the sequence below is the
 * direct, non-branching reading of the flow document's own Steps 1-6
 * (Dispatch order -> Pick -> Stage/Load -> Verify -> Gate pass ->
 * Dispatched), not a guess.
 */

export const LOADING_SHEET_STATUSES = [
  "DRAFT",
  "STAGING",
  "LOADED",
  "VERIFIED",
  "GATE_PASSED",
  "DISPATCHED",
] as const;
export type LoadingSheetStatus = (typeof LOADING_SHEET_STATUSES)[number];

export type LoadingSheetAction = "stage" | "load" | "verify" | "gate_pass" | "dispatch";

/**
 * INV-001 through INV-004 / NS-001, NS-002, NS-010: only OK/AVAILABLE
 * material may be picked onto a loading sheet - HOLD, REJECTED, QC_HOLD,
 * and BULK are all hard blocks, not overridable. NS-001/NS-002 give the
 * exact wording for HOLD/REJECTED; QC_HOLD/BULK are not named with their
 * own NS id, so the same wording pattern is extended to them rather than
 * inventing different phrasing for an equally hard block.
 */
export function assertDispatchEligible(statusCode: string): void {
  if (statusCode === "OK") return;
  throw new ValidationError(`Cannot include ${statusCode} material.`);
}

/**
 * INV-010 / NS-008: "system will not allow newer batch dispatch while
 * older batch of same material is available (override possible with
 * logged reason)". Takes the production dates of other real, currently
 * OK-status batches of the same material (already queried by the
 * caller) and the batch actually being picked - pure comparison, no
 * database access here.
 */
export function assertFifoOrderOrOverride(
  pickedProductionDate: string,
  otherAvailableProductionDates: string[],
  overrideReason: string | null | undefined
): void {
  const hasOlderAvailable = otherAvailableProductionDates.some((d) => d < pickedProductionDate);
  if (hasOlderAvailable && !overrideReason?.trim()) {
    throw new ValidationError("FIFO violation - override requires reason.");
  }
}

/**
 * INV-018 / NS-013: "Export containers need QC approval before
 * loading". INV-019: temperature must be recorded (already a NOT NULL
 * column, enforced at the schema level - checked here too for a clean
 * 422 rather than a raw DB error). The entity's own conditional_rule
 * ("required for EXPORT") on qc_approval_by_id/at, container_number,
 * seal_number, and bolt_number is enforced here as a group, at the
 * point the sheet actually tries to move into LOADED.
 */
export function assertReadyToLoad(sheet: {
  exportDomestic: string;
  temperatureC: number | null;
  qcApprovalById: string | null;
  qcApprovalAt: string | null;
  containerNumber: string | null;
  sealNumber: string | null;
  boltNumber: string | null;
}): void {
  if (typeof sheet.temperatureC !== "number") {
    throw new ValidationError("Temperature at loading must be recorded.");
  }
  if (sheet.exportDomestic === "EXPORT") {
    if (!sheet.qcApprovalById || !sheet.qcApprovalAt) {
      throw new ValidationError("Export requires QC approval.");
    }
    if (!sheet.containerNumber || !sheet.sealNumber || !sheet.boltNumber) {
      throw new ValidationError("Export requires container number, seal number, and bolt number.");
    }
  }
}

const TRANSITIONS: Record<LoadingSheetAction, { from: LoadingSheetStatus; to: LoadingSheetStatus }> = {
  stage: { from: "DRAFT", to: "STAGING" },
  load: { from: "STAGING", to: "LOADED" },
  verify: { from: "LOADED", to: "VERIFIED" },
  gate_pass: { from: "VERIFIED", to: "GATE_PASSED" },
  dispatch: { from: "GATE_PASSED", to: "DISPATCHED" },
};

/**
 * NS-009 ("Gate pass without loading sheet" -> 422 "Gate pass requires
 * linked loading sheet"): since gate-pass fields live directly on this
 * one loading_sheet row (the entity has no separate gate-pass table),
 * the real, meaningful reading of that rule is that a gate pass cannot
 * be recorded for a sheet that has not actually been loaded and
 * verified yet - enforced here as the strict linear sequence the flow
 * document itself describes (Steps 1-6), not an invented branch.
 */
export function nextLoadingSheetStatus(current: LoadingSheetStatus, action: LoadingSheetAction): LoadingSheetStatus {
  if (current === "DISPATCHED") {
    throw new ValidationError("Dispatched loading sheets are immutable.");
  }
  const transition = TRANSITIONS[action];
  if (transition.from !== current) {
    if (action === "gate_pass") {
      throw new ValidationError(
        `Gate pass requires linked loading sheet - this sheet must be VERIFIED first (currently ${current}).`
      );
    }
    throw new ValidationError(`Cannot ${action} a loading sheet in status ${current}.`);
  }
  return transition.to;
}

export function loadingSheetNumberPrefix(date: string): string {
  const [y, m, d] = date.split("-");
  return `LS-${y}-${m}${d}-`;
}
