import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { maintenanceTickets } from "../../../../../../drizzle/schema";
import { requireRole } from "@/lib/auth";
import { nextMaintenanceTicketStatus, type MaintenanceTicketStatus } from "@/lib/business-rules/maintenance";
import {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthNotConfiguredError,
} from "@/lib/errors";

export const runtime = "nodejs";

function errorResponse(err: unknown) {
  if (
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError ||
    err instanceof ValidationError ||
    err instanceof NotFoundError ||
    err instanceof ConflictError ||
    err instanceof AuthNotConfiguredError
  ) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

/**
 * RESOLVED -> CLOSED (Flow 9 Step 5 - "Warehouse team (who raised)
 * verifies fix... Status: RESOLVED -> CLOSED"). Gated
 * requireRole(["R01","R02"]) - the real permission matrix names this
 * same real action two ways from two role perspectives ("maintenance.
 * close" for R01, "maintenance.verify_fix" for R02), but ENTITY-014 has
 * no separate verified_by/verified_at field to record a distinct
 * verification step - so both roles perform the one real CLOSED
 * transition directly, not two invented sub-steps. See PEN-043.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole(["R01", "R02"]);

    const db = getDb();
    const [ticket] = await db.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, params.id));
    if (!ticket) {
      throw new NotFoundError(`Maintenance ticket "${params.id}" not found.`);
    }
    const nextStatus: MaintenanceTicketStatus = nextMaintenanceTicketStatus(
      ticket.status as MaintenanceTicketStatus,
      "close"
    );

    const now = new Date().toISOString();
    const applied = db.transaction((tx) => {
      const result = tx
        .update(maintenanceTickets)
        .set({ status: nextStatus, closedAt: now })
        .where(and(eq(maintenanceTickets.id, params.id), eq(maintenanceTickets.status, ticket.status)))
        .run();
      return result.changes;
    });
    if (applied === 0) {
      throw new ConflictError("This ticket was changed by someone else - your close action was not applied.");
    }

    const [updated] = await db.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, params.id));
    return NextResponse.json({ maintenanceTicket: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
