import { z } from "zod";
import { MAINTENANCE_CATEGORIES, MAINTENANCE_SEVERITIES } from "../business-rules/maintenance";

/**
 * Maintenance Ticket validation (Loop 44 / TASK-010), transcribed from
 * ENTITY-014 field-for-field.
 */
export const maintenanceTicketCreateSchema = z.object({
  category: z.enum(MAINTENANCE_CATEGORIES),
  location: z.string().trim().min(1, "Location is required."),
  description: z.string().trim().min(1, "Description is required."),
  severity: z.enum(MAINTENANCE_SEVERITIES),
});
export type MaintenanceTicketCreateInput = z.infer<typeof maintenanceTicketCreateSchema>;

export const maintenanceResolveSchema = z.object({
  resolutionNotes: z.string().trim().min(1, "Resolution notes are required."),
  partsUsed: z.string().trim().nullable().optional(),
});
export type MaintenanceResolveInput = z.infer<typeof maintenanceResolveSchema>;

export const maintenanceReopenSchema = z.object({
  comments: z.string().trim().min(1, "Reopen comments are required."),
});
export type MaintenanceReopenInput = z.infer<typeof maintenanceReopenSchema>;
