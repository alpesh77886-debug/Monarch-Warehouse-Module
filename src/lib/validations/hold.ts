import { z } from "zod";
import { HOLD_REASONS } from "../business-rules/hold";

/**
 * Hold Record validation (Loop 38 / TASK-006). `holdReason` is narrowed
 * to the fixed dropdown by the Zod enum itself; `customReason`'s
 * conditional requirement (only when holdReason is "Other...") is
 * cross-field, so it is checked separately by validateHoldReason rather
 * than a Zod refine, matching how batch-number-format validation is
 * split out for Receiving Sheet.
 */
export const holdCreateSchema = z.object({
  materialId: z.string().trim().min(1, "Material is required."),
  batchId: z.string().trim().min(1, "Batch is required."),
  palletIds: z.array(z.string().trim().min(1)).min(1, "At least one pallet is required."),
  holdReason: z.enum(HOLD_REASONS),
  customReason: z.string().trim().max(500).nullable().optional(),
  placedByDepartment: z.string().trim().min(1, "Department is required."),
});
export type HoldCreateInput = z.infer<typeof holdCreateSchema>;

export const holdReleaseSchema = z.object({
  releaseRemarks: z.string().trim().max(500).nullable().optional(),
});
export type HoldReleaseInput = z.infer<typeof holdReleaseSchema>;

export const holdRejectSchema = z.object({
  releaseRemarks: z.string().trim().min(1, "A reason is required to reject a hold."),
});
export type HoldRejectInput = z.infer<typeof holdRejectSchema>;
