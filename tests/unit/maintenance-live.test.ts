import { describe, expect, it, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

/**
 * Loop 44: live, end-to-end Maintenance Ticket flow (TASK-010, Flow 9).
 * Same requirePermission/requireRole hoisted-currentRole mock technique
 * as every other *-live.test.ts file in this repository.
 *
 * Covers GS-006 (Maintenance Critical Issue - full lifecycle + CRITICAL
 * escalation flag), the RESOLVED -> REOPENED -> IN_PROGRESS branch, role
 * gates, and CLOSED immutability.
 */
const { currentRole } = vi.hoisted(() => ({ currentRole: { value: "R03" as string | undefined } }));

vi.mock("@/lib/auth", () => ({
  requirePermission: vi.fn(async (permission: string) => {
    const { hasPermission } = await import("../../src/lib/permissions");
    const { ForbiddenError, UnauthorizedError } = await import("../../src/lib/errors");
    const role = currentRole.value;
    if (!role) throw new UnauthorizedError();
    if (!hasPermission(role as never, permission)) {
      throw new ForbiddenError(`Role ${role} does not have permission "${permission}".`);
    }
    return role;
  }),
  requireRole: vi.fn(async (allowedRoles: string[]) => {
    const { ForbiddenError, UnauthorizedError } = await import("../../src/lib/errors");
    const role = currentRole.value;
    if (!role) throw new UnauthorizedError();
    if (!allowedRoles.includes(role)) {
      throw new ForbiddenError(`Role ${role} is not permitted to perform this action.`);
    }
    return role;
  }),
  requireCurrentUserId: vi.fn().mockResolvedValue("loop-44-fixture-user"),
}));

const { getDb } = await import("@/lib/db");
const { users, maintenanceTickets } = await import("../../drizzle/schema");
const { POST: createTicket, GET: listTickets } = await import("@/app/api/maintenance-tickets/route");
const { GET: getTicket } = await import("@/app/api/maintenance-tickets/[id]/route");
const { POST: acknowledgeTicket } = await import("@/app/api/maintenance-tickets/[id]/acknowledge/route");
const { POST: startWork } = await import("@/app/api/maintenance-tickets/[id]/start-work/route");
const { POST: resolveTicket } = await import("@/app/api/maintenance-tickets/[id]/resolve/route");
const { POST: closeTicket } = await import("@/app/api/maintenance-tickets/[id]/close/route");
const { POST: reopenTicket } = await import("@/app/api/maintenance-tickets/[id]/reopen/route");

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function getRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

const db = getDb();

const FIXTURE_USER_ID = "loop-44-fixture-user";

beforeAll(async () => {
  currentRole.value = "R03";
  const [existingUser] = await db.select().from(users).where(eq(users.id, FIXTURE_USER_ID));
  if (!existingUser) {
    await db.insert(users).values({
      id: FIXTURE_USER_ID,
      clerkUserId: "loop-44-fixture-clerk-user",
      name: "Loop 44 Fixture User",
      email: "loop44-fixture@example.test",
      roleId: "R03",
      department: "Warehouse",
      plant: "LIMBASI",
    });
  }
});

async function createOpenTicket(severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") {
  currentRole.value = "R03";
  const res = await createTicket(
    jsonRequest("/api/maintenance-tickets", {
      category: "REFRIGERATION",
      location: "CR1",
      description: "Temperature rising in cold storage",
      severity,
    })
  );
  const body = await res.json();
  expect(res.status, JSON.stringify(body)).toBe(201);
  return body.maintenanceTicket.id as string;
}

describe("GS-006: Maintenance Critical Issue - full lifecycle", () => {
  let ticketId: string;

  it("raises a CRITICAL ticket (Flow 9 Step 1)", async () => {
    ticketId = await createOpenTicket("CRITICAL");
    const res = await getTicket(getRequest(`/api/maintenance-tickets/${ticketId}`), { params: { id: ticketId } });
    const body = await res.json();
    expect(body.maintenanceTicket.status).toBe("OPEN");
    expect(body.maintenanceTicket.severity).toBe("CRITICAL");
    expect(body.maintenanceTicket.raisedById).toBe(FIXTURE_USER_ID);
  });

  it("R11 acknowledges (OPEN -> ACKNOWLEDGED)", async () => {
    currentRole.value = "R11";
    const res = await acknowledgeTicket(jsonRequest(`/api/maintenance-tickets/${ticketId}/acknowledge`, {}), {
      params: { id: ticketId },
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.maintenanceTicket.status).toBe("ACKNOWLEDGED");
    expect(body.maintenanceTicket.acknowledgedById).toBe(FIXTURE_USER_ID);
    expect(body.maintenanceTicket.acknowledgedAt).not.toBeNull();
  });

  it("a non-R11 role cannot acknowledge (real role-based 403)", async () => {
    const secondTicketId = await createOpenTicket("LOW");
    currentRole.value = "R01";
    const res = await acknowledgeTicket(jsonRequest(`/api/maintenance-tickets/${secondTicketId}/acknowledge`, {}), {
      params: { id: secondTicketId },
    });
    expect(res.status).toBe(403);
  });

  it("R11 starts work (ACKNOWLEDGED -> IN_PROGRESS)", async () => {
    currentRole.value = "R11";
    const res = await startWork(jsonRequest(`/api/maintenance-tickets/${ticketId}/start-work`, {}), {
      params: { id: ticketId },
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.maintenanceTicket.status).toBe("IN_PROGRESS");
  });

  it("refuses resolve without resolution notes", async () => {
    currentRole.value = "R11";
    const res = await resolveTicket(jsonRequest(`/api/maintenance-tickets/${ticketId}/resolve`, { resolutionNotes: "" }), {
      params: { id: ticketId },
    });
    expect(res.status).toBe(422);
  });

  it("R11 resolves with mandatory resolution notes and parts used", async () => {
    currentRole.value = "R11";
    const res = await resolveTicket(
      jsonRequest(`/api/maintenance-tickets/${ticketId}/resolve`, {
        resolutionNotes: "Replaced compressor relay.",
        partsUsed: "1x relay switch",
      }),
      { params: { id: ticketId } }
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.maintenanceTicket.status).toBe("RESOLVED");
    expect(body.maintenanceTicket.resolutionNotes).toBe("Replaced compressor relay.");
    expect(body.maintenanceTicket.partsUsed).toBe("1x relay switch");
    expect(body.maintenanceTicket.resolvedById).toBe(FIXTURE_USER_ID);
  });

  it("R02 (verify_fix) closes the ticket (RESOLVED -> CLOSED)", async () => {
    currentRole.value = "R02";
    const res = await closeTicket(jsonRequest(`/api/maintenance-tickets/${ticketId}/close`, {}), {
      params: { id: ticketId },
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.maintenanceTicket.status).toBe("CLOSED");
    expect(body.maintenanceTicket.closedAt).not.toBeNull();
  });

  it("a CLOSED ticket is immutable - a further action is refused", async () => {
    currentRole.value = "R11";
    const res = await startWork(jsonRequest(`/api/maintenance-tickets/${ticketId}/start-work`, {}), {
      params: { id: ticketId },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Closed maintenance tickets are immutable.");
  });

  it("appears in the real ticket list", async () => {
    const res = await listTickets();
    const body = await res.json();
    const found = (body.maintenanceTickets as { id: string }[]).find((t) => t.id === ticketId);
    expect(found).toBeDefined();
  });
});

describe("Verification finds it not fixed - RESOLVED -> REOPENED -> IN_PROGRESS", () => {
  it("R01 reopens with comments appended to resolution_notes, then R11 restarts work", async () => {
    const ticketId = await createOpenTicket("HIGH");
    currentRole.value = "R11";
    await acknowledgeTicket(jsonRequest(`/api/maintenance-tickets/${ticketId}/acknowledge`, {}), { params: { id: ticketId } });
    await startWork(jsonRequest(`/api/maintenance-tickets/${ticketId}/start-work`, {}), { params: { id: ticketId } });
    await resolveTicket(jsonRequest(`/api/maintenance-tickets/${ticketId}/resolve`, { resolutionNotes: "Tightened bolts." }), {
      params: { id: ticketId },
    });

    currentRole.value = "R01";
    const reopenRes = await reopenTicket(
      jsonRequest(`/api/maintenance-tickets/${ticketId}/reopen`, { comments: "Still loose, please recheck." }),
      { params: { id: ticketId } }
    );
    const reopenBody = await reopenRes.json();
    expect(reopenRes.status, JSON.stringify(reopenBody)).toBe(200);
    expect(reopenBody.maintenanceTicket.status).toBe("REOPENED");
    expect(reopenBody.maintenanceTicket.resolutionNotes).toContain("Tightened bolts.");
    expect(reopenBody.maintenanceTicket.resolutionNotes).toContain("Still loose, please recheck.");

    currentRole.value = "R11";
    const restartRes = await startWork(jsonRequest(`/api/maintenance-tickets/${ticketId}/start-work`, {}), {
      params: { id: ticketId },
    });
    const restartBody = await restartRes.json();
    expect(restartRes.status, JSON.stringify(restartBody)).toBe(200);
    expect(restartBody.maintenanceTicket.status).toBe("IN_PROGRESS");
  });
});
