import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { maintenanceTickets } from "../../../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
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
 * OPEN -> ACKNOWLEDGED (Flow 9 Step 3 - "Maintenance team acknowledges:
 * who, when"), gated "maintenance.acknowledge" (R11).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("maintenance.acknowledge");
    const currentUserId = await requireCurrentUserId();

    const db = getDb();
    const [ticket] = await db.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, params.id));
    if (!ticket) {
      throw new NotFoundError(`Maintenance ticket "${params.id}" not found.`);
    }
    const nextStatus: MaintenanceTicketStatus = nextMaintenanceTicketStatus(
      ticket.status as MaintenanceTicketStatus,
      "acknowledge"
    );

    const now = new Date().toISOString();
    const applied = db.transaction((tx) => {
      const result = tx
        .update(maintenanceTickets)
        .set({ status: nextStatus, acknowledgedById: currentUserId, acknowledgedAt: now })
        .where(and(eq(maintenanceTickets.id, params.id), eq(maintenanceTickets.status, ticket.status)))
        .run();
      return result.changes;
    });
    if (applied === 0) {
      throw new ConflictError("This ticket was changed by someone else - your acknowledge action was not applied.");
    }

    const [updated] = await db.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, params.id));
    return NextResponse.json({ maintenanceTicket: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
