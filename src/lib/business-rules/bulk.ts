import { ValidationError } from "../errors";

/**
 * Bulk Management business rules (Loop 42 / TASK-007, Flow 3 Step 7).
 *
 * There is no dedicated "bulk record" entity anywhere in the domain
 * entities contract - Task 7's own MUST READ note says only "BULK
 * status" (the pallet_status value already in pallets' CHECK constraint,
 * and the status_master row for LMFGBULK/SKFGBULK). Bulk material is
 * created exactly like any other receiving-sheet pallet, with
 * default_pallet_status='BULK' (already built, Loop 35/39) - this module
 * covers the two real gaps that reading found (see PEN-040 in
 * docs/PENDING_ITEMS.md): a fixed classification for *why* a pallet is
 * bulk, and the aging/eligibility rules for sending it to packing.
 *
 * The BULK -> QC_HOLD pallet_status transition itself is NOT reinvented
 * here - it already exists, fully contracted, in
 * src/lib/workflows/pallet-status.ts (Loop 17), actors [R01, R06],
 * ledgerTransactionType BULK_RECEIVE. This module only adds what that
 * transcribed state machine does not cover: the reason classification
 * and the repack-receipt linkage.
 */

// Transcribed exactly from the domain entities contract's own
// fixed_hold_reasons list (ENTITY-011) - the two bulk-specific entries
// already reused verbatim as HOLD_REASONS in hold.ts, matching the flow
// document's own "(a) Over-production excess, (b) Defective fries"
// wording and the reference mockup's own two-value tagchip
// classification (Screen 5, "Bulk Tracking"). Not an invented new
// vocabulary - the same two contracted strings, reused for their own
// obvious second purpose.
export const BULK_REASONS = ["Over-production (bulk)", "Defective fries (bulk)"] as const;
export type BulkReason = (typeof BULK_REASONS)[number];

/**
 * A receiving sheet's bulk_reason must be set (to one of the two fixed
 * values) exactly when defaultPalletStatus is 'BULK', and must be left
 * unset otherwise - the same conditional-field pattern already used for
 * hold_record's custom_reason (hold.ts) and loading_sheet's export-only
 * fields (loading-sheet.ts).
 */
export function assertBulkReasonConsistency(
  defaultPalletStatus: string,
  bulkReason: string | null | undefined
): void {
  const trimmed = bulkReason?.trim();
  if (defaultPalletStatus === "BULK") {
    if (!trimmed) {
      throw new ValidationError('A bulk reason is required when default pallet status is "BULK".');
    }
    if (!(BULK_REASONS as readonly string[]).includes(trimmed)) {
      throw new ValidationError("Invalid bulk reason - must be one of the fixed dropdown values.");
    }
  } else if (trimmed) {
    throw new ValidationError('A bulk reason is only allowed when default pallet status is "BULK".');
  }
}

export type BulkAgeBucket = "RED" | "AMBER" | "OK";

/**
 * No locked source states an explicit numeric bulk-aging threshold
 * (unlike Hold's own SCREEN-004 mockup, which gave ">3d amber / >7d red"
 * directly) - JOURNEY-003 and Flow 3 Step 7 both say aging must be
 * tracked and visible, but neither names a day count, and the reference
 * mockup (visual reference only, not a locked contract) shows example
 * rows rather than a rule. Reusing Hold Management's own already-built
 * thresholds here is a disclosed UI-consistency choice, not a new
 * invented business rule - see PEN-040.
 */
export function bulkAgeDays(createdAt: string, now: Date = new Date()): number {
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

export function bulkAgeBucket(days: number): BulkAgeBucket {
  if (days > 7) return "RED";
  if (days > 3) return "AMBER";
  return "OK";
}
