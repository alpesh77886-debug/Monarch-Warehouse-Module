/**
 * Rack Map cell-color logic (Loop 25 / TASK-005, SCREEN-003).
 *
 * Grounded in the canonical flow document's Flow 2 Step 3 legend:
 * "Green = empty, Red = full (occupied), Blue = partial (pallet has
 * space for more - same material), Orange = HOLD (material on hold at
 * this location), Grey = blocked/unavailable, Yellow = mix (different
 * batches - allowed for same material)" - transcribed directly,
 * nothing invented.
 *
 * Yellow was deliberately NOT implemented at Loop 25: telling "one
 * batch" from "a mix of batches" on an occupied pallet needs the
 * Pallet-Batch relationship (architecture blueprint ENTITY-004), which
 * had no table yet (PEN-014/PEN-024). **Loop 37 update:** that table
 * (`pallet_batches`) now exists and is populated (Loop 35's Receiving
 * Sheet lock, Loop 37's putaway/move ledger writes), so this function
 * now takes the occupying pallet's own distinct-batch count and can
 * produce the real color instead of skipping it.
 *
 * Precedence (undocumented by the flow document, but the only reading
 * that keeps every color meaningful rather than one silently
 * overriding another): BLOCKED and EMPTY are location-level facts,
 * decided first. HOLD is next - an operator needs to see "do not
 * touch" before anything else about the pallet's contents. Only then
 * does the batch-mix question apply, followed by the plain
 * partial/full distinction.
 *
 * "Purple = search result (highlighted)" is handled separately by the
 * UI as an overlay ring on top of whatever the real status color is
 * (see the page component), not as a replacement color - losing the
 * real occupancy state during a search would be a worse reading of
 * the source than layering a highlight on it.
 */

export type LocationForRackMap = {
  status: "EMPTY" | "OCCUPIED" | "PARTIAL" | "BLOCKED";
};

export type OccupantForRackMap = {
  statusCode: string;
  // Distinct batch_id count from pallet_batches for this pallet.
  // Optional/undefined means "unknown" (e.g. a legacy pallet with no
  // pallet_batches row at all) and is treated the same as 1 - a mix
  // can only be asserted from real data, never guessed.
  distinctBatchCount?: number;
} | null;

export type RackMapColor = "green" | "red" | "blue" | "orange" | "grey" | "yellow";

export function rackMapCellColor(
  location: LocationForRackMap,
  occupant: OccupantForRackMap
): RackMapColor {
  if (location.status === "BLOCKED") return "grey";
  if (location.status === "EMPTY") return "green";

  // OCCUPIED or PARTIAL from here on.
  if (occupant && (occupant.statusCode === "HOLD" || occupant.statusCode === "QC_HOLD")) {
    return "orange";
  }
  if (occupant && (occupant.distinctBatchCount ?? 1) > 1) {
    return "yellow";
  }
  if (location.status === "PARTIAL") return "blue";
  return "red";
}

export const RACK_MAP_COLOR_LABEL: Record<RackMapColor, string> = {
  green: "Empty",
  red: "Full",
  blue: "Partial",
  orange: "Hold",
  grey: "Blocked",
  yellow: "Mix (batches)",
};
