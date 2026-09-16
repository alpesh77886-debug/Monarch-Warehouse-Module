import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb, changesOf, runAtomicBatch } from "@/lib/db";
import { receivingSheets } from "../../../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { confirmPackingSchema } from "@/lib/validations/receiving-sheet";
import {
  nextReceivingSheetStatus,
  type ReceivingSheetStatus,
} from "@/lib/business-rules/receiving-sheet";
import { planReceivingSheetLock } from "@/lib/receiving-sheet-lock";
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
 * Flow 1 Step 3 (packing side) / workflows.yaml's `packing_confirm`
 * action. R06/R07 only (permissions contract). If this is the second
 * confirmation, the sheet locks in the same transaction and Flow 1 Step
 * 4's materialization (real batch/pallets/pallet_batches/stock_ledger
 * rows) runs before the status flips - see materializeReceivingSheetLock.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("receiving_sheet.confirm_packing");
    const currentUserId = await requireCurrentUserId();

    const body = await request.json().catch(() => ({}));
    const parsed = confirmPackingSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [sheet] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, params.id));
    if (!sheet) {
      throw new NotFoundError(`Receiving sheet "${params.id}" not found.`);
    }

    const currentStatus = sheet.status as ReceivingSheetStatus;
    const nextStatus = nextReceivingSheetStatus(currentStatus, "packing_confirm");
    const now = new Date().toISOString();

    // NS-011: the confirm depends on the row still being in the exact
    // status this handler just read - a conditional UPDATE guarantees
    // that only one of two concurrent requests can actually apply its
    // transition; the loser's affected-row count comes back 0.
    //
    // db.transaction() would crash on real D1 (no multi-statement
    // BEGIN/COMMIT - see PEN-044 / src/lib/db.ts). The guarded closing
    // UPDATE decides whether this confirmation is even allowed to
    // proceed, so it runs alone first, and the lock-time materialization
    // writes (if any) only run, as one atomic batch, once that guard is
    // confirmed to have matched - see planReceivingSheetLock's own doc
    // comment for why this ordering also closes a latent
    // double-materialization race the old code had.
    const materialized = nextStatus === "LOCKED" ? planReceivingSheetLock(db, sheet.id, currentUserId) : null;

    const guardResult = await db
      .update(receivingSheets)
      .set({
        status: nextStatus,
        packingConfirmedAt: now,
        ...(parsed.data.supervisorId ? { packingSupervisorId: parsed.data.supervisorId } : {}),
        ...(parsed.data.operatorId ? { packingOperatorId: parsed.data.operatorId } : {}),
        ...(materialized
          ? { totalQty: materialized.totalQty, totalBoxes: materialized.totalBoxes }
          : {}),
      })
      .where(and(eq(receivingSheets.id, sheet.id), eq(receivingSheets.status, currentStatus)))
      .run();
    const applied = changesOf(guardResult);

    if (applied === 0) {
      throw new ConflictError(
        "This sheet was already confirmed or changed by someone else - your confirmation was not applied."
      );
    }

    if (materialized && materialized.statements.length > 0) {
      await runAtomicBatch(db, [materialized.statements[0], ...materialized.statements.slice(1)]);
    }

    const [updated] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, sheet.id));
    return NextResponse.json({ receivingSheet: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
