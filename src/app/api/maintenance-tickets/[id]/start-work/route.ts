import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb, changesOf } from "@/lib/db";
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
 * ACKNOWLEDGED -> IN_PROGRESS, or REOPENED -> IN_PROGRESS (Flow 9 Step 4
 * - "Maintenance team records: work done..."). Gated requireRole(["R11"])
 * directly - the real permission matrix has no dedicated "start work"
 * permission, only .acknowledge/.resolve/.view, all R11 (the maintenance
 * team throughout Steps 3-4) - reusing that same real role rather than
 * inventing a new permission string.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole(["R11"]);

    const db = getDb();
    const [ticket] = await db.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, params.id));
    if (!ticket) {
      throw new NotFoundError(`Maintenance ticket "${params.id}" not found.`);
    }
    const nextStatus: MaintenanceTicketStatus = nextMaintenanceTicketStatus(
      ticket.status as MaintenanceTicketStatus,
      "start_work"
    );

    // A single guarded UPDATE is already atomic as one statement - no
    // wrapping transaction needed (D1 has no multi-statement
    // BEGIN/COMMIT, see PEN-044 / src/lib/db.ts).
    const result = await db
      .update(maintenanceTickets)
      .set({ status: nextStatus })
      .where(and(eq(maintenanceTickets.id, params.id), eq(maintenanceTickets.status, ticket.status)))
      .run();
    const applied = changesOf(result);
    if (applied === 0) {
      throw new ConflictError("This ticket was changed by someone else - your start-work action was not applied.");
    }

    const [updated] = await db.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, params.id));
    return NextResponse.json({ maintenanceTicket: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
