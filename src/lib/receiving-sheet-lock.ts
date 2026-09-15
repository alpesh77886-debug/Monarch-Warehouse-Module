import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import {
  receivingSheets,
  receivingSheetPallets,
  batches,
  materials,
  warehouses,
  pallets,
  palletBatches,
  stockLedger,
} from "../../drizzle/schema";
import { ValidationError } from "./errors";
import { productionDateFromBatchNumber } from "./business-rules/receiving-sheet";

// The exact type of the `tx` callback parameter from `db.transaction((tx)
// => {...})` - narrower than `ReturnType<typeof getDb>` itself (no nested
// transaction/session methods), but this function is only ever called
// from inside such a callback, so that is the type it actually needs.
type DbOrTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Lock-time materialization (Flow 1 Step 3/4), run inside the same
 * transaction as the confirm action that brings a sheet to LOCKED.
 * Turns the sheet's own draft data into the real, permanent rows the
 * rest of the app depends on: a real `batches` row (find-or-create, by
 * the sheet's own batch_number - ENTITY-002 says production_date is
 * "derived from batch_number"), one real `pallets` row and one
 * `pallet_batches` row per pallet line on the sheet, and one append-only
 * `stock_ledger` INWARD row per pallet (closing the exact gap PEN-024
 * flagged: putaway/move had no real batch_id to write with, because
 * nothing in this app created a pallet-with-a-batch before now).
 *
 * Two things are decided here that no locked contract states explicitly
 * - both disclosed, not silently guessed (see PEN-034/035):
 *  1. New pallets are created with pallet_type = "PLASTIC". Neither the
 *     flow document's Flow 1 steps nor ENTITY-010's own attribute list
 *     capture a pallet type anywhere on the receiving sheet - but every
 *     pallet fixture already committed elsewhere in this repository
 *     (tests, seed data) uses PLASTIC, consistently, with no PLASTIC-vs-
 *     WOODEN decision point ever surfaced in the source material. Using
 *     that same, already-established default here is the smaller
 *     assumption than inventing a new UI field this loop was not asked
 *     to add.
 *  2. The pallets' current_warehouse_id is resolved from the sheet's own
 *     material's plant_origin (LIMBASI -> the one real, already-seeded
 *     LIMBASI-FG warehouse). Nothing in ENTITY-009 captures a warehouse
 *     on the receiving sheet itself - a material's plant is the only
 *     already-real signal available. If no active warehouse exists for
 *     that plant (true for SABARKANTHA today - no such warehouse is
 *     seeded, see PEN-008), this throws a clear, honest error rather
 *     than inventing a warehouse row or guessing which one to use.
 */
export function materializeReceivingSheetLock(db: DbOrTx, sheetId: string, confirmingUserId: string) {
  const [sheet] = db.select().from(receivingSheets).where(eq(receivingSheets.id, sheetId)).all();
  if (!sheet) {
    throw new ValidationError(`Receiving sheet "${sheetId}" not found during lock.`);
  }
  const rows = db
    .select()
    .from(receivingSheetPallets)
    .where(eq(receivingSheetPallets.receivingSheetId, sheetId))
    .all();
  if (rows.length === 0) {
    throw new ValidationError("Cannot lock a receiving sheet with no pallet rows.");
  }

  const [material] = db.select().from(materials).where(eq(materials.id, sheet.materialId)).all();
  if (!material) {
    throw new ValidationError(`Material "${sheet.materialId}" not found during lock.`);
  }

  const [warehouse] = db
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.plant, material.plantOrigin), eq(warehouses.active, 1)))
    .all();
  if (!warehouse) {
    throw new ValidationError(
      `No active warehouse is seeded for plant "${material.plantOrigin}" - cannot lock this sheet ` +
        `without a real warehouse to receive it into (see PEN-035).`
    );
  }

  let [batch] = db.select().from(batches).where(eq(batches.batchNumber, sheet.batchNumber)).all();
  if (!batch) {
    const batchId = crypto.randomUUID();
    db.insert(batches)
      .values({
        id: batchId,
        batchNumber: sheet.batchNumber,
        materialId: sheet.materialId,
        productionDate: productionDateFromBatchNumber(sheet.batchNumber),
        productionLine: sheet.line,
        shift: sheet.shift,
      })
      .run();
    [batch] = db.select().from(batches).where(eq(batches.id, batchId)).all();
  } else if (batch.materialId !== sheet.materialId) {
    throw new ValidationError(
      `Batch "${sheet.batchNumber}" already exists for a different material - cannot reuse it here.`
    );
  }

  let totalQty = 0;
  let totalWeightKg = 0;

  for (const row of rows) {
    const weightKg = row.qty * material.uomKgPerCarton;
    const palletId = crypto.randomUUID();
    db.insert(pallets)
      .values({
        id: palletId,
        palletNumber: row.palletNumber,
        palletType: "PLASTIC",
        materialId: sheet.materialId,
        statusCode: sheet.defaultPalletStatus,
        totalWeightKg: weightKg,
        totalCartons: row.qty,
        currentWarehouseId: warehouse.id,
        createdBy: confirmingUserId,
      })
      .run();

    db.insert(palletBatches)
      .values({
        id: crypto.randomUUID(),
        palletId,
        batchId: batch.id,
        cartonQty: row.qty,
        weightKg,
      })
      .run();

    db.insert(stockLedger)
      .values({
        id: crypto.randomUUID(),
        date: sheet.date,
        shift: sheet.shift,
        transactionType: "INWARD",
        materialId: sheet.materialId,
        batchId: batch.id,
        palletId,
        locationId: null,
        warehouseId: warehouse.id,
        qtyChange: row.qty,
        qtyAfter: row.qty,
        weightChangeKg: weightKg,
        weightAfterKg: weightKg,
        statusBefore: null,
        statusAfter: sheet.defaultPalletStatus,
        referenceType: "RECEIVING_SHEET",
        referenceId: sheet.id,
        userId: confirmingUserId,
      })
      .run();

    totalQty += row.qty;
    totalWeightKg += weightKg;
  }

  // Does NOT update the receiving_sheets row itself - the caller folds
  // totalQty/totalBoxes into the same single UPDATE that sets
  // status='LOCKED', because the receiving_sheets_locked_immutable
  // trigger (INV-008) aborts any UPDATE once OLD.status is already
  // 'LOCKED', so a second, later write here would fail.
  return { totalQty, totalBoxes: rows.length, totalWeightKg, warehouseId: warehouse.id, batchId: batch.id };
}
