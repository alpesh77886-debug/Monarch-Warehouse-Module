import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { receivingSheets } from "../../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { assertCanCancel, type ReceivingSheetStatus } from "@/lib/business-rules/receiving-sheet";
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
 * Cancel a DRAFT receiving sheet (PEN-033, Loop 39 - Alpesh-approved).
 * workflows.yaml's own state machine only allows DRAFT -> CANCELLED
 * (the "cancel" action has no listed actor restriction, so this is
 * gated the same as the existing DRAFT-only PATCH edit route:
 * "receiving_sheet.create"). Once either side has confirmed
 * (PENDING_PACKING/PENDING_WAREHOUSE) or the sheet is LOCKED, it can no
 * longer be cancelled - matching the same "confirmation starts the
 * legal-document lifecycle" reasoning the PATCH route already uses.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("receiving_sheet.create");

    const db = getDb();
    const [existing] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, params.id));
    if (!existing) {
      throw new NotFoundError(`Receiving sheet "${params.id}" not found.`);
    }
    const currentStatus = existing.status as ReceivingSheetStatus;
    assertCanCancel(currentStatus);

    // Same NS-011-style conditional UPDATE as every other status
    // transition in this repository: only applies if the row is still
    // in the exact status just read.
    const applied = db.transaction((tx) => {
      const result = tx
        .update(receivingSheets)
        .set({ status: "CANCELLED" })
        .where(and(eq(receivingSheets.id, params.id), eq(receivingSheets.status, currentStatus)))
        .run();
      return result.changes;
    });
    if (applied === 0) {
      throw new ConflictError("This sheet was changed by someone else - your cancellation was not applied.");
    }

    const [updated] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, params.id));
    return NextResponse.json({ receivingSheet: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
