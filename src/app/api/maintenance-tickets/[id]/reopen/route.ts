import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb, changesOf } from "@/lib/db";
import { maintenanceTickets } from "../../../../../../drizzle/schema";
import { requireRole } from "@/lib/auth";
import { maintenanceReopenSchema } from "@/lib/validations/maintenance";
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
 * RESOLVED -> REOPENED (Flow 9 Step 5 - "If not fixed -> REOPEN with
 * comments"). Same actors as close (requireRole(["R01","R02"])) - the
 * alternate outcome of the same verification step. ENTITY-014 has no
 * separate "reopen_comments" field, so the comment is appended to the
 * ticket's own resolution_notes (the one real free-text field this
 * entity contracts), not silently dropped or given an invented new
 * column - see PEN-043.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole(["R01", "R02"]);

    const body = await request.json();
    const parsed = maintenanceReopenSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [ticket] = await db.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, params.id));
    if (!ticket) {
      throw new NotFoundError(`Maintenance ticket "${params.id}" not found.`);
    }
    const nextStatus: MaintenanceTicketStatus = nextMaintenanceTicketStatus(
      ticket.status as MaintenanceTicketStatus,
      "reopen"
    );

    const appendedNotes = `${ticket.resolutionNotes ?? ""}\n[REOPENED] ${parsed.data.comments}`.trim();
    // A single guarded UPDATE is already atomic as one statement - no
    // wrapping transaction needed (D1 has no multi-statement
    // BEGIN/COMMIT, see PEN-044 / src/lib/db.ts).
    const result = await db
      .update(maintenanceTickets)
      .set({ status: nextStatus, resolutionNotes: appendedNotes })
      .where(and(eq(maintenanceTickets.id, params.id), eq(maintenanceTickets.status, ticket.status)))
      .run();
    const applied = changesOf(result);
    if (applied === 0) {
      throw new ConflictError("This ticket was changed by someone else - your reopen action was not applied.");
    }

    const [updated] = await db.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, params.id));
    return NextResponse.json({ maintenanceTicket: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
