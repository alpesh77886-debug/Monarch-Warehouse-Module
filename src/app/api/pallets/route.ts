import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
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
    // Loop 39: the two queries below are independent of each other (one
    // reads pallets+materials, the other pallet_batches+batches) - run
    // in parallel rather than sequentially, since this route's growing
    // real data set (and a 3rd, now-eliminated query - see below) had
    // started to measurably slow it down.
    const [rows, batchRows] = await Promise.all([
      db
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
        .orderBy(asc(pallets.palletNumber)),
      // Loop 38 / TASK-006: also gives the single batch a pallet
      // carries, when it carries exactly one (the common case - see
      // receiving-sheet-lock.ts). A mixed-batch pallet gets neither
      // field, rather than an arbitrary pick of one of its batches -
      // Hold Management's own data model (one batch_id per hold_record)
      // has no real way to place a hold on only part of a mixed pallet
      // anyway. distinctBatchCount (Loop 37 / PEN-025) is derived from
      // this same result below instead of its own separate grouped
      // query, now that both need the same underlying rows.
      db
        .select({
          palletId: palletBatches.palletId,
          batchId: palletBatches.batchId,
          batchNumber: batches.batchNumber,
          productionDate: batches.productionDate,
        })
        .from(palletBatches)
        .innerJoin(batches, eq(palletBatches.batchId, batches.id)),
    ]);

    const batchesByPalletId = new Map<string, { batchId: string; batchNumber: string; productionDate: string }[]>();
    for (const r of batchRows) {
      const list = batchesByPalletId.get(r.palletId) ?? [];
      list.push({ batchId: r.batchId, batchNumber: r.batchNumber, productionDate: r.productionDate });
      batchesByPalletId.set(r.palletId, list);
    }

    return NextResponse.json({
      pallets: rows.map((r) => {
        const list = batchesByPalletId.get(r.id) ?? [];
        const distinctBatchCount = new Set(list.map((b) => b.batchId)).size;
        const onlyBatch = list.length === 1 ? list[0] : null;
        return {
          ...r,
          distinctBatchCount,
          batchId: onlyBatch?.batchId ?? null,
          batchNumber: onlyBatch?.batchNumber ?? null,
          // Loop 41 / TASK-008: FIFO pick-list ordering (Flow 5 Step 2)
          // needs a real production date to sort by, not just the batch
          // number string - only meaningful for a single-batch pallet,
          // same reasoning as batchId/batchNumber above.
          productionDate: onlyBatch?.productionDate ?? null,
        };
      }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
