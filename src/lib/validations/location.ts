import { z } from "zod";

/**
 * Location validation (Loop 24), transcribed from the locations table's
 * own CHECK constraints and the entities contract's ENTITY-005
 * attribute list - the same relationship every other validations/*
 * file in this repo has to its schema table.
 */
export const locationCreateSchema = z.object({
  warehouseId: z.string().trim().min(1, "Warehouse is required."),
  coldRoom: z.enum(["CR1", "CR2", "FLOOR", "NA"]),
  block: z.string().trim().optional().nullable(),
  position: z.string().trim().optional().nullable(),
  floor: z.number().int().positive().optional().nullable(),
  fullCode: z.string().trim().min(1, "Full code is required."),
  capacityPallets: z.number().int().positive().default(1),
});

export type LocationCreateInput = z.infer<typeof locationCreateSchema>;

export const locationBlockSchema = z.object({
  status: z.enum(["EMPTY", "BLOCKED"]),
});

export type LocationBlockInput = z.infer<typeof locationBlockSchema>;
