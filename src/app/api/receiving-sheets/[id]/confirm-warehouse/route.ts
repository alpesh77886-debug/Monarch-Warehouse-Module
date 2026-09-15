import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { receivingSheets } from "../../../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { confirmWarehouseSchema } from "@/lib/validations/receiving-sheet";
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
 * Flow 1 Step 3 (warehouse side) / workflows.yaml's `warehouse_confirm`
 * action. R01/R03 only (permissions contract) - the same dual-
 * confirmation/lock/materialization pattern as confirm-packing, mirrored
 * rather than shared as one parameterized handler so each route's own
 * permission and field names stay directly readable.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("receiving_sheet.confirm_warehouse");
    const currentUserId = await requireCurrentUserId();

    const body = await request.json().catch(() => ({}));
    const parsed = confirmWarehouseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [sheet] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, params.id));
    if (!sheet) {
      throw new NotFoundError(`Receiving sheet "${params.id}" not found.`);
    }

    const currentStatus = sheet.status as ReceivingSheetStatus;
    const nextStatus = nextReceivingSheetStatus(currentStatus, "warehouse_confirm");
    const now = new Date().toISOString();

    let materialized: ReturnType<typeof materializeReceivingSheetLock> | null = null;
    const applied = db.transaction((tx) => {
      if (nextStatus === "LOCKED") {
        materialized = materializeReceivingSheetLock(tx, sheet.id, currentUserId);
      }
      const result = tx
        .update(receivingSheets)
        .set({
          status: nextStatus,
          warehouseConfirmedAt: now,
          ...(parsed.data.executiveId ? { warehouseExecutiveId: parsed.data.executiveId } : {}),
          ...(parsed.data.operatorId ? { warehouseOperatorId: parsed.data.operatorId } : {}),
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
