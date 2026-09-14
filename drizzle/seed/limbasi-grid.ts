/**
 * Real Limbasi CR1/CR2 location-grid seed (Loop 28 / PEN-008 resolved).
 *
 * The exact configuration below is derived directly from the CR-1 and
 * CR-2 sheets of the DSR Excel file Alpesh provided - a real snapshot
 * of occupied pallets, each carrying its own full location code
 * (e.g. "CR1-01-A-1"). Parsing every unique code in both sheets
 * confirms the architecture blueprint's own general pattern exactly:
 * blocks 01-36, positions A-E, for both CR1 and CR2, plus one
 * "CR1-FLOOR" / "CR2-FLOOR" staging code each. Floors: every block
 * shows real occupied pallets up through floor 4; 10 of CR1's 36
 * blocks (27-36) show no occupied pallet above floor 3 in this one
 * snapshot, but that is expected of an occupancy snapshot - an empty
 * slot leaves no row to observe, so it is not evidence that floor 4
 * does not exist there. Seeded uniformly at 4 floors per block for
 * both rooms, matching the architecture blueprint's stated general
 * pattern, which this real data is consistent with (never
 * contradicts) rather than guessed independently of it.
 *
 * This uses the pure generator built in Loop 15
 * (drizzle/seed/location-grid.ts) exactly as it was designed to be
 * used once a real configuration became available - nothing in that
 * generator changed.
 */
import { generateRackGrid, generateFloorStagingLocation, type LocationGridRow } from "./location-grid";

const BLOCKS = Array.from({ length: 36 }, (_, i) => String(i + 1).padStart(2, "0"));
const POSITIONS = ["A", "B", "C", "D", "E"];
const FLOORS_PER_BLOCK = 4;

export function buildLimbasiGrid(warehouseId: string): LocationGridRow[] {
  return [
    ...generateRackGrid({
      warehouseId,
      coldRoom: "CR1",
      blocks: BLOCKS,
      positions: POSITIONS,
      floorsPerBlock: FLOORS_PER_BLOCK,
    }),
    generateFloorStagingLocation({ warehouseId, coldRoom: "CR1", fullCode: "CR1-FLOOR" }),
    ...generateRackGrid({
      warehouseId,
      coldRoom: "CR2",
      blocks: BLOCKS,
      positions: POSITIONS,
      floorsPerBlock: FLOORS_PER_BLOCK,
    }),
    generateFloorStagingLocation({ warehouseId, coldRoom: "CR2", fullCode: "CR2-FLOOR" }),
  ];
}
