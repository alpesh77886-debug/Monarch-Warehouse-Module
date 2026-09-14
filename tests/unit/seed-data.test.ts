import { describe, expect, it, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { STATUS_SEED_ROWS } from "../../drizzle/seed/statuses";
import { SAP_CODE_SEED_ROWS } from "../../drizzle/seed/sap-codes";
import {
  validateMaterialRow,
  loadMaterialSeedRows,
  MissingMaterialSourceError,
  MaterialSeedValidationError,
} from "../../drizzle/seed/materials";

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

describe("Status Master seed (PEN-007 architecture)", () => {
  it("has exactly the locked 10 status values", () => {
    expect(STATUS_SEED_ROWS).toHaveLength(10);
    const codes = STATUS_SEED_ROWS.map((r) => r.code).sort();
    expect(codes).toEqual(
      [
        "BULK",
        "CUSTOMER_SAMPLE",
        "DISPATCHED",
        "HOLD",
        "IN_TRANSIT",
        "OK",
        "QC_HOLD",
        "REJECTED",
        "SAMPLE",
        "SCRAP",
      ].sort()
    );
  });

  it("every row inserts cleanly against the real statuses table CHECK constraint", () => {
    const stmt = db.prepare(
      `INSERT INTO statuses (code, description, dispatchable, transferable, sap_limbasi, sap_sabarkantha) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const row of STATUS_SEED_ROWS) {
      expect(() =>
        stmt.run(
          row.code,
          row.description,
          row.dispatchable,
          row.transferable,
          row.sapLimbasi,
          row.sapSabarkantha
        )
      ).not.toThrow();
    }
    const count = db.prepare("SELECT COUNT(*) as n FROM statuses").get() as { n: number };
    expect(count.n).toBe(10);
  });

  it("only OK is dispatchable, matching the hard-block business rule (INV-001 to INV-004)", () => {
    const dispatchable = STATUS_SEED_ROWS.filter((r) => r.dispatchable === 1).map((r) => r.code);
    expect(dispatchable).toEqual(["OK"]);
  });
});

describe("SAP Warehouse Master seed (PEN-007 architecture, PEN-018 finding)", () => {
  it("has 45 rows (20 Limbasi + 25 Sabarkantha), not the '44' figure quoted elsewhere - see PEN-018", () => {
    expect(SAP_CODE_SEED_ROWS).toHaveLength(45);
    expect(SAP_CODE_SEED_ROWS.filter((r) => r.plant === "LIMBASI")).toHaveLength(20);
    expect(SAP_CODE_SEED_ROWS.filter((r) => r.plant === "SABARKANTHA")).toHaveLength(25);
  });

  it("every row inserts cleanly against the real sap_codes table CHECK constraint, including the SALES type", () => {
    const stmt = db.prepare(
      `INSERT INTO sap_codes (sap_code, sap_name, plant, type, module_status_mapping, fg_relevant) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const row of SAP_CODE_SEED_ROWS) {
      expect(() =>
        stmt.run(row.sapCode, row.sapName, row.plant, row.type, row.moduleStatusMapping, row.fgRelevant)
      ).not.toThrow();
    }
    const count = db.prepare("SELECT COUNT(*) as n FROM sap_codes").get() as { n: number };
    expect(count.n).toBe(45);
  });

  it("has no SKFG-style value stored as a material code anywhere (these are SAP codes, a different concept)", () => {
    const materialLike = SAP_CODE_SEED_ROWS.filter((r) => /^(LFG|SFG)[0-9]+$/.test(r.sapCode));
    expect(materialLike).toHaveLength(0);
  });
});

describe("Material Master seed interface (PEN-007, no fabricated data)", () => {
  it("rejects a SKFG-prefixed code", () => {
    expect(() =>
      validateMaterialRow(
        {
          code: "SKFG00001",
          description: "x",
          uomKgPerCarton: 10,
          category: "TEST",
          palletWeightLimitKg: 1000,
          palletType: "CARTON",
          plantOrigin: "SABARKANTHA",
        },
        0
      )
    ).toThrow(MaterialSeedValidationError);
  });

  it("accepts a valid LFG-prefixed row", () => {
    const row = validateMaterialRow(
      {
        code: "LFG00938",
        description: "Hungritos Shoestring FF 1.0kg",
        uomKgPerCarton: 12.5,
        category: "9MM",
        palletWeightLimitKg: 1000,
        palletType: "CARTON",
        plantOrigin: "LIMBASI",
        shelfLifeDays: null,
      },
      0
    );
    expect(row.code).toBe("LFG00938");
  });

  it("throws MissingMaterialSourceError instead of fabricating data when no source file exists", () => {
    expect(() => loadMaterialSeedRows("/tmp/this-file-does-not-exist-monarch-test.json")).toThrow(
      MissingMaterialSourceError
    );
  });
});
