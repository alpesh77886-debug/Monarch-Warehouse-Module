import { describe, expect, it, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  generateRackGrid,
  generateFloorStagingLocation,
  DuplicateLocationCodeError,
} from "../../drizzle/seed/location-grid";

let db: InstanceType<typeof Database>;

beforeAll(() => {
  db = new Database(":memory:");
  const migrationsDir = join(__dirname, "..", "..", "drizzle", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    db.exec(sql.replace(/-->\s*statement-breakpoint/g, ""));
  }
  db.prepare(
    `INSERT INTO warehouses (id, code, name, type, plant, sap_code, location_structure) VALUES ('w_test','TESTWH','Test Warehouse (not a real IBF plant)','OWN','LIMBASI','LMFGA','RACK')`
  ).run();
});

describe("generateRackGrid (PEN-008 - deterministic tool, not real warehouse data)", () => {
  it("produces the exact expected count and full_code format for a small, clearly-fake config", () => {
    // Deliberately tiny, non-realistic numbers (2 blocks x 2 positions x
    // 2 floors) so this can never be mistaken for the real Limbasi grid.
    const rows = generateRackGrid({
      warehouseId: "w_test",
      coldRoom: "CR9",
      blocks: ["01", "02"],
      positions: ["A", "B"],
      floorsPerBlock: 2,
    });
    expect(rows).toHaveLength(2 * 2 * 2);
    expect(rows.map((r) => r.fullCode)).toContain("CR9-01-A-1");
    expect(rows.map((r) => r.fullCode)).toContain("CR9-02-B-2");
    expect(new Set(rows.map((r) => r.fullCode)).size).toBe(rows.length); // all unique
  });

  it("supports per-block floor exceptions instead of assuming a uniform count", () => {
    const rows = generateRackGrid({
      warehouseId: "w_test",
      coldRoom: "CR9",
      blocks: ["01", "02"],
      positions: ["A"],
      floorsPerBlock: { "01": 4, "02": 5 }, // block 02 has an extra floor
    });
    expect(rows.filter((r) => r.block === "01")).toHaveLength(4);
    expect(rows.filter((r) => r.block === "02")).toHaveLength(5);
  });

  it("throws rather than silently producing a bad grid when a block has no floor count", () => {
    expect(() =>
      generateRackGrid({
        warehouseId: "w_test",
        coldRoom: "CR9",
        blocks: ["01", "99"],
        positions: ["A"],
        floorsPerBlock: { "01": 4 }, // "99" is missing on purpose
      })
    ).toThrow(/No floor count configured/);
  });

  it("every generated row inserts cleanly and the real unique index rejects a duplicate full_code", () => {
    // coldRoom must be a real enum value (CR1/CR2/FLOOR/NA - a genuine
    // business rule from an earlier loop), but block "97" is well
    // outside the real 01-36 range specifically so this can never be
    // mistaken for real Limbasi data.
    const rows = generateRackGrid({
      warehouseId: "w_test",
      coldRoom: "CR1",
      blocks: ["97"],
      positions: ["A"],
      floorsPerBlock: 2,
    });
    const stmt = db.prepare(
      `INSERT INTO locations (id, warehouse_id, cold_room, block, position, floor, full_code, capacity_pallets) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    rows.forEach((row, i) => {
      stmt.run(`loc_${i}`, row.warehouseId, row.coldRoom, row.block, row.position, row.floor, row.fullCode, row.capacityPallets);
    });

    // Attempting to insert the SAME full_code again must fail - this is
    // the schema-correctness fix (unique index) added in this loop.
    expect(() =>
      stmt.run("loc_dup", rows[0].warehouseId, rows[0].coldRoom, rows[0].block, rows[0].position, rows[0].floor, rows[0].fullCode, rows[0].capacityPallets)
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("floor-staging locations have null block/position/floor, matching the documented flat-staging concept", () => {
    const staging = generateFloorStagingLocation({
      warehouseId: "w_test",
      coldRoom: "CR9",
      fullCode: "CR9-FLOOR",
    });
    expect(staging.block).toBeNull();
    expect(staging.position).toBeNull();
    expect(staging.floor).toBeNull();
    expect(staging.fullCode).toBe("CR9-FLOOR");
  });
});

// Explicit non-goal, checked here so it cannot regress silently: this
// file must never claim to seed the real Limbasi/Sabarkantha grid.
describe("PEN-008 non-fabrication guarantee", () => {
  it("this test file contains no CR1/CR2 36-block real-grid seed call", () => {
    const src = readFileSync(__filename, "utf8");
    expect(src).not.toMatch(/blocks:\s*\[\s*"01"\s*,\s*"02"[\s\S]{0,400}"36"/);
  });
});
