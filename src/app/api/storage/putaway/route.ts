import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { locations, pallets, materials } from "../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
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
 * No stock_ledger entry is written here - see PEN-024 in
 * docs/PENDING_ITEMS.md: stock_ledger.batch_id is NOT NULL, but the
 * pallet-to-batch relationship (the architecture blueprint's own
 * Pallet-Batch junction, ENTITY-004) has no table yet (PEN-014), so
 * there is no real batch_id to write - guessing one would put
 * permanently-wrong data in an append-only ledger, which is worse
 * than not writing the row yet.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("putaway.confirm_location");

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

    db.transaction((tx) => {
      tx.update(locations)
        .set({ status: newStatus, currentPalletId: pallet.id })
        .where(eq(locations.id, location.id))
        .run();
      // current_warehouse_id "derived from location" per the
      // architecture blueprint's own Pallet attribute table.
      tx.update(pallets)
        .set({ currentLocationId: location.id, currentWarehouseId: location.warehouseId })
        .where(eq(pallets.id, pallet.id))
        .run();
    });

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
