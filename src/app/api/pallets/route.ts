import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pallets, materials } from "../../../../drizzle/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only list, joined with the material code for display - used by
// the putaway/move screens to populate a pallet picker. No create/edit
// route exists here: pallets are created by the Receiving Sheet flow
// (TASK-004), which remains blocked (PEN-014/PEN-017) - this route
// only reads pallets that already exist, however they got there
// (today: only test/E2E fixtures, since no pallet-creation UI exists).
export async function GET() {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: pallets.id,
        palletNumber: pallets.palletNumber,
        palletType: pallets.palletType,
        materialId: pallets.materialId,
        materialCode: materials.code,
        statusCode: pallets.statusCode,
        totalWeightKg: pallets.totalWeightKg,
        totalCartons: pallets.totalCartons,
        currentLocationId: pallets.currentLocationId,
        currentWarehouseId: pallets.currentWarehouseId,
      })
      .from(pallets)
      .innerJoin(materials, eq(pallets.materialId, materials.id))
      .orderBy(asc(pallets.palletNumber));
    return NextResponse.json({ pallets: rows });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
