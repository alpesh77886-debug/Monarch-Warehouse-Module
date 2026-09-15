import { NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pallets, materials, palletBatches } from "../../../../drizzle/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only list, joined with the material code for display - used by
// the putaway/move screens to populate a pallet picker, and by the
// Rack Map (src/lib/rack-map.ts) to decide the yellow "mix of batches"
// color. No create/edit route exists here: pallets are created by the
// Receiving Sheet flow (TASK-004) or the putaway/move routes' own
// pallet_batches writes - this route only reads pallets that already
// exist.
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

    // Loop 37 / PEN-025: one grouped query for every pallet's distinct
    // batch count, rather than N+1 queries per row.
    const batchCounts = await db
      .select({
        palletId: palletBatches.palletId,
        distinctBatchCount: sql<number>`count(distinct ${palletBatches.batchId})`,
      })
      .from(palletBatches)
      .groupBy(palletBatches.palletId);
    const batchCountByPalletId = new Map(batchCounts.map((r) => [r.palletId, r.distinctBatchCount]));

    return NextResponse.json({
      pallets: rows.map((r) => ({ ...r, distinctBatchCount: batchCountByPalletId.get(r.id) ?? 0 })),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
