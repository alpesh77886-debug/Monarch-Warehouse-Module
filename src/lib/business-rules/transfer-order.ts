import { ValidationError } from "../errors";

/**
 * Transfer Order business rules (Loop 43 / TASK-009, Flow 4).
 *
 * Grounded directly in the domain entities contract's `transfer_order`
 * entity (ENTITY-012), workflows.yaml's own `transfer_order_status`
 * state machine (fully contracted - unlike loading_sheet_status, every
 * transition here is already explicit), and invariants INV-016/017 -
 * nothing here is invented beyond what PEN-041 (docs/PENDING_ITEMS.md)
 * discloses.
 */

export const TRANSFER_ORDER_STATUSES = [
  "DRAFT",
  "PICKED",
  "LOADED",
  "IN_TRANSIT",
  "RECEIVED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type TransferOrderStatus = (typeof TRANSFER_ORDER_STATUSES)[number];

export type TransferOrderAction = "pick" | "load" | "dispatch" | "receive" | "complete";

export const TRANSFER_TYPES = ["NORMAL", "HOLD_TAG", "BULK_TAG"] as const;
export type TransferType = (typeof TRANSFER_TYPES)[number];

/**
 * Flow 4 Step 1's own definition of the three transfer types names
 * exactly which pallet status each one moves: "NORMAL (released/OK
 * materials)", "HOLD TAG (hold materials being transferred)", "BULK TAG
 * (bulk materials being transferred for repacking elsewhere)" - a pallet
 * of the wrong status for the transfer's own declared type is refused,
 * the same hard-block reasoning already applied to Loading Sheet pick
 * (INV-001..004).
 */
export function assertPalletEligibleForTransferType(statusCode: string, transferType: TransferType): void {
  const required: Record<TransferType, string> = { NORMAL: "OK", HOLD_TAG: "HOLD", BULK_TAG: "BULK" };
  const expected = required[transferType];
  if (statusCode !== expected) {
    throw new ValidationError(
      `Cannot pick a ${statusCode} pallet onto a ${transferType} transfer - ${transferType} transfers only take ${expected}-status material.`
    );
  }
}

/**
 * Flow 4 Step 3: "Vehicle number, driver name, transporter recorded"
 * before vehicle loading - checked here for a clean 422 rather than
 * letting it through with nulls, the same conditional-readiness pattern
 * already used by Loading Sheet's assertReadyToLoad.
 */
export function assertReadyToLoad(order: { vehicleNumber: string | null; driverName: string | null }): void {
  if (!order.vehicleNumber?.trim() || !order.driverName?.trim()) {
    throw new ValidationError("Vehicle number and driver name are required before loading.");
  }
}

const TRANSITIONS: Record<TransferOrderAction, { from: TransferOrderStatus; to: TransferOrderStatus }> = {
  pick: { from: "DRAFT", to: "PICKED" },
  load: { from: "PICKED", to: "LOADED" },
  dispatch: { from: "LOADED", to: "IN_TRANSIT" },
  receive: { from: "IN_TRANSIT", to: "RECEIVED" },
  complete: { from: "RECEIVED", to: "COMPLETED" },
};

/**
 * Transcribed exactly from workflows.yaml's own transfer_order_status
 * transitions - "COMPLETED -> any" and "IN_TRANSIT -> DRAFT" are both
 * already unreachable here since TRANSITIONS has no entry starting from
 * COMPLETED and no entry landing on DRAFT other than the sheet's own
 * initial default. CANCELLED is a real state in the contract's own
 * states list but has zero listed transitions in or out anywhere in
 * workflows.yaml - so, per the same STOP RULE this project already
 * applied to PEN-036, no cancel action is built here; see PEN-041.
 */
export function nextTransferOrderStatus(current: TransferOrderStatus, action: TransferOrderAction): TransferOrderStatus {
  if (current === "COMPLETED" || current === "CANCELLED") {
    throw new ValidationError(`${current} transfer orders are immutable.`);
  }
  const transition = TRANSITIONS[action];
  if (transition.from !== current) {
    throw new ValidationError(`Cannot ${action} a transfer order in status ${current}.`);
  }
  return transition.to;
}

/** transfer_number generated_format "TO-YYYY-MMDD-NNN" (Flow 4 Step 1's own worked example, "TO-2026-0912-001"). */
export function transferOrderNumberPrefix(date: string): string {
  const [y, m, d] = date.split("-");
  return `TO-${y}-${m}${d}-`;
}
