import { ValidationError } from "../errors";

/**
 * Putaway/move location-assignment guard (Loop 24 / TASK-005).
 *
 * Grounded directly in the canonical business flow document's Flow 2
 * ("PUTAWAY & LOCATION MANAGEMENT"), which is the highest-authority
 * source in this repository - above the architecture blueprint and
 * the machine-readable contracts. Its Step 2/3 and "Rules" section
 * together are the actual basis for every check below; nothing here
 * is invented:
 *   - "System validates: Location is empty" + the Rules section's
 *     "Each floor position holds one pallet" -> a BLOCKED or already
 *     fully-occupied-by-a-different-material location must be rejected.
 *   - "If location occupied -> error: 'Location X is occupied by
 *     Pallet Y (MATERIAL_CODE)'" -> the same rejection message shape
 *     is reused verbatim below.
 *   - "Multiple pallets of same material can be in same block
 *     (different positions/floors) - this is normal and expected" +
 *     the PARTIAL status ("pallet has space for more - same material")
 *     -> a location already holding the SAME material may accept
 *     another pallet, up to its own capacity_pallets count.
 *
 * What this module deliberately does NOT enforce, and why (see
 * PEN-023 in docs/PENDING_ITEMS.md for the full finding): Step 2 also
 * mentions "Location accepts that pallet type" and "Pallet weight
 * within location capacity", but neither the Rules section, the
 * entities contract, nor the architecture blueprint's own Location
 * attribute table defines a pallet-type-per-location field or a
 * location-level weight limit anywhere - only `capacity_pallets` (a
 * pallet *count*) exists. Step 1's own "Pallet weight (heavier
 * pallets on lower floors)" reads as a placement *suggestion*
 * heuristic, not a hard block, which is consistent with there being
 * no weight field to block against. Inventing a concrete field/value
 * scheme for "accepts that pallet type" here would be guessing the
 * actual business mapping, which the project's STOP RULE forbids -
 * so this guard enforces only what has a real, named field to check.
 *
 * Also deliberately out of scope for now: `current_pallet_id` on the
 * locations table is a single text column, not a list - it cannot
 * represent more than one pallet at a location. So this guard only
 * ever assigns into a location that is currently EMPTY or holds
 * exactly the incoming pallet's own material with `capacity_pallets`
 * still allowing one more - anything requiring true multi-pallet
 * tracking at `capacity_pallets` > 1 is rejected as not yet supported,
 * rather than silently overwriting the existing occupant's link.
 */

export type LocationForGuard = {
  id: string;
  fullCode: string;
  status: "EMPTY" | "OCCUPIED" | "PARTIAL" | "BLOCKED";
  capacityPallets: number;
  currentPalletId: string | null;
};

const LOCATION_STATUSES = ["EMPTY", "OCCUPIED", "PARTIAL", "BLOCKED"] as const;

/**
 * Drizzle's `text()` column type widens `locations.status` back to a
 * plain `string` at the TypeScript level, even though the database's
 * own CHECK constraint already guarantees it is one of the 4 values -
 * this narrows the type for callers reading a row straight from the
 * database, without re-deriving the enum's actual values by hand.
 */
export function asLocationStatus(status: string): LocationForGuard["status"] {
  if (!(LOCATION_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Unexpected location status "${status}" - the database's own CHECK constraint should prevent this.`);
  }
  return status as LocationForGuard["status"];
}

export type OccupyingPallet = {
  id: string;
  palletNumber: string;
  materialId: string;
  materialCode: string;
};

export type PalletForGuard = {
  id: string;
  materialId: string;
};

/**
 * Throws ValidationError if the assignment is not allowed; otherwise
 * returns the new location status the caller should persist.
 */
export function validateLocationAssignment(
  pallet: PalletForGuard,
  location: LocationForGuard,
  currentOccupant: OccupyingPallet | null
): "OCCUPIED" | "PARTIAL" {
  if (location.status === "BLOCKED") {
    throw new ValidationError(`Location ${location.fullCode} is blocked and cannot accept a pallet.`);
  }

  if (location.status === "EMPTY") {
    return location.capacityPallets > 1 ? "PARTIAL" : "OCCUPIED";
  }

  // OCCUPIED or PARTIAL: only the same material may join, and only if
  // this repository's single-pallet-per-location-row representation
  // can actually still express it (see module doc comment above).
  if (!currentOccupant) {
    throw new ValidationError(
      `Location ${location.fullCode} is marked ${location.status} but has no recorded occupant - ` +
        `data inconsistency, refusing to guess which pallet is actually there.`
    );
  }
  if (currentOccupant.materialId !== pallet.materialId) {
    throw new ValidationError(
      `Location ${location.fullCode} is occupied by Pallet ${currentOccupant.palletNumber} ` +
        `(${currentOccupant.materialCode}).`
    );
  }
  if (location.capacityPallets <= 1) {
    throw new ValidationError(
      `Location ${location.fullCode} is occupied by Pallet ${currentOccupant.palletNumber} ` +
        `(${currentOccupant.materialCode}) and its capacity is 1 - no room for another pallet.`
    );
  }
  throw new ValidationError(
    `Location ${location.fullCode} allows more than one pallet (capacity_pallets = ${location.capacityPallets}), ` +
      `but this repository does not yet track more than one occupant per location row - not supported yet.`
  );
}
