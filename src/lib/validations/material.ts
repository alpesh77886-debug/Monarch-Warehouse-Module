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

// PATCH: only "active" (deactivate/reactivate) is editable via this
// route today - the entities contract's own invariant says a material
// with active stock cannot be deleted, only deactivated, so there is
// no hard-delete route at all, only this toggle.
export const materialUpdateSchema = z.object({
  active: z.boolean(),
});

export type MaterialUpdateInput = z.infer<typeof materialUpdateSchema>;
