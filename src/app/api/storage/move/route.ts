import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { locations, pallets, materials } from "../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
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
 * location back to EMPTY as part of the same transaction. See the
 * putaway route's module comment for why no stock_ledger row is
 * written yet (PEN-024).
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("putaway.move_pallet");

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

    db.transaction((tx) => {
      if (previousLocation) {
        tx.update(locations)
          .set({ status: "EMPTY", currentPalletId: null })
          .where(eq(locations.id, previousLocation.id))
          .run();
      }
      tx.update(locations)
        .set({ status: newStatus, currentPalletId: pallet.id })
        .where(eq(locations.id, newLocation.id))
        .run();
      tx.update(pallets)
        .set({ currentLocationId: newLocation.id, currentWarehouseId: newLocation.warehouseId })
        .where(eq(pallets.id, pallet.id))
        .run();
    });

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
