import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, runAtomicBatch } from "@/lib/db";
import { holdRecords, holdPallets, pallets, stockLedger } from "../../../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { holdReleaseSchema } from "@/lib/validations/hold";
import { rollupHoldStatus, type HoldPalletStatus } from "@/lib/business-rules/hold";
import { validatePalletStatusTransition, describeLedgerEntry, type PalletStatus } from "@/lib/workflows/pallet-status";
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
 * Release a hold (workflows.yaml's qc_release_hold action: HOLD -> OK,
 * actor R04 or R05 - INV-005). NS-003 ("Non-QC user attempts to release
 * hold") names the exact expected wording "Only QC role can release
 * holds" - requirePermission's own generic denial message does not
 * carry that exact phrase, so it is caught and rethrown with the
 * contract's own wording; the underlying authorization decision (only
 * R04/R05, from the real permission matrix) is unchanged.
 *
 * Loop 50 / PEN-037 (Alpesh: "Hold release Partial bhi kar lo...1200
 * boxes hold ho usme se 300 ya 400 Release karna pade"): an optional
 * `palletIds` body field now names a real subset of the hold's own
 * still-ACTIVE pallets to release, instead of always acting on every
 * pallet - omitting it releases everything still ACTIVE, the exact
 * same whole-hold behavior this route already had (every existing
 * caller keeps working unchanged). The hold_record's own `status` is
 * never set directly here - it is rolled up from every hold_pallets
 * row's own real status (see rollupHoldStatus), so a hold that still
 * has other ACTIVE pallets after this action correctly reads
 * PARTIALLY_RELEASED, not RELEASED.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    let role;
    try {
      role = await requirePermission("holds.release");
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw new ForbiddenError("Only QC role can release holds.");
      }
      throw err;
    }
    const currentUserId = await requireCurrentUserId();

    const body = await request.json().catch(() => ({}));
    const parsed = holdReleaseSchema.safeParse(body);
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
        `Only a hold with pallets still ACTIVE can be released - this hold is ${hold.status}.`
      );
    }

    const allHoldPallets = await db
      .select({ holdPallet: holdPallets, pallet: pallets })
      .from(holdPallets)
      .innerJoin(pallets, eq(holdPallets.palletId, pallets.id))
      .where(eq(holdPallets.holdId, params.id));

    const activeRows = allHoldPallets.filter((r) => r.holdPallet.status === "ACTIVE");
    if (activeRows.length === 0) {
      throw new ValidationError(`Hold "${params.id}" has no ACTIVE pallets left to release.`);
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
      transition: validatePalletStatusTransition(pallet.statusCode as PalletStatus, "OK", role),
    }));

    const now = new Date().toISOString();
    const targetIds = new Set(targets.map((r) => r.holdPallet.id));
    const finalStatuses: HoldPalletStatus[] = allHoldPallets.map((r) =>
      targetIds.has(r.holdPallet.id) ? "RELEASED" : (r.holdPallet.status as HoldPalletStatus)
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
        releaseRemarks: parsed.data.releaseRemarks ?? null,
      })
      .where(eq(holdRecords.id, params.id));

    const palletStmts = transitions.flatMap(({ pallet, transition }) => {
      const holdPalletRow = targets.find((r) => r.pallet.id === pallet.id)!.holdPallet;
      const ledgerEntry = describeLedgerEntry(transition);
      return [
        db.update(pallets).set({ statusCode: "OK" }).where(eq(pallets.id, pallet.id)),
        db
          .update(holdPallets)
          .set({
            status: "RELEASED",
            releasedById: currentUserId,
            releasedAt: now,
            releaseRemarks: parsed.data.releaseRemarks ?? null,
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
          remarks: parsed.data.releaseRemarks ?? null,
        }),
      ];
    });

    await runAtomicBatch(db, [holdUpdateStmt, ...palletStmts]);

    const [updated] = await db.select().from(holdRecords).where(eq(holdRecords.id, params.id));
    return NextResponse.json({ hold: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
