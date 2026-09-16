import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb, runAtomicBatch, type UnrunStatement } from "@/lib/db";
import { pallets, palletBatches, locations, stockLedger, receivingSheets } from "../../../../../../drizzle/schema";
import { requireRole, requireCurrentUserId } from "@/lib/auth";
import { bulkRepackCreateSchema } from "@/lib/validations/receiving-sheet";
import { validateBatchNumberFormat, receivingSheetNumberPrefix } from "@/lib/business-rules/receiving-sheet";
import { validatePalletStatusTransition, describeLedgerEntry, type PalletStatus } from "@/lib/workflows/pallet-status";
import {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthNotConfiguredError,
} from "@/lib/errors";

export const runtime = "nodejs";

function errorResponse(err: unknown) {
  if (
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError ||
    err instanceof ValidationError ||
    err instanceof NotFoundError ||
    err instanceof ConflictError ||
    err instanceof AuthNotConfiguredError
  ) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

/**
 * Repack receipt (Flow 3 Step 7, TASK-007's "Bulk -> Packing transfer
 * record" and "Repack receipt: new receiving sheet linked to original
 * bulk" bullets, combined into one atomic action - see PEN-040 in
 * docs/PENDING_ITEMS.md for why they are not two separate steps). Gated
 * requireRole(["R01","R06"]), reusing pallet-status.ts's own already-
 * contracted BULK -> QC_HOLD actor list directly (Loop 17's
 * "bulk_repacked" transition) - the same precedent as the Loading
 * Sheet dispatch route, since no single "bulk.*" permission string in
 * the real matrix covers both actors (R06 has "bulk.receive_for_repack";
 * R01 has none).
 *
 * In one transaction: (1) transitions the ORIGINAL bulk pallet
 * BULK -> QC_HOLD, writes the real BULK_RECEIVE stock_ledger row
 * (referenceType MANUAL_MOVE, referenceId = the pallet itself - same
 * convention already used by putaway/move for this reference type), and
 * frees its rack location (its cartons no longer physically exist as
 * this pallet, the same physical reality DISPATCHED already models);
 * (2) creates a new DRAFT receiving_sheets row, default_pallet_status
 * forced to QC_HOLD (the flow document's own "new QC hold" - not a
 * caller-supplied choice), original_bulk_pallet_id set for traceability.
 * The new sheet starts empty of pallet rows - the operator adds them and
 * confirms/locks it through the existing, already-built Receiving Sheet
 * flow ("goes through FG Receiving Sheet flow again", per the flow
 * document), not reinvented here.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = await requireRole(["R01", "R06"]);
    const currentUserId = await requireCurrentUserId();

    const body = await request.json();
    const parsed = bulkRepackCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }
    validateBatchNumberFormat(parsed.data.batchNumber);

    const db = getDb();
    const [pallet] = await db.select().from(pallets).where(eq(pallets.id, params.id));
    if (!pallet) {
      throw new NotFoundError(`Pallet "${params.id}" not found.`);
    }

    const transition = validatePalletStatusTransition(pallet.statusCode as PalletStatus, "QC_HOLD", role);

    const [palletBatchRow] = await db.select().from(palletBatches).where(eq(palletBatches.palletId, pallet.id));
    if (!palletBatchRow) {
      throw new ValidationError(`Pallet ${pallet.palletNumber} has no known batch - cannot record its repack.`);
    }

    // NS-012's own duplicate check, reused verbatim for the new sheet.
    const [dup] = await db
      .select({ id: receivingSheets.id, sheetNumber: receivingSheets.sheetNumber })
      .from(receivingSheets)
      .where(
        and(
          eq(receivingSheets.materialId, pallet.materialId),
          eq(receivingSheets.batchNumber, parsed.data.batchNumber),
          eq(receivingSheets.shift, parsed.data.shift)
        )
      );
    if (dup) {
      throw new ConflictError(
        `Sheet already exists for this material, batch, and shift (${dup.sheetNumber}).`
      );
    }

    const prefix = receivingSheetNumberPrefix(parsed.data.date);
    const existingNumbers = await db.select({ sheetNumber: receivingSheets.sheetNumber }).from(receivingSheets);
    const todayCount = existingNumbers.filter((r) => r.sheetNumber.startsWith(prefix)).length;
    const sheetNumber = `${prefix}${String(todayCount + 1).padStart(3, "0")}`;

    const newSheetId = crypto.randomUUID();
    const now = new Date().toISOString();
    // db.transaction() would crash on real D1 (no multi-statement
    // BEGIN/COMMIT - see PEN-044 / src/lib/db.ts). None of these writes'
    // values depend on another statement's result, so a plain atomic
    // batch is the correct replacement.
    const ledgerEntry = describeLedgerEntry(transition);
    const stmts: UnrunStatement[] = [
      db.insert(stockLedger).values({
        id: crypto.randomUUID(),
        date: now.slice(0, 10),
        shift: "NA",
        transactionType: ledgerEntry.transactionType,
        materialId: pallet.materialId,
        batchId: palletBatchRow.batchId,
        palletId: pallet.id,
        locationId: pallet.currentLocationId,
        warehouseId: pallet.currentWarehouseId,
        qtyChange: 0,
        qtyAfter: pallet.totalCartons,
        weightChangeKg: 0,
        weightAfterKg: pallet.totalWeightKg,
        statusBefore: ledgerEntry.statusBefore,
        statusAfter: ledgerEntry.statusAfter,
        referenceType: "MANUAL_MOVE",
        referenceId: pallet.id,
        userId: currentUserId,
      }),
    ];

    if (pallet.currentLocationId) {
      stmts.push(
        db
          .update(locations)
          .set({ status: "EMPTY", currentPalletId: null })
          .where(eq(locations.id, pallet.currentLocationId))
      );
    }

    stmts.push(
      db.update(pallets).set({ statusCode: "QC_HOLD", currentLocationId: null }).where(eq(pallets.id, pallet.id)),
      db.insert(receivingSheets).values({
        id: newSheetId,
        sheetNumber,
        date: parsed.data.date,
        shift: parsed.data.shift,
        line: parsed.data.line,
        materialId: pallet.materialId,
        batchNumber: parsed.data.batchNumber,
        defaultPalletStatus: "QC_HOLD",
        originalBulkPalletId: pallet.id,
        status: "DRAFT",
      })
    );

    await runAtomicBatch(db, [stmts[0], ...stmts.slice(1)]);

    const [createdSheet] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, newSheetId));
    const [updatedPallet] = await db.select().from(pallets).where(eq(pallets.id, pallet.id));
    return NextResponse.json({ receivingSheet: createdSheet, bulkPallet: updatedPallet }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
