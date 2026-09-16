import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb, changesOf, runAtomicBatch, type UnrunStatement } from "@/lib/db";
import { loadingSheets, loadingSheetPallets, pallets, locations, stockLedger } from "../../../../../../drizzle/schema";
import { requireRole, requireCurrentUserId } from "@/lib/auth";
import { nextLoadingSheetStatus, type LoadingSheetStatus } from "@/lib/business-rules/loading-sheet";
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
 * GATE_PASSED -> DISPATCHED (Flow 5 Step 6, "Post-Dispatch": stock
 * deducted, stock ledger updated). No "loading_sheet.dispatch" (or
 * similar) permission string exists in the real permission matrix -
 * this is the same OK -> DISPATCHED pallet_status transition
 * pallet-status.ts (Loop 17) already contracts, with its own actor list
 * (R03/R09/R10), reused directly via requireRole rather than inventing
 * a new permission string. Writes one real, append-only DISPATCH
 * stock_ledger row per pallet and frees each pallet's rack location
 * (a dispatched pallet is no longer physically in the warehouse).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = await requireRole(["R03", "R09", "R10"]);
    const currentUserId = await requireCurrentUserId();

    const db = getDb();
    const [sheet] = await db.select().from(loadingSheets).where(eq(loadingSheets.id, params.id));
    if (!sheet) {
      throw new NotFoundError(`Loading sheet "${params.id}" not found.`);
    }
    const nextStatus: LoadingSheetStatus = nextLoadingSheetStatus(sheet.status as LoadingSheetStatus, "dispatch");

    const pickedPallets = await db
      .select({ pallet: pallets, line: loadingSheetPallets })
      .from(loadingSheetPallets)
      .innerJoin(pallets, eq(loadingSheetPallets.palletId, pallets.id))
      .where(eq(loadingSheetPallets.loadingSheetId, params.id));

    const transitions = pickedPallets.map(({ pallet, line }) => ({
      pallet,
      line,
      transition: validatePalletStatusTransition(pallet.statusCode as PalletStatus, "DISPATCHED", role),
    }));

    const now = new Date().toISOString();
    // db.transaction() would crash on real D1 (no multi-statement
    // BEGIN/COMMIT - see PEN-044 / src/lib/db.ts). The guarded UPDATE
    // below decides whether this dispatch is even allowed to proceed
    // (optimistic concurrency), so it runs alone first - a single
    // statement is already atomic - and only if it actually matched a
    // row do the per-pallet writes run, together, as one atomic batch.
    // Residual risk (PEN-045): a crash between these two calls could
    // leave the loading sheet marked DISPATCHED with its pallets not yet
    // moved - narrower than, but not identical to, the single real ACID
    // transaction this replaced (D1 has no such primitive to fall back
    // to - see PEN-044).
    const guardResult = await db
      .update(loadingSheets)
      .set({ status: nextStatus })
      .where(and(eq(loadingSheets.id, params.id), eq(loadingSheets.status, sheet.status)))
      .run();
    const applied = changesOf(guardResult);
    if (applied === 0) {
      throw new ConflictError("This loading sheet was changed by someone else - your dispatch action was not applied.");
    }

    const palletStmts = transitions.flatMap(({ pallet, line, transition }) => {
      const ledgerEntry = describeLedgerEntry(transition);
      const stmts: UnrunStatement[] = [];
      if (pallet.currentLocationId) {
        stmts.push(
          db
            .update(locations)
            .set({ status: "EMPTY", currentPalletId: null })
            .where(eq(locations.id, pallet.currentLocationId))
        );
      }
      stmts.push(
        db.insert(stockLedger).values({
          id: crypto.randomUUID(),
          date: now.slice(0, 10),
          shift: "NA",
          transactionType: ledgerEntry.transactionType,
          materialId: pallet.materialId,
          batchId: line.batchId,
          palletId: pallet.id,
          locationId: pallet.currentLocationId,
          warehouseId: pallet.currentWarehouseId,
          qtyChange: -pallet.totalCartons,
          qtyAfter: 0,
          weightChangeKg: -pallet.totalWeightKg,
          weightAfterKg: 0,
          statusBefore: ledgerEntry.statusBefore,
          statusAfter: ledgerEntry.statusAfter,
          referenceType: "LOADING_SHEET",
          referenceId: sheet.id,
          userId: currentUserId,
        }),
        db
          .update(pallets)
          .set({ statusCode: "DISPATCHED", currentLocationId: null })
          .where(eq(pallets.id, pallet.id))
      );
      return stmts;
    });
    if (palletStmts.length > 0) {
      await runAtomicBatch(db, [palletStmts[0], ...palletStmts.slice(1)]);
    }

    const [updated] = await db.select().from(loadingSheets).where(eq(loadingSheets.id, params.id));
    return NextResponse.json({ loadingSheet: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
