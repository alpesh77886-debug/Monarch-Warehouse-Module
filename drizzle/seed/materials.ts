/**
 * Material Master seed INTERFACE ONLY (Loop 14 / PEN-007).
 *
 * No production material rows are embedded in this repository. The
 * canonical flow document only contains scattered illustrative example
 * codes inside narrative scenarios (e.g. "LFG00938 - Hungritos
 * Shoestring FF 1.0kg") - those are documentation examples for a human
 * reader, not a verified, complete material master export, and are not
 * treated as seed data here. PEN-007 is explicit that the real source
 * (the DSR Excel "FG CODE" sheet) has not been provided yet.
 *
 * This module defines the shape and validation an eventual import must
 * satisfy, and a loader that reads real data from an external file
 * path - it does not fabricate a single row on its own.
 */
import { readFileSync, existsSync } from "node:fs";

const MATERIAL_CODE_PATTERN = /^(?:LFG|SFG)[0-9]+$/;
const VALID_PALLET_TYPES = new Set(["CARTON", "ROLL", "POUCH"]);
const VALID_PLANT_ORIGINS = new Set(["LIMBASI", "SABARKANTHA"]);

export type MaterialSeedRow = {
  code: string;
  description: string;
  uomKgPerCarton: number;
  category: string;
  palletWeightLimitKg: number;
  palletType: "CARTON" | "ROLL" | "POUCH";
  shelfLifeDays: number | null;
  plantOrigin: "LIMBASI" | "SABARKANTHA";
};

export class MaterialSeedValidationError extends Error {
  constructor(
    public readonly rowIndex: number,
    public readonly field: string,
    message: string
  ) {
    super(`Row ${rowIndex}, field "${field}": ${message}`);
    this.name = "MaterialSeedValidationError";
  }
}

/**
 * Validates one already-parsed row against the same rules the database
 * CHECK constraints enforce (material_code prefix, enum fields), plus
 * the full regex the database cannot express. Throws on the first
 * violation rather than silently coercing or dropping bad data.
 *
 * A SKFG-prefixed code is rejected here for the same reason the
 * database rejects it: SKFG is a SAP/warehouse code family, never a
 * material code.
 */
export function validateMaterialRow(row: unknown, rowIndex: number): MaterialSeedRow {
  if (typeof row !== "object" || row === null) {
    throw new MaterialSeedValidationError(rowIndex, "(row)", "not an object");
  }
  const r = row as Record<string, unknown>;

  if (typeof r.code !== "string" || !MATERIAL_CODE_PATTERN.test(r.code)) {
    throw new MaterialSeedValidationError(
      rowIndex,
      "code",
      `"${String(r.code)}" does not match ^(?:LFG|SFG)[0-9]+$ (SKFG and any other prefix are rejected)`
    );
  }
  if (typeof r.description !== "string" || r.description.length === 0) {
    throw new MaterialSeedValidationError(rowIndex, "description", "required non-empty string");
  }
  if (typeof r.uomKgPerCarton !== "number" || r.uomKgPerCarton <= 0) {
    throw new MaterialSeedValidationError(rowIndex, "uomKgPerCarton", "required positive number");
  }
  if (typeof r.category !== "string" || r.category.length === 0) {
    throw new MaterialSeedValidationError(rowIndex, "category", "required non-empty string");
  }
  if (typeof r.palletWeightLimitKg !== "number" || r.palletWeightLimitKg <= 0) {
    throw new MaterialSeedValidationError(
      rowIndex,
      "palletWeightLimitKg",
      "required positive number"
    );
  }
  if (typeof r.palletType !== "string" || !VALID_PALLET_TYPES.has(r.palletType)) {
    throw new MaterialSeedValidationError(
      rowIndex,
      "palletType",
      "must be one of CARTON, ROLL, POUCH"
    );
  }
  if (r.shelfLifeDays !== null && r.shelfLifeDays !== undefined && typeof r.shelfLifeDays !== "number") {
    throw new MaterialSeedValidationError(rowIndex, "shelfLifeDays", "must be a number or null");
  }
  if (typeof r.plantOrigin !== "string" || !VALID_PLANT_ORIGINS.has(r.plantOrigin)) {
    throw new MaterialSeedValidationError(
      rowIndex,
      "plantOrigin",
      "must be one of LIMBASI, SABARKANTHA"
    );
  }

  return {
    code: r.code,
    description: r.description,
    uomKgPerCarton: r.uomKgPerCarton,
    category: r.category,
    palletWeightLimitKg: r.palletWeightLimitKg,
    palletType: r.palletType as MaterialSeedRow["palletType"],
    shelfLifeDays: (r.shelfLifeDays as number | null | undefined) ?? null,
    plantOrigin: r.plantOrigin as MaterialSeedRow["plantOrigin"],
  };
}

export class MissingMaterialSourceError extends Error {
  constructor(public readonly path: string) {
    super(
      `No material master source file found at "${path}". This is expected until ` +
        `the verified DSR "FG CODE" sheet (PEN-007) is provided - no fabricated ` +
        `material data will be substituted.`
    );
    this.name = "MissingMaterialSourceError";
  }
}

/**
 * Loads and validates a material master export from a JSON file
 * (an array of row objects). Throws MissingMaterialSourceError if the
 * file does not exist - callers must not fall back to fabricated rows.
 */
export function loadMaterialSeedRows(filePath: string): MaterialSeedRow[] {
  if (!existsSync(filePath)) {
    throw new MissingMaterialSourceError(filePath);
  }
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`Material source file "${filePath}" must contain a JSON array.`);
  }
  return parsed.map((row, index) => validateMaterialRow(row, index));
}
