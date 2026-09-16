import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, runAtomicBatch, type UnrunStatement } from "@/lib/db";
import { locations, pallets, materials, palletBatches, stockLedger } from "../../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { movePalletSchema } from "@/lib/validations/putaway";
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
 * Move an already-located pallet to a new location (Flow 2 Step 4:
 * "select pallet -> select new location -> confirm", with a mandatory
 * reason - "Reason for move recorded"). Frees the pallet's previous
 * location back to EMPTY as part of the same transaction. **Loop 37
 * update (closes PEN-024):** also writes one append-only stock_ledger
 * MOVE row per pallet_batches entry, same shape as the putaway route -
 * see its module comment for the qty/weight-unchanged reasoning and
 * the no-pallet_batches-row skip case. The one real difference here:
 * "Reason for move recorded" lands in the ledger row's own `remarks`
 * column, since that column exists for exactly this.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("putaway.move_pallet");
    const currentUserId = await requireCurrentUserId();

    const body = await request.json();
    const parsed = movePalletSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [pallet] = await db.select().from(pallets).where(eq(pallets.id, parsed.data.palletId));
    if (!pallet) {
      throw new NotFoundError(`Pallet "${parsed.data.palletId}" not found.`);
    }
    if (!pallet.currentLocationId) {
      throw new ValidationError(
        `Pallet ${pallet.palletNumber} has no current location - use the putaway (assign) action instead.`
      );
    }
    if (pallet.currentLocationId === parsed.data.locationId) {
      throw new ValidationError(`Pallet ${pallet.palletNumber} is already at that location.`);
    }

    const [previousLocation] = await db
      .select()
      .from(locations)
      .where(eq(locations.id, pallet.currentLocationId));
    const [newLocation] = await db.select().from(locations).where(eq(locations.id, parsed.data.locationId));
    if (!newLocation) {
      throw new NotFoundError(`Location "${parsed.data.locationId}" not found.`);
    }

    const occupant = await loadOccupant(db, newLocation.currentPalletId);
    const newStatus = validateLocationAssignment(
      pallet,
      { ...newLocation, status: asLocationStatus(newLocation.status) },
      occupant
    );

    const today = new Date().toISOString().slice(0, 10);
    // This read pulls pallet_batches rows that none of the writes below
    // touch or depend on - it can run before the write block rather
    // than inside it, which turns this into a plain unconditional batch
    // (db.transaction() would crash on real D1 - no multi-statement
    // BEGIN/COMMIT, see PEN-044 / src/lib/db.ts).
    const batchRows = await db.select().from(palletBatches).where(eq(palletBatches.palletId, pallet.id));

    const stmts: UnrunStatement[] = [];
    if (previousLocation) {
      stmts.push(
        db
          .update(locations)
          .set({ status: "EMPTY", currentPalletId: null })
          .where(eq(locations.id, previousLocation.id))
      );
    }
    stmts.push(
      db.update(locations).set({ status: newStatus, currentPalletId: pallet.id }).where(eq(locations.id, newLocation.id)),
      db
        .update(pallets)
        .set({ currentLocationId: newLocation.id, currentWarehouseId: newLocation.warehouseId })
        .where(eq(pallets.id, pallet.id))
    );
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
          locationId: newLocation.id,
          warehouseId: newLocation.warehouseId,
          qtyChange: 0,
          qtyAfter: batchRow.cartonQty,
          weightChangeKg: 0,
          weightAfterKg: batchRow.weightKg,
          statusBefore: pallet.statusCode,
          statusAfter: pallet.statusCode,
          referenceType: "MANUAL_MOVE",
          referenceId: pallet.id,
          userId: currentUserId,
          remarks: parsed.data.reason,
        })
      );
    }
    await runAtomicBatch(db, [stmts[0], ...stmts.slice(1)]);

    const [updatedPallet] = await db.select().from(pallets).where(eq(pallets.id, pallet.id));
    const [updatedLocation] = await db.select().from(locations).where(eq(locations.id, newLocation.id));
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
