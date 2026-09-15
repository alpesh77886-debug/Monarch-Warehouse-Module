import { describe, expect, it } from "vitest";
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_SEVERITIES,
  MAINTENANCE_TICKET_STATUSES,
  assertResolutionNotesProvided,
  nextMaintenanceTicketStatus,
  maintenanceTicketNumberPrefix,
} from "@/lib/business-rules/maintenance";

describe("MAINTENANCE_CATEGORIES / SEVERITIES / STATUSES", () => {
  it("has the 7 categories from ENTITY-014's own check_constraint", () => {
    expect(MAINTENANCE_CATEGORIES).toEqual(["DOOR", "FORKLIFT", "RACKING", "ELECTRICAL", "REFRIGERATION", "PPE", "OTHER"]);
  });
  it("has the 4 severities", () => {
    expect(MAINTENANCE_SEVERITIES).toEqual(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
  });
  it("has the 6 states from workflows.yaml's own maintenance_ticket_status", () => {
    expect(MAINTENANCE_TICKET_STATUSES).toEqual(["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED"]);
  });
});

describe("assertResolutionNotesProvided", () => {
  it("rejects empty/missing resolution notes", () => {
    expect(() => assertResolutionNotesProvided(null)).toThrow(/required/i);
    expect(() => assertResolutionNotesProvided(undefined)).toThrow(/required/i);
    expect(() => assertResolutionNotesProvided("   ")).toThrow(/required/i);
  });
  it("accepts real resolution notes", () => {
    expect(() => assertResolutionNotesProvided("Replaced door sensor.")).not.toThrow();
  });
});

describe("nextMaintenanceTicketStatus", () => {
  it("walks the real sequence transcribed from workflows.yaml", () => {
    expect(nextMaintenanceTicketStatus("OPEN", "acknowledge")).toBe("ACKNOWLEDGED");
    expect(nextMaintenanceTicketStatus("ACKNOWLEDGED", "start_work")).toBe("IN_PROGRESS");
    expect(nextMaintenanceTicketStatus("IN_PROGRESS", "resolve")).toBe("RESOLVED");
    expect(nextMaintenanceTicketStatus("RESOLVED", "close")).toBe("CLOSED");
  });

  it("supports the RESOLVED -> REOPENED -> IN_PROGRESS branch", () => {
    expect(nextMaintenanceTicketStatus("RESOLVED", "reopen")).toBe("REOPENED");
    expect(nextMaintenanceTicketStatus("REOPENED", "start_work")).toBe("IN_PROGRESS");
  });

  it("refuses an out-of-order action (OPEN -> RESOLVED is explicitly invalid)", () => {
    expect(() => nextMaintenanceTicketStatus("OPEN", "resolve")).toThrow();
    expect(() => nextMaintenanceTicketStatus("OPEN", "start_work")).toThrow();
  });

  it("CLOSED tickets are immutable", () => {
    expect(() => nextMaintenanceTicketStatus("CLOSED", "acknowledge")).toThrow(/immutable/i);
  });
});

describe("maintenanceTicketNumberPrefix", () => {
  it("matches ENTITY-014's own worked example format (MT-YYYY-MMDD-)", () => {
    expect(maintenanceTicketNumberPrefix("2026-09-12")).toBe("MT-2026-0912-");
  });
});
