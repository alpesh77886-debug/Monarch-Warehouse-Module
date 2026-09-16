import { eq, and } from "drizzle-orm";
import { getDb, type UnrunStatement } from "./db";
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

/**
 * Lock-time materialization plan (Flow 1 Step 3/4) - Loop 46 rewrite,
 * see PEN-044: this used to run its writes directly inside the same
 * `db.transaction((tx) => {...})` as the confirm action's closing
 * UPDATE, which Cloudflare D1 cannot support at all (no multi-statement
 * BEGIN/COMMIT). Every value this function's writes need - the batch to
 * reuse or create, each new pallet's id and computed weight, the
 * aggregate totals - is fully decided by data already read here, none of
 * it depends on a write actually having happened yet. So instead of
 * writing anything, this now does only the reads/validation and returns
 * an unrun statement plan (still built off the caller's own `db`, never
 * executed here) plus the aggregates, for the caller to run atomically
 * together with its own guarded closing UPDATE via `runAtomicBatch` -
 * see confirm-warehouse/confirm-packing's route handlers. This also
 * closes a latent double-materialization race the old code had: because
 * the old code always ran these writes before checking whether the
 * closing UPDATE's optimistic-concurrency guard actually matched a row,
 * a lost race could leave orphaned pallets/batches/ledger rows behind
 * even though the sheet was reported as not confirmed. The new
 * plan-then-batch-with-the-guard-first shape given to callers makes that
 * no longer possible: the materialization statements only run at all
 * once the guard is confirmed to have matched.
 *
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
export function planReceivingSheetLock(
  database: ReturnType<typeof getDb>,
  sheetId: string,
  confirmingUserId: string
) {
  const [sheet] = database.select().from(receivingSheets).where(eq(receivingSheets.id, sheetId)).all();
  if (!sheet) {
    throw new ValidationError(`Receiving sheet "${sheetId}" not found during lock.`);
  }
  const rows = database
    .select()
    .from(receivingSheetPallets)
    .where(eq(receivingSheetPallets.receivingSheetId, sheetId))
    .all();
  if (rows.length === 0) {
    throw new ValidationError("Cannot lock a receiving sheet with no pallet rows.");
  }

  const [material] = database.select().from(materials).where(eq(materials.id, sheet.materialId)).all();
  if (!material) {
    throw new ValidationError(`Material "${sheet.materialId}" not found during lock.`);
  }

  const [warehouse] = database
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

  const [existingBatch] = database.select().from(batches).where(eq(batches.batchNumber, sheet.batchNumber)).all();
  let batchId: string;
  const statements: UnrunStatement[] = [];
  if (!existingBatch) {
    batchId = crypto.randomUUID();
    statements.push(
      database.insert(batches).values({
        id: batchId,
        batchNumber: sheet.batchNumber,
        materialId: sheet.materialId,
        productionDate: productionDateFromBatchNumber(sheet.batchNumber),
        productionLine: sheet.line,
        shift: sheet.shift,
      })
    );
  } else if (existingBatch.materialId !== sheet.materialId) {
    throw new ValidationError(
      `Batch "${sheet.batchNumber}" already exists for a different material - cannot reuse it here.`
    );
  } else {
    batchId = existingBatch.id;
  }

  let totalQty = 0;
  let totalWeightKg = 0;

  for (const row of rows) {
    const weightKg = row.qty * material.uomKgPerCarton;
    const palletId = crypto.randomUUID();
    statements.push(
      database.insert(pallets).values({
        id: palletId,
        palletNumber: row.palletNumber,
        palletType: "PLASTIC",
        materialId: sheet.materialId,
        statusCode: sheet.defaultPalletStatus,
        totalWeightKg: weightKg,
        totalCartons: row.qty,
        currentWarehouseId: warehouse.id,
        createdBy: confirmingUserId,
      }),
      database.insert(palletBatches).values({
        id: crypto.randomUUID(),
        palletId,
        batchId,
        cartonQty: row.qty,
        weightKg,
      }),
      database.insert(stockLedger).values({
        id: crypto.randomUUID(),
        date: sheet.date,
        shift: sheet.shift,
        transactionType: "INWARD",
        materialId: sheet.materialId,
        batchId,
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
    );

    totalQty += row.qty;
    totalWeightKg += weightKg;
  }

  // Deliberately does NOT touch the receiving_sheets row itself - the
  // caller folds totalQty/totalBoxes into its own guarded closing UPDATE
  // that sets status='LOCKED', which must run and be confirmed to have
  // matched BEFORE these `statements` are run at all (see this
  // function's own doc comment above).
  return {
    statements,
    totalQty,
    totalBoxes: rows.length,
    totalWeightKg,
    warehouseId: warehouse.id,
    batchId,
  };
}
