import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb, changesOf } from "@/lib/db";
import { maintenanceTickets } from "../../../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { maintenanceResolveSchema } from "@/lib/validations/maintenance";
import { assertResolutionNotesProvided, nextMaintenanceTicketStatus, type MaintenanceTicketStatus } from "@/lib/business-rules/maintenance";
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
 * IN_PROGRESS -> RESOLVED (Flow 9 Step 4 - "Resolution notes
 * mandatory"), gated "maintenance.resolve" (R11). ENTITY-014's own
 * conditional_rule enforced via assertResolutionNotesProvided.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("maintenance.resolve");
    const currentUserId = await requireCurrentUserId();

    const body = await request.json();
    const parsed = maintenanceResolveSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }
    assertResolutionNotesProvided(parsed.data.resolutionNotes);

    const db = getDb();
    const [ticket] = await db.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, params.id));
    if (!ticket) {
      throw new NotFoundError(`Maintenance ticket "${params.id}" not found.`);
    }
    const nextStatus: MaintenanceTicketStatus = nextMaintenanceTicketStatus(
      ticket.status as MaintenanceTicketStatus,
      "resolve"
    );

    const now = new Date().toISOString();
    // A single guarded UPDATE is already atomic as one statement - no
    // wrapping transaction needed (D1 has no multi-statement
    // BEGIN/COMMIT, see PEN-044 / src/lib/db.ts).
    const result = await db
      .update(maintenanceTickets)
      .set({
        status: nextStatus,
        resolvedById: currentUserId,
        resolvedAt: now,
        resolutionNotes: parsed.data.resolutionNotes,
        partsUsed: parsed.data.partsUsed ?? null,
      })
      .where(and(eq(maintenanceTickets.id, params.id), eq(maintenanceTickets.status, ticket.status)))
      .run();
    const applied = changesOf(result);
    if (applied === 0) {
      throw new ConflictError("This ticket was changed by someone else - your resolve action was not applied.");
    }

    const [updated] = await db.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, params.id));
    return NextResponse.json({ maintenanceTicket: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
