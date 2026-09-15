import { z } from "zod";
import { TRANSFER_TYPES } from "../business-rules/transfer-order";

/**
 * Transfer Order validation (Loop 43 / TASK-009), transcribed from
 * ENTITY-012 field-for-field.
 */
export const transferOrderCreateSchema = z.object({
  date: z.string().trim().min(1, "Date is required."),
  sourceWarehouseId: z.string().trim().min(1, "Source warehouse is required."),
  destinationWarehouseId: z.string().trim().min(1, "Destination warehouse is required."),
  transferType: z.enum(TRANSFER_TYPES),
});
export type TransferOrderCreateInput = z.infer<typeof transferOrderCreateSchema>;

export const transferOrderPickSchema = z.object({
  palletId: z.string().trim().min(1, "Pallet is required."),
});
export type TransferOrderPickInput = z.infer<typeof transferOrderPickSchema>;

export const transferOrderLoadSchema = z.object({
  vehicleNumber: z.string().trim().min(1, "Vehicle number is required."),
  driverName: z.string().trim().min(1, "Driver name is required."),
  transporter: z.string().trim().nullable().optional(),
  temperatureC: z.number().nullable().optional(),
  lrNumber: z.string().trim().nullable().optional(),
});
export type TransferOrderLoadInput = z.infer<typeof transferOrderLoadSchema>;
