import { ValidationError } from "../errors";

/**
 * Maintenance Ticket business rules (Loop 44 / TASK-010, Flow 9).
 *
 * Grounded directly in the domain entities contract's `maintenance_ticket`
 * entity (ENTITY-014) and workflows.yaml's own `maintenance_ticket_status`
 * state machine - fully contracted, every transition explicit, the same
 * as transfer_order_status and unlike loading_sheet_status.
 */

export const MAINTENANCE_CATEGORIES = [
  "DOOR",
  "FORKLIFT",
  "RACKING",
  "ELECTRICAL",
  "REFRIGERATION",
  "PPE",
  "OTHER",
] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

export const MAINTENANCE_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type MaintenanceSeverity = (typeof MAINTENANCE_SEVERITIES)[number];

export const MAINTENANCE_TICKET_STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
] as const;
export type MaintenanceTicketStatus = (typeof MAINTENANCE_TICKET_STATUSES)[number];

export type MaintenanceAction = "acknowledge" | "start_work" | "resolve" | "close" | "reopen";

const TRANSITIONS: Record<MaintenanceAction, { from: MaintenanceTicketStatus[]; to: MaintenanceTicketStatus }> = {
  acknowledge: { from: ["OPEN"], to: "ACKNOWLEDGED" },
  // Both ACKNOWLEDGED -> IN_PROGRESS and REOPENED -> IN_PROGRESS use the
  // same action name and land on the same state, transcribed exactly
  // from workflows.yaml's own two separate transition rows for
  // "start_work".
  start_work: { from: ["ACKNOWLEDGED", "REOPENED"], to: "IN_PROGRESS" },
  resolve: { from: ["IN_PROGRESS"], to: "RESOLVED" },
  close: { from: ["RESOLVED"], to: "CLOSED" },
  reopen: { from: ["RESOLVED"], to: "REOPENED" },
};

/**
 * Transcribed exactly from workflows.yaml's own maintenance_ticket_status
 * transitions ("CLOSED -> any" and "OPEN -> RESOLVED" are both already
 * unreachable here, since TRANSITIONS has no entry starting from CLOSED
 * and no entry landing on RESOLVED from OPEN directly).
 */
export function nextMaintenanceTicketStatus(
  current: MaintenanceTicketStatus,
  action: MaintenanceAction
): MaintenanceTicketStatus {
  if (current === "CLOSED") {
    throw new ValidationError("Closed maintenance tickets are immutable.");
  }
  const transition = TRANSITIONS[action];
  if (!transition.from.includes(current)) {
    throw new ValidationError(`Cannot ${action} a maintenance ticket in status ${current}.`);
  }
  return transition.to;
}

/** ENTITY-014's own conditional_rule: resolution_notes "required on resolve". */
export function assertResolutionNotesProvided(resolutionNotes: string | null | undefined): void {
  if (!resolutionNotes?.trim()) {
    throw new ValidationError("Resolution notes are required to resolve a maintenance ticket.");
  }
}

/** ticket_number generated_format "MT-YYYY-MMDD-NNN" (Flow 9 Step 1's own worked example, "MT-2026-0912-001"). */
export function maintenanceTicketNumberPrefix(date: string): string {
  const [y, m, d] = date.split("-");
  return `MT-${y}-${m}${d}-`;
}
