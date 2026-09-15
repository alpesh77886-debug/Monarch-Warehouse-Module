import { ValidationError, ConflictError } from "../errors";

/**
 * Receiving Sheet business rules (Loop 35 / TASK-004), grounded directly
 * in the canonical flow document's Flow 1, workflows.yaml's own
 * receiving_sheet_status state machine, and the negative-tests contract
 * (NS-006/011/012/018/019). Nothing here is invented beyond two disclosed,
 * evidence-grounded defaults used only at lock time (see
 * materializeLockedSheet's own comment) - see PEN-034/035 in
 * docs/PENDING_ITEMS.md for exactly what those are and why.
 */

export type ReceivingSheetStatus = "DRAFT" | "PENDING_PACKING" | "PENDING_WAREHOUSE" | "LOCKED" | "CANCELLED";

export const MAX_PALLETS_PER_SHEET = 35;
export const TEMPERATURE_WARNING_THRESHOLD_C = -15;

// Same pattern as the batches table's own validation - transcribed
// directly from the entities contract: "L" + Year(2) + Month(letter,
// A=Jan..L=Dec) + Day(2) + Sequence(3-4 digits).
const BATCH_NUMBER_PATTERN = /^L[0-9]{2}[A-L][0-9]{2}[0-9]{3,4}$/;

export const CARTON_CONDITIONS = [
  "OK",
  "BULGING",
  "DAMAGED",
  "WET",
  "SHORT_QUANTITY",
  "OTHER",
] as const;
export type CartonCondition = (typeof CARTON_CONDITIONS)[number];

/** NS-018: "Invalid batch number format" -> 422. */
export function validateBatchNumberFormat(batchNumber: string): void {
  if (!BATCH_NUMBER_PATTERN.test(batchNumber)) {
    throw new ValidationError(
      `Invalid batch format: "${batchNumber}" must match L + 2-digit year + month letter (A-L) + 2-digit day + 3-4 digit sequence, e.g. L26I070938.`
    );
  }
}

/**
 * Dispute-prevention rule (Flow 1 Step 2, GS-008): a carton condition
 * other than OK must carry a remark recorded at receiving time - this is
 * the specific mechanism the flow document says "ends the disputes",
 * not a generic form-validation nicety.
 */
export function validateCartonCondition(condition: string, remarks: string | null | undefined): void {
  if (!(CARTON_CONDITIONS as readonly string[]).includes(condition)) {
    throw new ValidationError(`Carton condition must be one of: ${CARTON_CONDITIONS.join(", ")}.`);
  }
  if (condition !== "OK" && (!remarks || remarks.trim().length === 0)) {
    throw new ValidationError(
      `Remarks are required when carton condition is ${condition} (dispute-prevention record - Flow 1).`
    );
  }
}

/** Flow 1 Step 2: "> -15C -> amber warning", a UI/informational flag, not a hard block. */
export function isTemperatureAboveThreshold(temperatureC: number | null | undefined): boolean {
  return typeof temperatureC === "number" && temperatureC > TEMPERATURE_WARNING_THRESHOLD_C;
}

/** NS-019: "More than 35 pallets on receiving sheet" -> 422. */
export function assertCanAddPalletRow(existingRowCount: number): void {
  if (existingRowCount >= MAX_PALLETS_PER_SHEET) {
    throw new ValidationError(`Maximum ${MAX_PALLETS_PER_SHEET} pallets per receiving sheet.`);
  }
}

// A=Jan .. L=Dec, per the entities contract's own worked example
// ("L26I071249 = 2026, September(I), 07th, sequence 1249").
const MONTH_LETTERS = "ABCDEFGHIJKL";

/**
 * Derives the batch's production_date from its own batch number, exactly
 * as ENTITY-002 (Batch) says: "production_date ... derived from
 * batch_number". Only called after validateBatchNumberFormat has already
 * confirmed the shape, so the regex groups below are guaranteed to match.
 */
export function productionDateFromBatchNumber(batchNumber: string): string {
  const match = batchNumber.match(/^L([0-9]{2})([A-L])([0-9]{2})[0-9]{3,4}$/);
  if (!match) {
    throw new ValidationError(`Invalid batch format: "${batchNumber}" cannot be parsed for a production date.`);
  }
  const [, yy, monthLetter, dd] = match;
  const year = 2000 + Number(yy);
  const month = MONTH_LETTERS.indexOf(monthLetter) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${dd}`;
}

export type ConfirmAction = "packing_confirm" | "warehouse_confirm";

/**
 * Pure state-machine step, transcribed exactly from workflows.yaml's own
 * receiving_sheet_status transitions - no state or action combination
 * not explicitly listed there is accepted. LOCKED is a dead end (also
 * backstopped by the receiving_sheets_locked_immutable DB trigger,
 * INV-008) - re-confirming an already-confirmed side, or confirming out
 * of order, both fall through to the ConflictError case (NS-011's own
 * "one succeeds" - the other caller's stale read of `current` no longer
 * matches a valid transition once the first request has already moved
 * the row).
 */
export function nextReceivingSheetStatus(
  current: ReceivingSheetStatus,
  action: ConfirmAction
): ReceivingSheetStatus {
  if (current === "DRAFT" && action === "warehouse_confirm") return "PENDING_PACKING";
  if (current === "DRAFT" && action === "packing_confirm") return "PENDING_WAREHOUSE";
  if (current === "PENDING_PACKING" && action === "packing_confirm") return "LOCKED";
  if (current === "PENDING_WAREHOUSE" && action === "warehouse_confirm") return "LOCKED";
  if (current === "LOCKED") {
    throw new ValidationError("Locked sheets are immutable.");
  }
  throw new ConflictError(
    `Cannot ${action} a sheet in status ${current} - it may have just been confirmed by someone else.`
  );
}

/**
 * PEN-033 (Loop 39, Alpesh-approved): workflows.yaml's own
 * receiving_sheet_status state machine names exactly one transition into
 * CANCELLED - {from: DRAFT, to: CANCELLED, action: cancel} - and no actor
 * restriction narrower than "whoever can already create/edit a DRAFT
 * sheet" is stated anywhere, so this is gated with the same
 * "receiving_sheet.create" permission the PATCH (edit) route already
 * uses, not a new, invented permission string.
 */
/**
 * sheet_number generated_format "RS-YYYY-MMDD-NNN" (ENTITY-009's own
 * format string). Pulled out as its own pure function (Loop 42) so the
 * new bulk-repack route can generate a repack receiving sheet's number
 * with the exact same convention as the original create route, without
 * duplicating the format string itself - only the DB query that counts
 * today's existing sheets stays local to each route, same as
 * loadingSheetNumberPrefix/nextLoadingSheetNumber's own split.
 */
export function receivingSheetNumberPrefix(date: string): string {
  const [y, m, d] = date.split("-");
  return `RS-${y}-${m}${d}-`;
}

export function assertCanCancel(current: ReceivingSheetStatus): void {
  if (current === "LOCKED") {
    throw new ValidationError("Locked sheets are immutable.");
  }
  if (current === "CANCELLED") {
    throw new ValidationError("This sheet is already cancelled.");
  }
  if (current !== "DRAFT") {
    throw new ValidationError(
      `Only a DRAFT sheet can be cancelled - this sheet is ${current}. Cancel it before either side confirms.`
    );
  }
}
