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

// Loop 50 / PEN-037 (Alpesh: "Hold release Partial bhi kar lo"): palletIds
// is optional and defaults to every currently-ACTIVE pallet on the hold
// when omitted - the exact same "release the whole hold" behavior this
// route already had, byte-for-byte, so no existing caller needs to change.
// When given, it must name a real, non-empty subset.
export const holdReleaseSchema = z.object({
  releaseRemarks: z.string().trim().max(500).nullable().optional(),
  palletIds: z.array(z.string().trim().min(1)).min(1).optional(),
});
export type HoldReleaseInput = z.infer<typeof holdReleaseSchema>;

export const holdRejectSchema = z.object({
  releaseRemarks: z.string().trim().min(1, "A reason is required to reject a hold."),
  palletIds: z.array(z.string().trim().min(1)).min(1).optional(),
});
export type HoldRejectInput = z.infer<typeof holdRejectSchema>;
