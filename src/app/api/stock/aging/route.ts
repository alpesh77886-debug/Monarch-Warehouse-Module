import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pallets, palletBatches, batches, materials, loadingSheets, loadingSheetPallets } from "../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { buildAgingByBatch, calculateFifoCompliance } from "@/lib/business-rules/fifo";
import { UnauthorizedError, ForbiddenError, AuthNotConfiguredError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError || err instanceof ForbiddenError || err instanceof AuthNotConfiguredError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

/**
 * FIFO Aging Report (TASK-013, SCREEN-013 - "Stock aging by batch, FIFO
 * compliance"). No dedicated "stock.aging" permission exists anywhere in
 * the real matrix; "Stock Aging (FIFO)" sits in the nav tree directly
 * alongside Stock Ledger and In-Out Summary (both gated on
 * stock.view_ledger/stock.view_summary) - gated on stock.view_ledger
 * here, the closest real sibling screen's own permission, not invented.
 */
export async function GET() {
  try {
    await requirePermission("stock.view_ledger");

    const db = getDb();

    // Aging by batch - every currently-OK pallet's batch(es), the same
    // dispatch-eligible pool the pick screen's own "oldest first" FIFO
    // select already draws from (assertDispatchEligible, loading-sheet.ts).
    const okPalletBatchRows = await db
      .select({
        materialId: pallets.materialId,
        materialCode: materials.code,
        batchId: batches.id,
        batchNumber: batches.batchNumber,
        productionDate: batches.productionDate,
        cartonQty: palletBatches.cartonQty,
      })
      .from(pallets)
      .innerJoin(palletBatches, eq(palletBatches.palletId, pallets.id))
      .innerJoin(batches, eq(palletBatches.batchId, batches.id))
      .innerJoin(materials, eq(pallets.materialId, materials.id))
      .where(eq(pallets.statusCode, "OK"));
    const agingByBatch = buildAgingByBatch(okPalletBatchRows);

    // FIFO compliance - every pick belonging to a DISPATCHED loading
    // sheet (the literal "% dispatches following FIFO" metric), by its
    // own real fifo_override_reason column.
    const dispatchedSheetIds = (
      await db.select({ id: loadingSheets.id }).from(loadingSheets).where(eq(loadingSheets.status, "DISPATCHED"))
    ).map((s) => s.id);
    const dispatchedPickReasons =
      dispatchedSheetIds.length === 0
        ? []
        : (
            await db
              .select({ fifoOverrideReason: loadingSheetPallets.fifoOverrideReason })
              .from(loadingSheetPallets)
              .where(inArray(loadingSheetPallets.loadingSheetId, dispatchedSheetIds))
          ).map((r) => r.fifoOverrideReason);
    const fifoCompliance = calculateFifoCompliance(dispatchedPickReasons);

    return NextResponse.json({ agingByBatch, fifoCompliance });
  } catch (err) {
    return errorResponse(err);
  }
}
