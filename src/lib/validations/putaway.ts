import { z } from "zod";

// Loop 24. Flow 2's Step 4 ("Move operation... Reason for move
// recorded") requires a reason on move but not on the first
// assignment (Step 2 has no reason field) - the two schemas reflect
// that difference rather than forcing one shape on both actions.
export const assignPalletSchema = z.object({
  palletId: z.string().trim().min(1, "Pallet is required."),
  locationId: z.string().trim().min(1, "Location is required."),
});
export type AssignPalletInput = z.infer<typeof assignPalletSchema>;

export const movePalletSchema = z.object({
  palletId: z.string().trim().min(1, "Pallet is required."),
  locationId: z.string().trim().min(1, "Location is required."),
  reason: z.string().trim().min(1, "A reason for the move is required."),
});
export type MovePalletInput = z.infer<typeof movePalletSchema>;
