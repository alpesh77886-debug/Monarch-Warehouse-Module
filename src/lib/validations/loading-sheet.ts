import { z } from "zod";

/**
 * Loading Sheet validation (Loop 41 / TASK-008), transcribed from
 * ENTITY-013 field-for-field.
 */
export const loadingSheetCreateSchema = z.object({
  date: z.string().trim().min(1, "Date is required."),
  vehicleNumber: z.string().trim().min(1, "Vehicle number is required."),
  driverName: z.string().trim().min(1, "Driver name is required."),
  transporter: z.string().trim().nullable().optional(),
  partyName: z.string().trim().min(1, "Party name is required."),
  destination: z.string().trim().min(1, "Destination is required."),
  exportDomestic: z.enum(["EXPORT", "DOMESTIC"]),
  temperatureC: z.number(),
});
export type LoadingSheetCreateInput = z.infer<typeof loadingSheetCreateSchema>;

export const loadingSheetPickSchema = z.object({
  palletId: z.string().trim().min(1, "Pallet is required."),
  overrideReason: z.string().trim().nullable().optional(),
});
export type LoadingSheetPickInput = z.infer<typeof loadingSheetPickSchema>;

export const loadingSheetQcApproveSchema = z.object({
  containerNumber: z.string().trim().min(1, "Container number is required."),
  sealNumber: z.string().trim().min(1, "Seal number is required."),
  boltNumber: z.string().trim().min(1, "Bolt number is required."),
});
export type LoadingSheetQcApproveInput = z.infer<typeof loadingSheetQcApproveSchema>;

export const loadingSheetLoadSchema = z.object({});

export const loadingSheetVerifySchema = z.object({});

export const loadingSheetGatePassSchema = z.object({
  gatePassNumber: z.string().trim().min(1, "Gate pass number is required."),
});
export type LoadingSheetGatePassInput = z.infer<typeof loadingSheetGatePassSchema>;
