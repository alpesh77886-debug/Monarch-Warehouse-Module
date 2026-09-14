/**
 * Warehouse location-grid GENERATOR interface (Loop 15 / PEN-008).
 *
 * No real Limbasi/Sabarkantha warehouse grid is fabricated here. The
 * canonical flow document only gives a general pattern for the
 * physical structure (Section 1.3): rooms CR1/CR2, blocks 01-36,
 * positions A-E, floors 1-4, plus floor-staging locations - and
 * explicitly says this pattern has unenumerated exceptions ("some
 * [blocks] may differ", "some blocks like I may have 5 floors").
 * Because the exact per-block configuration is not given, PEN-008
 * remains open for the real grid.
 *
 * What this file provides instead: a pure, deterministic function that
 * turns an explicit grid configuration into location rows shaped for
 * the `locations` table. It has no opinion about what the real
 * Limbasi/Sabarkantha configuration is - the caller supplies that once
 * it is confirmed. This is the "data model/interface necessary to
 * receive the authoritative grid later" called for when the grid
 * itself is not yet available.
 */

export type LocationGridRow = {
  warehouseId: string;
  coldRoom: string;
  block: string | null;
  position: string | null;
  floor: number | null;
  fullCode: string;
  capacityPallets: number;
};

export type RackGridConfig = {
  warehouseId: string;
  coldRoom: string;
  /** Block codes, e.g. ["01", "02", ..., "36"] - caller-supplied, not assumed. */
  blocks: string[];
  /** Position codes, e.g. ["A", "B", "C", "D", "E"] - caller-supplied, not assumed. */
  positions: string[];
  /**
   * Floors per block. A single number applies to every block; a map
   * lets exceptions (e.g. one block with 5 floors instead of 4) be
   * expressed explicitly once known, instead of guessed.
   */
  floorsPerBlock: number | Record<string, number>;
  capacityPallets?: number;
};

export type FloorStagingConfig = {
  warehouseId: string;
  /** e.g. "CR1-FLOOR" */
  fullCode: string;
  coldRoom: string;
  capacityPallets?: number;
};

export class DuplicateLocationCodeError extends Error {
  constructor(public readonly fullCode: string) {
    super(`Duplicate location full_code generated: "${fullCode}". Check the grid configuration.`);
    this.name = "DuplicateLocationCodeError";
  }
}

/**
 * Generates one location row per (block, position, floor) combination,
 * with full_code built exactly per the documented format:
 * CR + Room + "-" + Block + "-" + Position + "-" + Floor.
 * Throws DuplicateLocationCodeError if the configuration would produce
 * two rows with the same full_code (should not happen with valid,
 * non-overlapping input - this is a defensive check, not expected to
 * fire in normal use).
 */
export function generateRackGrid(config: RackGridConfig): LocationGridRow[] {
  const rows: LocationGridRow[] = [];
  const seen = new Set<string>();
  const capacityPallets = config.capacityPallets ?? 1;

  for (const block of config.blocks) {
    const floorCount =
      typeof config.floorsPerBlock === "number"
        ? config.floorsPerBlock
        : config.floorsPerBlock[block];
    if (!floorCount || floorCount < 1) {
      throw new Error(`No floor count configured for block "${block}".`);
    }
    for (const position of config.positions) {
      for (let floor = 1; floor <= floorCount; floor++) {
        const fullCode = `${config.coldRoom}-${block}-${position}-${floor}`;
        if (seen.has(fullCode)) {
          throw new DuplicateLocationCodeError(fullCode);
        }
        seen.add(fullCode);
        rows.push({
          warehouseId: config.warehouseId,
          coldRoom: config.coldRoom,
          block,
          position,
          floor,
          fullCode,
          capacityPallets,
        });
      }
    }
  }
  return rows;
}

/** Generates a single floor-staging location row (e.g. CR1-FLOOR). */
export function generateFloorStagingLocation(config: FloorStagingConfig): LocationGridRow {
  return {
    warehouseId: config.warehouseId,
    coldRoom: config.coldRoom,
    block: null,
    position: null,
    floor: null,
    fullCode: config.fullCode,
    capacityPallets: config.capacityPallets ?? 1,
  };
}
