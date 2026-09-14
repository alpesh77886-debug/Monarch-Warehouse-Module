/**
 * Rack Map cell-color logic (Loop 25 / TASK-005, SCREEN-003).
 *
 * Grounded in the canonical flow document's Flow 2 Step 3 legend:
 * "Green = empty, Red = full (occupied), Blue = partial (pallet has
 * space for more - same material), Orange = HOLD (material on hold at
 * this location), Grey = blocked/unavailable" - transcribed directly,
 * nothing invented for these five.
 *
 * One legend value is deliberately NOT implemented: "Yellow = mix
 * (different batches - allowed for same material)". Distinguishing
 * that requires knowing how many distinct batches sit on the
 * occupying pallet, which needs the Pallet-Batch relationship
 * (architecture blueprint ENTITY-004) - there is no table for it yet
 * (PEN-014/PEN-024), so this function cannot honestly produce that
 * color and does not try to guess it.
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
} | null;

export type RackMapColor = "green" | "red" | "blue" | "orange" | "grey";

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
  if (location.status === "PARTIAL") return "blue";
  return "red";
}

export const RACK_MAP_COLOR_LABEL: Record<RackMapColor, string> = {
  green: "Empty",
  red: "Full",
  blue: "Partial",
  orange: "Hold",
  grey: "Blocked",
};
