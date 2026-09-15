import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { maintenanceTickets } from "../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { maintenanceTicketCreateSchema } from "@/lib/validations/maintenance";
import { maintenanceTicketNumberPrefix } from "@/lib/business-rules/maintenance";
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
 * Maintenance dashboard list (SCREEN-009, TASK-010). Not gated - same
 * PEN-022 precedent: R11 (the maintenance team - acknowledge/resolve)
 * has "maintenance.view", but R01/R02 (who create tickets and close/
 * verify fixes) have no explicit view grant, the same usability gap
 * already found for every other paperwork entity in this project.
 */
export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select().from(maintenanceTickets).orderBy(desc(maintenanceTickets.createdAt));
    return NextResponse.json({ maintenanceTickets: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

async function nextTicketNumber(db: ReturnType<typeof getDb>, date: string): Promise<string> {
  const prefix = maintenanceTicketNumberPrefix(date);
  const existing = await db.select({ ticketNumber: maintenanceTickets.ticketNumber }).from(maintenanceTickets);
  const todayCount = existing.filter((r) => r.ticketNumber.startsWith(prefix)).length;
  const seq = String(todayCount + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

/**
 * Raise a maintenance ticket (Flow 9 Step 1 - "Who can raise: any
 * warehouse team member"). Gated "maintenance.create" (R01/R02/R03 -
 * the real permission matrix's own reading of "any warehouse team
 * member", not literally unrestricted).
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("maintenance.create");
    const currentUserId = await requireCurrentUserId();

    const body = await request.json();
    const parsed = maintenanceTicketCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const id = crypto.randomUUID();
    const ticketNumber = await nextTicketNumber(db, today);
    await db.insert(maintenanceTickets).values({
      id,
      ticketNumber,
      category: parsed.data.category,
      location: parsed.data.location,
      description: parsed.data.description,
      severity: parsed.data.severity,
      status: "OPEN",
      raisedById: currentUserId,
    });

    const [created] = await db.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, id));
    return NextResponse.json({ maintenanceTicket: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
