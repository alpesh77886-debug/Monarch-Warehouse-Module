import { z } from "zod";
import { CARTON_CONDITIONS } from "../business-rules/receiving-sheet";
import { BULK_REASONS } from "../business-rules/bulk";

/**
 * Receiving Sheet validation (Loop 35 / TASK-004), transcribed from the
 * entities contract's ENTITY-009/ENTITY-010 field-for-field, the same
 * split this repository already uses elsewhere: DB CHECK constraints
 * enforce the shape, Zod adds the friendlier error and the fuller batch
 * regex (validated separately in the business-rules module, since it is
 * shared with the lock-time production-date derivation).
 */
export const receivingSheetCreateSchema = z.object({
  date: z.string().trim().min(1, "Date is required."),
  shift: z.enum(["A", "B", "C"]),
  line: z.enum(["FF", "SPECIALITY"]),
  materialId: z.string().trim().min(1, "Material is required."),
  batchNumber: z.string().trim().min(1, "Batch number is required."),
  defaultPalletStatus: z.enum(["QC_HOLD", "BULK"]).default("QC_HOLD"),
  bulkReason: z.enum(BULK_REASONS).nullable().optional(),
});
export type ReceivingSheetCreateInput = z.infer<typeof receivingSheetCreateSchema>;

// Loop 42 / TASK-007: the repack-receipt route's own body - the header
// fields a new receiving sheet needs, minus defaultPalletStatus/
// bulkReason (a repack sheet is always QC_HOLD per the flow document's
// own "new QC hold" wording - not a user choice, see the route's
// comment) and minus batchNumber (the flow document's own scenario
// allows "new batch reference (or same batch)" - left as the same
// required field here, unchanged from the normal create schema, not a
// second invented shape).
export const bulkRepackCreateSchema = z.object({
  date: z.string().trim().min(1, "Date is required."),
  shift: z.enum(["A", "B", "C"]),
  line: z.enum(["FF", "SPECIALITY"]),
  batchNumber: z.string().trim().min(1, "Batch number is required."),
});
export type BulkRepackCreateInput = z.infer<typeof bulkRepackCreateSchema>;

export const receivingSheetUpdateSchema = z.object({
  date: z.string().trim().min(1).optional(),
  shift: z.enum(["A", "B", "C"]).optional(),
  line: z.enum(["FF", "SPECIALITY"]).optional(),
  materialId: z.string().trim().min(1).optional(),
  batchNumber: z.string().trim().min(1).optional(),
  defaultPalletStatus: z.enum(["QC_HOLD", "BULK"]).optional(),
});
export type ReceivingSheetUpdateInput = z.infer<typeof receivingSheetUpdateSchema>;

export const receivingSheetPalletCreateSchema = z.object({
  palletNumber: z.string().trim().min(1, "Pallet number is required."),
  qty: z.number().int().positive("Quantity must be a positive whole number."),
  receivingTime: z.string().trim().min(1, "Receiving time is required."),
  cartonCondition: z.enum(CARTON_CONDITIONS).default("OK"),
  temperatureC: z.number().nullable().optional(),
  remarks: z.string().trim().nullable().optional(),
});
export type ReceivingSheetPalletCreateInput = z.infer<typeof receivingSheetPalletCreateSchema>;

export const confirmPackingSchema = z.object({
  supervisorId: z.string().trim().min(1).nullable().optional(),
  operatorId: z.string().trim().min(1).nullable().optional(),
});
export type ConfirmPackingInput = z.infer<typeof confirmPackingSchema>;

export const confirmWarehouseSchema = z.object({
  executiveId: z.string().trim().min(1).nullable().optional(),
  operatorId: z.string().trim().min(1).nullable().optional(),
});
export type ConfirmWarehouseInput = z.infer<typeof confirmWarehouseSchema>;
