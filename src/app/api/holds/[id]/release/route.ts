import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, runAtomicBatch } from "@/lib/db";
import { holdRecords, holdPallets, pallets, stockLedger } from "../../../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { holdReleaseSchema } from "@/lib/validations/hold";
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
    if (hold.status !== "ACTIVE") {
      throw new ValidationError(`Only an ACTIVE hold can be released - this hold is ${hold.status}.`);
    }

    const heldPallets = await db
      .select({ pallet: pallets })
      .from(holdPallets)
      .innerJoin(pallets, eq(holdPallets.palletId, pallets.id))
      .where(eq(holdPallets.holdId, params.id));

    const transitions = heldPallets.map(({ pallet }) => ({
      pallet,
      transition: validatePalletStatusTransition(pallet.statusCode as PalletStatus, "OK", role),
    }));

    const now = new Date().toISOString();
    // db.transaction() would crash on real D1 (no multi-statement
    // BEGIN/COMMIT - see PEN-044 / src/lib/db.ts). None of these writes'
    // values depend on another statement's result, so a plain atomic
    // batch is the correct replacement.
    const holdUpdateStmt = db
      .update(holdRecords)
      .set({
        status: "RELEASED",
        releasedById: currentUserId,
        releasedAt: now,
        releaseRemarks: parsed.data.releaseRemarks ?? null,
      })
      .where(eq(holdRecords.id, params.id));

    const palletStmts = transitions.flatMap(({ pallet, transition }) => {
      const ledgerEntry = describeLedgerEntry(transition);
      return [
        db.update(pallets).set({ statusCode: "OK" }).where(eq(pallets.id, pallet.id)),
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
