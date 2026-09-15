import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
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
    const applied = db.transaction((tx) => {
      const result = tx
        .update(loadingSheets)
        .set({ status: nextStatus })
        .where(and(eq(loadingSheets.id, params.id), eq(loadingSheets.status, sheet.status)))
        .run();
      if (result.changes === 0) return 0;

      for (const { pallet, line, transition } of transitions) {
        if (pallet.currentLocationId) {
          tx.update(locations)
            .set({ status: "EMPTY", currentPalletId: null })
            .where(eq(locations.id, pallet.currentLocationId))
            .run();
        }

        const ledgerEntry = describeLedgerEntry(transition);
        tx.insert(stockLedger)
          .values({
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
          })
          .run();

        tx.update(pallets)
          .set({ statusCode: "DISPATCHED", currentLocationId: null })
          .where(eq(pallets.id, pallet.id))
          .run();
      }
      return result.changes;
    });
    if (applied === 0) {
      throw new ConflictError("This loading sheet was changed by someone else - your dispatch action was not applied.");
    }

    const [updated] = await db.select().from(loadingSheets).where(eq(loadingSheets.id, params.id));
    return NextResponse.json({ loadingSheet: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
