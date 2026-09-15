import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { maintenanceTickets } from "../../../../../drizzle/schema";
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

// Not gated - see the list route's own comment (PEN-022 precedent).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb();
    const [ticket] = await db.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, params.id));
    if (!ticket) {
      throw new NotFoundError(`Maintenance ticket "${params.id}" not found.`);
    }
    return NextResponse.json({ maintenanceTicket: ticket });
  } catch (err) {
    return errorResponse(err);
  }
}
