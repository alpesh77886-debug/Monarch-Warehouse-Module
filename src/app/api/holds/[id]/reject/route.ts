import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, runAtomicBatch } from "@/lib/db";
import { holdRecords, holdPallets, pallets, stockLedger } from "../../../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { holdRejectSchema } from "@/lib/validations/hold";
import { rollupHoldStatus, type HoldPalletStatus } from "@/lib/business-rules/hold";
import { validatePalletStatusTransition, describeLedgerEntry, type PalletStatus } from "@/lib/workflows/pallet-status";
import { buildWarehouseNotificationInserts, type NotificationEventType } from "@/lib/notify";
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
 * Reject a hold (workflows.yaml's qc_reject action: HOLD -> REJECTED,
 * R04 only). No contract-mandated exact error wording exists for this
 * one (unlike release/NS-003), so requirePermission's own message is
 * used as-is.
 *
 * Loop 50 / PEN-037: same optional `palletIds` partial-action support as
 * the release route (see that route's own doc comment for the full
 * reasoning) - omitting it rejects every still-ACTIVE pallet, the exact
 * same whole-hold behavior this route already had.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = await requirePermission("holds.reject");
    const currentUserId = await requireCurrentUserId();

    const body = await request.json();
    const parsed = holdRejectSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [hold] = await db.select().from(holdRecords).where(eq(holdRecords.id, params.id));
    if (!hold) {
      throw new NotFoundError(`Hold "${params.id}" not found.`);
    }
    if (hold.status !== "ACTIVE" && hold.status !== "PARTIALLY_RELEASED") {
      throw new ValidationError(
        `Only a hold with pallets still ACTIVE can be rejected - this hold is ${hold.status}.`
      );
    }

    const allHoldPallets = await db
      .select({ holdPallet: holdPallets, pallet: pallets })
      .from(holdPallets)
      .innerJoin(pallets, eq(holdPallets.palletId, pallets.id))
      .where(eq(holdPallets.holdId, params.id));

    const activeRows = allHoldPallets.filter((r) => r.holdPallet.status === "ACTIVE");
    if (activeRows.length === 0) {
      throw new ValidationError(`Hold "${params.id}" has no ACTIVE pallets left to reject.`);
    }

    let targets = activeRows;
    if (parsed.data.palletIds) {
      const requested = new Set(parsed.data.palletIds);
      targets = activeRows.filter((r) => requested.has(r.pallet.id));
      const foundIds = new Set(targets.map((r) => r.pallet.id));
      const missing = parsed.data.palletIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new ValidationError(
          `Pallet(s) not ACTIVE on this hold (already released/rejected, or not part of it): ${missing.join(", ")}.`
        );
      }
    }

    const transitions = targets.map(({ pallet }) => ({
      pallet,
      transition: validatePalletStatusTransition(pallet.statusCode as PalletStatus, "REJECTED", role),
    }));

    const now = new Date().toISOString();
    const targetIds = new Set(targets.map((r) => r.holdPallet.id));
    const finalStatuses: HoldPalletStatus[] = allHoldPallets.map((r) =>
      targetIds.has(r.holdPallet.id) ? "REJECTED" : (r.holdPallet.status as HoldPalletStatus)
    );
    const newHoldStatus = rollupHoldStatus(finalStatuses);

    // db.transaction() would crash on real D1 (no multi-statement
    // BEGIN/COMMIT - see PEN-044 / src/lib/db.ts). None of these writes'
    // values depend on another statement's result, so a plain atomic
    // batch is the correct replacement.
    const holdUpdateStmt = db
      .update(holdRecords)
      .set({
        status: newHoldStatus,
        releasedById: currentUserId,
        releasedAt: now,
        releaseRemarks: parsed.data.releaseRemarks,
      })
      .where(eq(holdRecords.id, params.id));

    const palletStmts = transitions.flatMap(({ pallet, transition }) => {
      const holdPalletRow = targets.find((r) => r.pallet.id === pallet.id)!.holdPallet;
      const ledgerEntry = describeLedgerEntry(transition);
      return [
        db.update(pallets).set({ statusCode: "REJECTED" }).where(eq(pallets.id, pallet.id)),
        db
          .update(holdPallets)
          .set({
            status: "REJECTED",
            releasedById: currentUserId,
            releasedAt: now,
            releaseRemarks: parsed.data.releaseRemarks,
          })
          .where(eq(holdPallets.id, holdPalletRow.id)),
        db.insert(stockLedger).values({
          id: crypto.randomUUID(),
          date: now.slice(0, 10),
          shift: "NA",
          transactionType: ledgerEntry.transactionType,
          materialId: hold.materialId,
          batchId: hold.batchId,
          palletId: pallet.id,
          locationId: pallet.currentLocationId,
          warehouseId: pallet.currentWarehouseId,
          qtyChange: 0,
          qtyAfter: pallet.totalCartons,
          weightChangeKg: 0,
          weightAfterKg: pallet.totalWeightKg,
          statusBefore: ledgerEntry.statusBefore,
          statusAfter: ledgerEntry.statusAfter,
          referenceType: ledgerEntry.referenceType,
          referenceId: hold.id,
          userId: currentUserId,
          remarks: parsed.data.releaseRemarks,
        }),
      ];
    });

    // Loop 50 / PEN-038: notify the real Warehouse role graph - see
    // src/lib/notify.ts's own doc comment for the real R01/R02/R03
    // reading.
    const notifyEventType: NotificationEventType =
      newHoldStatus === "PARTIALLY_RELEASED" ? "HOLD_PARTIALLY_RELEASED" : "HOLD_REJECTED";
    const notifyStmts = await buildWarehouseNotificationInserts(db, {
      eventType: notifyEventType,
      title: `Hold ${newHoldStatus === "PARTIALLY_RELEASED" ? "partially resolved" : "rejected"}: ${hold.holdNumber}`,
      body: `${hold.holdNumber} - ${targets.length} of ${allHoldPallets.length} pallet(s) rejected: ${parsed.data.releaseRemarks}`,
      referenceType: "HOLD_RECORD",
      referenceId: hold.id,
      createdByUserId: currentUserId,
    });

    await runAtomicBatch(db, [holdUpdateStmt, ...palletStmts, ...notifyStmts]);

    const [updated] = await db.select().from(holdRecords).where(eq(holdRecords.id, params.id));
    return NextResponse.json({ hold: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
