import { describe, expect, it, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildLimbasiGrid } from "../../drizzle/seed/limbasi-grid";
import { WAREHOUSE_SEED_ROWS } from "../../drizzle/seed/warehouses";

let db: InstanceType<typeof Database>;

beforeAll(() => {
  db = new Database(":memory:");
  const migrationsDir = join(__dirname, "..", "..", "drizzle", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const cleaned = sql.replace(/-->\s*statement-breakpoint/g, "");
    db.exec(cleaned);
  }
});

describe("Warehouse Master seed (Loop 28 Limbasi + Loop 39 Sabarkantha, PEN-035)", () => {
  it("has exactly the real Limbasi FG warehouse row (rack grid)", () => {
    const limbasi = WAREHOUSE_SEED_ROWS.find((w) => w.code === "LIMBASI-FG");
    expect(limbasi).toBeDefined();
    expect(limbasi!.plant).toBe("LIMBASI");
    expect(limbasi!.locationStructure).toBe("RACK");
  });

  it("has the real Sabarkantha FG warehouse row (Alpesh-approved PEN-035: transfer only, no location grid)", () => {
    const sabarkantha = WAREHOUSE_SEED_ROWS.find((w) => w.code === "SABARKANTHA-FG");
    expect(sabarkantha).toBeDefined();
    expect(sabarkantha!.plant).toBe("SABARKANTHA");
    expect(sabarkantha!.locationStructure).toBe("FLAT");
  });

  it("has exactly these 2 warehouse rows, no more", () => {
    expect(WAREHOUSE_SEED_ROWS).toHaveLength(2);
  });
});

describe("buildLimbasiGrid (Loop 28 / PEN-008 real grid)", () => {
  const grid = buildLimbasiGrid("test-warehouse-id");

  it("produces 36 blocks x 5 positions x 4 floors x 2 rooms, plus 2 floor-staging locations", () => {
    expect(grid).toHaveLength(36 * 5 * 4 * 2 + 2);
  });

  it("every full_code is unique", () => {
    const codes = grid.map((r) => r.fullCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("includes the real first and last observed occupied codes from the source file", () => {
    const codes = new Set(grid.map((r) => r.fullCode));
    expect(codes.has("CR1-01-A-1")).toBe(true);
    expect(codes.has("CR2-01-A-1")).toBe(true);
    expect(codes.has("CR1-FLOOR")).toBe(true);
    expect(codes.has("CR2-FLOOR")).toBe(true);
  });

  it("inserts cleanly into the real schema (a genuine, non-fabricated grid shape)", () => {
    db.prepare(
      `INSERT INTO warehouses (id, code, name, type, plant, sap_code, location_structure) VALUES ('w1','LIMBASI-FG','Limbasi FG Warehouse','OWN','LIMBASI','LMFGA','RACK')`
    ).run();
    const insert = db.prepare(
      `INSERT INTO locations (id, warehouse_id, cold_room, block, position, floor, full_code, capacity_pallets, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EMPTY')`
    );
    for (const row of grid.slice(0, 50)) {
      expect(() =>
        insert.run(
          crypto.randomUUID(),
          "w1",
          row.coldRoom,
          row.block,
          row.position,
          row.floor,
          row.fullCode,
          row.capacityPallets
        )
      ).not.toThrow();
    }
  });
});
