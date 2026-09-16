import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, runAtomicBatch, type UnrunStatement } from "@/lib/db";
import { locations, pallets, materials, palletBatches, stockLedger } from "../../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { assignPalletSchema } from "@/lib/validations/putaway";
import {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  NotFoundError,
  AuthNotConfiguredError,
} from "@/lib/errors";
import {
  validateLocationAssignment,
  asLocationStatus,
  type OccupyingPallet,
} from "@/lib/business-rules/location-guard";

export const runtime = "nodejs";

function errorResponse(err: unknown) {
  if (
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError ||
    err instanceof ValidationError ||
    err instanceof NotFoundError ||
    err instanceof AuthNotConfiguredError
  ) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

/**
 * First putaway assignment only (Flow 2 Step 2/3) - a pallet with no
 * current location yet. Moving an already-located pallet is the
 * separate /api/storage/move endpoint (Flow 2 Step 4), which requires
 * a reason and also has to free the pallet's previous location; this
 * endpoint intentionally refuses that case rather than silently
 * reassigning without a reason.
 *
 * **Loop 37 update (closes PEN-024):** now writes one append-only
 * stock_ledger MOVE row per pallet_batches entry the pallet carries
 * (usually one - see receiving-sheet-lock.ts, which is how every
 * pallet gets its first pallet_batches row today). qty/weight do not
 * change on a plain location assignment, so qty_change/weight_change
 * are 0 and qty_after/weight_after just restate the batch's own
 * carton_qty/weight_kg - the ledger row exists to make the location
 * itself traceable (Flow 2's "location history per pallet must be
 * traceable"), not to record a quantity movement. A pallet with no
 * pallet_batches row at all (a pre-Loop-35 fixture, or any pallet
 * inserted directly rather than through the Receiving Sheet flow) has
 * no real batch_id to write with - writing a fabricated one into an
 * append-only ledger is still worse than not writing the row, so that
 * case is silently skipped, same reasoning as the original PEN-024
 * finding, just narrower in scope now.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("putaway.confirm_location");
    const currentUserId = await requireCurrentUserId();

    const body = await request.json();
    const parsed = assignPalletSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [pallet] = await db.select().from(pallets).where(eq(pallets.id, parsed.data.palletId));
    if (!pallet) {
      throw new NotFoundError(`Pallet "${parsed.data.palletId}" not found.`);
    }
    if (pallet.currentLocationId) {
      throw new ValidationError(
        `Pallet ${pallet.palletNumber} already has a location - use the move action, which requires a reason.`
      );
    }

    const [location] = await db.select().from(locations).where(eq(locations.id, parsed.data.locationId));
    if (!location) {
      throw new NotFoundError(`Location "${parsed.data.locationId}" not found.`);
    }

    const occupant = await loadOccupant(db, location.currentPalletId);
    const newStatus = validateLocationAssignment(
      pallet,
      { ...location, status: asLocationStatus(location.status) },
      occupant
    );

    const today = new Date().toISOString().slice(0, 10);
    // This read pulls pallet_batches rows that none of the writes below
    // touch or depend on - it can run before the write block rather
    // than inside it, which turns this into a plain unconditional batch
    // (db.transaction() would crash on real D1 - no multi-statement
    // BEGIN/COMMIT, see PEN-044 / src/lib/db.ts).
    const batchRows = await db.select().from(palletBatches).where(eq(palletBatches.palletId, pallet.id));

    const stmts: UnrunStatement[] = [
      db.update(locations).set({ status: newStatus, currentPalletId: pallet.id }).where(eq(locations.id, location.id)),
      // current_warehouse_id "derived from location" per the
      // architecture blueprint's own Pallet attribute table.
      db
        .update(pallets)
        .set({ currentLocationId: location.id, currentWarehouseId: location.warehouseId })
        .where(eq(pallets.id, pallet.id)),
    ];
    for (const batchRow of batchRows) {
      stmts.push(
        db.insert(stockLedger).values({
          id: crypto.randomUUID(),
          date: today,
          shift: "NA",
          transactionType: "MOVE",
          materialId: pallet.materialId,
          batchId: batchRow.batchId,
          palletId: pallet.id,
          locationId: location.id,
          warehouseId: location.warehouseId,
          qtyChange: 0,
          qtyAfter: batchRow.cartonQty,
          weightChangeKg: 0,
          weightAfterKg: batchRow.weightKg,
          statusBefore: pallet.statusCode,
          statusAfter: pallet.statusCode,
          referenceType: "MANUAL_MOVE",
          referenceId: pallet.id,
          userId: currentUserId,
        })
      );
    }
    await runAtomicBatch(db, [stmts[0], ...stmts.slice(1)]);

    const [updatedPallet] = await db.select().from(pallets).where(eq(pallets.id, pallet.id));
    const [updatedLocation] = await db.select().from(locations).where(eq(locations.id, location.id));
    return NextResponse.json({ pallet: updatedPallet, location: updatedLocation });
  } catch (err) {
    return errorResponse(err);
  }
}

async function loadOccupant(
  db: ReturnType<typeof getDb>,
  currentPalletId: string | null
): Promise<OccupyingPallet | null> {
  if (!currentPalletId) return null;
  const [row] = await db
    .select({
      id: pallets.id,
      palletNumber: pallets.palletNumber,
      materialId: pallets.materialId,
      materialCode: materials.code,
    })
    .from(pallets)
    .innerJoin(materials, eq(pallets.materialId, materials.id))
    .where(eq(pallets.id, currentPalletId));
  return row ?? null;
}
