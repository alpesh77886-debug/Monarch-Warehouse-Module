import { z } from "zod";

/**
 * Material Master validation (Loop 21 / TASK-003), transcribed
 * field-for-field from the locked entities contract's ENTITY-001
 * (Material Master). Nothing here is invented: the code regex, the
 * pallet_type/plant_origin enum values, and the "required" flags are
 * copied from that contract, matching the same CHECK constraints
 * already in the Drizzle schema. This is the application-layer half
 * of validation the database CHECK constraints cannot express (the
 * full regex; a friendlier error than a raw SQLite constraint
 * violation).
 */

// Same pattern as the schema's materials_code_prefix_check and the
// contract's own validation string.
const CODE_PATTERN = /^(?:LFG|SFG)[0-9]+$/;

export const materialCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(CODE_PATTERN, "Code must start with LFG or SFG followed by digits (e.g. LFG00938)."),
  description: z.string().trim().min(1, "Description is required."),
  uomKgPerCarton: z.number().positive("UOM (kg/carton) must be a positive number."),
  category: z.string().trim().min(1, "Category is required."),
  palletWeightLimitKg: z.number().positive("Pallet weight limit (kg) must be a positive number."),
  palletType: z.enum(["CARTON", "ROLL", "POUCH"]),
  shelfLifeDays: z.number().int().positive().nullable().optional(),
  plantOrigin: z.enum(["LIMBASI", "SABARKANTHA"]),
});

export type MaterialCreateInput = z.infer<typeof materialCreateSchema>;

// PATCH: every field the entities contract marks "editable_by: [R12]"
// can be updated here (Loop 29 - Alpesh asked specifically that
// pallet_weight_limit_kg be admin-editable per material, since the
// real DSR source has no such field to seed a real value from
// per-material - see PEN-007). `code` is deliberately excluded even
// though the contract marks it editable: changing a material's code
// after pallets/batches/ledger entries already reference it by
// material_id would not corrupt any FK (they reference the id, not
// the code), but silently renaming a material's business identifier
// is a bigger, unrequested behavior change than "let admin fix the
// weight limit" - out of this loop's bounded scope. There is still no
// hard-delete route - only `active` remains the deactivate/reactivate
// toggle, per the contract's own invariant.
export const materialUpdateSchema = z.object({
  active: z.boolean().optional(),
  description: z.string().trim().min(1, "Description is required.").optional(),
  uomKgPerCarton: z.number().positive("UOM (kg/carton) must be a positive number.").optional(),
  category: z.string().trim().min(1, "Category is required.").optional(),
  palletWeightLimitKg: z
    .number()
    .positive("Pallet weight limit (kg) must be a positive number.")
    .optional(),
  palletType: z.enum(["CARTON", "ROLL", "POUCH"]).optional(),
  shelfLifeDays: z.number().int().positive().nullable().optional(),
  plantOrigin: z.enum(["LIMBASI", "SABARKANTHA"]).optional(),
});

export type MaterialUpdateInput = z.infer<typeof materialUpdateSchema>;
