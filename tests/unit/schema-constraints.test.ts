import { describe, expect, it, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression test for Loop 7: applies the same generated migration SQL
 * (drizzle/migrations/*.sql) to a throwaway in-memory SQLite database
 * and asserts the invariants that were manually verified against local
 * D1 in this loop. This is the automated, repeatable version of that
 * manual verification - not a substitute for it.
 */

let db: InstanceType<typeof Database>;

beforeAll(() => {
  db = new Database(":memory:");
  const migrationsDir = join(__dirname, "../../drizzle/migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    // drizzle-kit's --> statement-breakpoint markers are not valid SQL;
    // better-sqlite3's exec() runs the whole file as a single script and
    // handles multiple statements/triggers fine once those are stripped.
    const cleaned = sql.replace(/-->\s*statement-breakpoint/g, "");
    db.exec(cleaned);
  }
});

describe("materials.code prefix check (SKFG rejection)", () => {
  it("accepts a valid LFG-prefixed material code", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO materials (id, code, description, uom_kg_per_carton, category, pallet_weight_limit_kg, pallet_type, plant_origin)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run("m1", "LFG00938", "Test Material", 12.5, "9MM", 1000, "CARTON", "LIMBASI")
    ).not.toThrow();
  });

  it("accepts a valid SFG-prefixed material code", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO materials (id, code, description, uom_kg_per_carton, category, pallet_weight_limit_kg, pallet_type, plant_origin)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run("m2", "SFG00001", "Test SK Material", 10, "TEST", 1000, "CARTON", "SABARKANTHA")
    ).not.toThrow();
  });

  it("rejects a SKFG-prefixed value - SKFG is a SAP/warehouse code, not a material code", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO materials (id, code, description, uom_kg_per_carton, category, pallet_weight_limit_kg, pallet_type, plant_origin)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run("m3", "SKFG00001", "Should be rejected", 10, "TEST", 1000, "CARTON", "SABARKANTHA")
    ).toThrow(/materials_code_prefix_check/);
  });
});

describe("stock_ledger append-only triggers (INV-009)", () => {
  beforeAll(() => {
    db.prepare(
      `INSERT INTO warehouses (id, code, name, type, plant, sap_code, location_structure) VALUES ('w1','LIMBASI','Limbasi Plant','OWN','LIMBASI','LMFGA','RACK')`
    ).run();
    db.prepare(
      `INSERT INTO users (id, clerk_user_id, name, email, role_id, department, plant) VALUES ('u1','clerk_1','Rohan S.','rohan@example.com','R01','Warehouse','LIMBASI')`
    ).run();
    db.prepare(
      `INSERT INTO batches (id, batch_number, material_id, production_date, production_line, shift) VALUES ('b1','L26I010938','m1','2026-09-01','FF','A')`
    ).run();
    db.prepare(
      `INSERT INTO pallets (id, pallet_number, pallet_type, material_id, status_code, total_weight_kg, total_cartons, current_warehouse_id) VALUES ('p1','30673','PLASTIC','m1','OK',720,60,'w1')`
    ).run();
    db.prepare(
      `INSERT INTO stock_ledger (id, date, shift, transaction_type, material_id, batch_id, pallet_id, warehouse_id, qty_change, qty_after, weight_change_kg, weight_after_kg, reference_type, reference_id, user_id)
       VALUES ('sl1','2026-09-14','A','INWARD','m1','b1','p1','w1',60,60,720,720,'MANUAL_MOVE','ref1','u1')`
    ).run();
  });

  it("blocks UPDATE on an existing stock_ledger row", () => {
    expect(() =>
      db.prepare(`UPDATE stock_ledger SET qty_change = 999 WHERE id = 'sl1'`).run()
    ).toThrow(/append-only/);
  });

  it("blocks DELETE on an existing stock_ledger row", () => {
    expect(() => db.prepare(`DELETE FROM stock_ledger WHERE id = 'sl1'`).run()).toThrow(
      /append-only/
    );
  });
});
