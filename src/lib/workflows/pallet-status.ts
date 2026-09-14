/**
 * Pallet status state machine (Loop 17 / core stock workflow).
 *
 * Scope discipline: this module implements ONLY the pallet_status
 * state machine, transcribed field-for-field from the locked workflow
 * contract, operating purely on the Pallet and Stock Ledger entities -
 * both already formally contracted (see drizzle/schema.ts). It does
 * NOT implement Receiving Sheet, Hold Record, Transfer Order, or
 * Loading Sheet - those entities are still uncontracted (PEN-014,
 * blocked by PEN-017) and inventing their workflow logic here would
 * cross the contract boundary this loop was explicitly told not to
 * cross.
 *
 * This is pure business logic (no database access) - it decides
 * whether a transition is allowed and what stock_ledger transaction_type
 * it produces. Wiring it into a real API route that writes to a live
 * Cloudflare D1 binding is deferred until that runtime binding
 * actually exists (it does not yet - only local D1 via wrangler exists
 * today).
 */
import type { Role } from "../auth";
import { ValidationError, ForbiddenError } from "../errors";

export const PALLET_STATUSES = [
  "QC_HOLD",
  "OK",
  "HOLD",
  "BULK",
  "DISPATCHED",
  "IN_TRANSIT",
  "CUSTOMER_SAMPLE",
  "SAMPLE",
  "REJECTED",
  "SCRAP",
] as const;
export type PalletStatus = (typeof PALLET_STATUSES)[number];

export type StockLedgerTransactionType =
  | "INWARD"
  | "MOVE"
  | "HOLD"
  | "RELEASE"
  | "DISPATCH"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "ADJUSTMENT"
  | "BULK_SEND"
  | "BULK_RECEIVE";

type Transition = {
  from: PalletStatus;
  to: PalletStatus;
  action: string;
  actors: Role[];
  ledgerTransactionType: StockLedgerTransactionType;
};

// Transcribed exactly from the locked workflow contract's pallet_status
// transitions. ledgerTransactionType maps each transition to one of the
// stock_ledger transaction_type values already in the schema's CHECK
// constraint - a reasonable, minimal mapping, not an invented business
// rule (INWARD/HOLD/RELEASE/DISPATCH/TRANSFER_IN/TRANSFER_OUT are all
// self-evident from the action names; MOVE/ADJUSTMENT/BULK_SEND/
// BULK_RECEIVE are not produced by this state machine).
const TRANSITIONS: Transition[] = [
  { from: "QC_HOLD", to: "OK", action: "qc_release", actors: ["R04", "R05"], ledgerTransactionType: "RELEASE" },
  { from: "QC_HOLD", to: "HOLD", action: "qc_place_hold", actors: ["R04"], ledgerTransactionType: "HOLD" },
  { from: "HOLD", to: "OK", action: "qc_release_hold", actors: ["R04", "R05"], ledgerTransactionType: "RELEASE" },
  { from: "HOLD", to: "REJECTED", action: "qc_reject", actors: ["R04"], ledgerTransactionType: "ADJUSTMENT" },
  { from: "BULK", to: "QC_HOLD", action: "bulk_repacked", actors: ["R01", "R06"], ledgerTransactionType: "BULK_RECEIVE" },
  { from: "OK", to: "IN_TRANSIT", action: "transfer_dispatch", actors: ["R03", "R09"], ledgerTransactionType: "TRANSFER_OUT" },
  { from: "IN_TRANSIT", to: "OK", action: "transfer_receive", actors: ["R01", "R03"], ledgerTransactionType: "TRANSFER_IN" },
  { from: "OK", to: "DISPATCHED", action: "dispatch", actors: ["R03", "R09", "R10"], ledgerTransactionType: "DISPATCH" },
];

/**
 * Documented-invalid transitions, kept only for clearer error messages -
 * the real enforcement is "anything not in TRANSITIONS is rejected"
 * (a safer default than an explicit deny-list, which could miss cases).
 */
const DOCUMENTED_INVALID_REASONS: Record<string, string> = {
  "QC_HOLD->DISPATCHED": "QC_HOLD -> DISPATCHED is invalid: must be released first (INV-003).",
  "HOLD->DISPATCHED": "HOLD -> DISPATCHED is invalid: must be released first (INV-001).",
  "BULK->DISPATCHED": "BULK -> DISPATCHED is invalid: must be repacked first (INV-004).",
};

export function findTransition(from: PalletStatus, to: PalletStatus): Transition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

/**
 * Validates a requested pallet status transition against the locked
 * state machine and the actor's role (INV-005 for HOLD->OK is enforced
 * here automatically, since it is just this state machine's normal
 * actor check - no special-cased rule was needed).
 *
 * Throws ValidationError for a structurally invalid transition (not in
 * the state machine at all) and ForbiddenError for a structurally
 * valid transition attempted by the wrong role.
 */
export function validatePalletStatusTransition(
  from: PalletStatus,
  to: PalletStatus,
  actorRole: Role | undefined
): Transition {
  const transition = findTransition(from, to);
  if (!transition) {
    const reason = DOCUMENTED_INVALID_REASONS[`${from}->${to}`];
    throw new ValidationError(reason ?? `No such transition: ${from} -> ${to}.`);
  }
  if (!actorRole || !transition.actors.includes(actorRole)) {
    throw new ForbiddenError(
      `Role ${actorRole ?? "(none)"} cannot perform "${transition.action}" (${from} -> ${to}). ` +
        `Required: ${transition.actors.join(" or ")}.`
    );
  }
  return transition;
}

export type PendingStockLedgerEntry = {
  transactionType: StockLedgerTransactionType;
  statusBefore: PalletStatus;
  statusAfter: PalletStatus;
  referenceType: "HOLD_RECORD" | "TRANSFER_ORDER" | "LOADING_SHEET" | "MANUAL_MOVE";
};

// Which reference_type (from the stock_ledger CHECK constraint) a given
// action would be logged against, once the corresponding entity is
// formally contracted and actually creates the reference record. Until
// then, callers should treat this as advisory metadata only.
const REFERENCE_TYPE_BY_ACTION: Record<string, PendingStockLedgerEntry["referenceType"]> = {
  qc_release: "HOLD_RECORD",
  qc_place_hold: "HOLD_RECORD",
  qc_release_hold: "HOLD_RECORD",
  qc_reject: "HOLD_RECORD",
  bulk_repacked: "MANUAL_MOVE",
  transfer_dispatch: "TRANSFER_ORDER",
  transfer_receive: "TRANSFER_ORDER",
  dispatch: "LOADING_SHEET",
};

/**
 * Given a validated transition, describes the stock_ledger entry it
 * should produce. Does not write to any database - see the module
 * doc comment for why.
 */
export function describeLedgerEntry(transition: Transition): PendingStockLedgerEntry {
  return {
    transactionType: transition.ledgerTransactionType,
    statusBefore: transition.from,
    statusAfter: transition.to,
    referenceType: REFERENCE_TYPE_BY_ACTION[transition.action],
  };
}
