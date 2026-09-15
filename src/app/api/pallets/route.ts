import { NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pallets, materials, palletBatches, batches } from "../../../../drizzle/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only list, joined with the material code for display - used by
// the putaway/move screens to populate a pallet picker, by the
// Rack Map (src/lib/rack-map.ts) to decide the yellow "mix of batches"
// color, and by the Hold Management create form (TASK-006) to find
// QC_HOLD pallets of a given batch. No create/edit route exists here:
// pallets are created by the Receiving Sheet flow (TASK-004) or the
// putaway/move routes' own pallet_batches writes - this route only
// reads pallets that already exist.
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

    // Loop 38 / TASK-006: the single batch a pallet carries, when it
    // carries exactly one (the common case - see receiving-sheet-lock.ts).
    // A mixed-batch pallet gets neither field, rather than an arbitrary
    // pick of one of its batches - Hold Management's own data model
    // (one batch_id per hold_record) has no real way to place a hold on
    // only part of a mixed pallet anyway.
    const batchRows = await db
      .select({ palletId: palletBatches.palletId, batchId: palletBatches.batchId, batchNumber: batches.batchNumber })
      .from(palletBatches)
      .innerJoin(batches, eq(palletBatches.batchId, batches.id));
    const batchesByPalletId = new Map<string, { batchId: string; batchNumber: string }[]>();
    for (const r of batchRows) {
      const list = batchesByPalletId.get(r.palletId) ?? [];
      list.push({ batchId: r.batchId, batchNumber: r.batchNumber });
      batchesByPalletId.set(r.palletId, list);
    }

    return NextResponse.json({
      pallets: rows.map((r) => {
        const singleBatch = batchesByPalletId.get(r.id);
        const onlyBatch = singleBatch?.length === 1 ? singleBatch[0] : null;
        return {
          ...r,
          distinctBatchCount: batchCountByPalletId.get(r.id) ?? 0,
          batchId: onlyBatch?.batchId ?? null,
          batchNumber: onlyBatch?.batchNumber ?? null,
        };
      }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
