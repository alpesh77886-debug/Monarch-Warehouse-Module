import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pallets, materials, palletBatches, batches, receivingSheets } from "../../../../drizzle/schema";
import { bulkAgeDays, bulkAgeBucket } from "@/lib/business-rules/bulk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bulk stock dashboard + packing team queue (SCREEN-008, TASK-007) -
 * one list serves both IN SCOPE bullets, since neither the flow document
 * nor the architecture blueprint describes them as different data views
 * (both are "BULK-status pallets, oldest first" - the reference
 * mockup's own "FIFO on bulk age" heading). Not gated - same PEN-022
 * reasoning already applied elsewhere: R01 (the warehouse-side actor for
 * the BULK -> QC_HOLD transition itself, per pallet-status.ts) has no
 * "bulk.view"-style grant anywhere in the real permission matrix (only
 * R06/R08 do), so gating this plain read would make the screen unusable
 * to the very role that has to act on it. The repack action itself
 * (POST /api/bulk-pallets/[id]/repack) stays fully gated.
 */
export async function GET() {
  try {
    const db = getDb();
    const bulkPalletRows = await db
      .select({
        id: pallets.id,
        palletNumber: pallets.palletNumber,
        materialId: pallets.materialId,
        materialCode: materials.code,
        materialDescription: materials.description,
        totalWeightKg: pallets.totalWeightKg,
        totalCartons: pallets.totalCartons,
        currentLocationId: pallets.currentLocationId,
        currentWarehouseId: pallets.currentWarehouseId,
        createdAt: pallets.createdAt,
      })
      .from(pallets)
      .innerJoin(materials, eq(pallets.materialId, materials.id))
      .where(eq(pallets.statusCode, "BULK"));

    const batchRows = await db
      .select({ palletId: palletBatches.palletId, batchNumber: batches.batchNumber })
      .from(palletBatches)
      .innerJoin(batches, eq(palletBatches.batchId, batches.id));
    const batchByPalletId = new Map(batchRows.map((r) => [r.palletId, r.batchNumber]));

    // Best-effort lookup back to the originating BULK receiving sheet,
    // for its bulk_reason - matched on (material, batch_number), since
    // pallets carries no receiving_sheet_id (ENTITY-003 has no such
    // field, and receiving_sheet_pallets - ENTITY-010 - has no pallet_id
    // either, only the draft-time pallet_number string). Ambiguous only
    // if the exact same material+batch_number was ever received as BULK
    // across more than one shift (NS-012 allows that combination), a
    // real but rare edge case - disclosed here, not silently assumed
    // impossible; this field is informational/display-only, nothing in
    // this route gates on it.
    const bulkSheets = await db
      .select({ materialId: receivingSheets.materialId, batchNumber: receivingSheets.batchNumber, bulkReason: receivingSheets.bulkReason })
      .from(receivingSheets)
      .where(eq(receivingSheets.defaultPalletStatus, "BULK"));
    const reasonByMaterialBatch = new Map(bulkSheets.map((r) => [`${r.materialId}:${r.batchNumber}`, r.bulkReason]));

    return NextResponse.json({
      bulkPallets: bulkPalletRows
        .map((p) => {
          const batchNumber = batchByPalletId.get(p.id) ?? null;
          const ageDays = bulkAgeDays(p.createdAt);
          return {
            ...p,
            batchNumber,
            bulkReason: batchNumber ? (reasonByMaterialBatch.get(`${p.materialId}:${batchNumber}`) ?? null) : null,
            ageDays,
            ageBucket: bulkAgeBucket(ageDays),
          };
        })
        .sort((a, b) => b.ageDays - a.ageDays),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
