import { z } from "zod";

/**
 * Warehouse Master validation (Loop 22). The Drizzle schema's own
 * CHECK constraints are the actual source of truth for the enum
 * values here (see the warehouses table) - this file transcribes the
 * same three value lists so bad input gets a friendly message instead
 * of a raw SQLite constraint error, exactly the same relationship the
 * Material Master validation has to its own CHECK constraints. Unlike
 * Material Master, Warehouse Master is not yet in the formal entities
 * contract (see PEN-014) - nothing here adds a rule beyond what the
 * already-locked schema constraints and the architecture blueprint's
 * prose attribute list already state.
 */
export const warehouseCreateSchema = z.object({
  code: z.string().trim().min(1, "Code is required."),
  name: z.string().trim().min(1, "Name is required."),
  type: z.enum(["OWN", "3PL", "CROSS_PLANT"]),
  plant: z.enum(["LIMBASI", "SABARKANTHA", "PATAN"]),
  sapCode: z.string().trim().min(1, "SAP code is required."),
  address: z.string().trim().optional().nullable(),
  locationStructure: z.enum(["RACK", "FLAT"]),
});

export type WarehouseCreateInput = z.infer<typeof warehouseCreateSchema>;

export const warehouseUpdateSchema = z.object({
  active: z.boolean(),
});

export type WarehouseUpdateInput = z.infer<typeof warehouseUpdateSchema>;
