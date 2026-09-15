import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { receivingSheets } from "../../../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { confirmPackingSchema } from "@/lib/validations/receiving-sheet";
import {
  nextReceivingSheetStatus,
  type ReceivingSheetStatus,
} from "@/lib/business-rules/receiving-sheet";
import { materializeReceivingSheetLock } from "@/lib/receiving-sheet-lock";
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
    let materialized: ReturnType<typeof materializeReceivingSheetLock> | null = null;
    const applied = db.transaction((tx) => {
      if (nextStatus === "LOCKED") {
        materialized = materializeReceivingSheetLock(tx, sheet.id, currentUserId);
      }
      const result = tx
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
      return result.changes;
    });

    if (applied === 0) {
      throw new ConflictError(
        "This sheet was already confirmed or changed by someone else - your confirmation was not applied."
      );
    }

    const [updated] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, sheet.id));
    return NextResponse.json({ receivingSheet: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
