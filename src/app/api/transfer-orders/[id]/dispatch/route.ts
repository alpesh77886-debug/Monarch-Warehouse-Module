import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb, changesOf, runAtomicBatch, type UnrunStatement } from "@/lib/db";
import { transferOrders, transferOrderPallets, pallets, locations, stockLedger } from "../../../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { nextTransferOrderStatus, type TransferOrderStatus, type TransferType } from "@/lib/business-rules/transfer-order";
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
 * LOADED -> IN_TRANSIT (Flow 4 Step 3->4), gated "transfers.dispatch"
 * (R03/R09). For a NORMAL transfer, each pallet really transitions
 * OK -> IN_TRANSIT via pallet-status.ts's own already-contracted
 * transition (transfer_dispatch, actors [R03,R09] - the same two roles
 * transfers.dispatch already names, no conflict), writing a real
 * TRANSFER_OUT ledger row. For HOLD_TAG/BULK_TAG, no such pallet_status
 * transition exists anywhere in the locked workflow contract (only
 * OK<->IN_TRANSIT is defined) - see PEN-041 for the full reasoning - so
 * the pallet's own status_code deliberately does NOT change (a HOLD
 * pallet stays HOLD, a BULK pallet stays BULK throughout its transfer;
 * "in transit" is tracked at the transfer_order's own status instead,
 * joined through transfer_order_pallets), while a real TRANSFER_OUT
 * ledger row is still written directly for full INV-016 traceability.
 * Every pallet's location is freed either way - it is physically
 * leaving.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = await requirePermission("transfers.dispatch");
    const currentUserId = await requireCurrentUserId();

    const db = getDb();
    const [order] = await db.select().from(transferOrders).where(eq(transferOrders.id, params.id));
    if (!order) {
      throw new NotFoundError(`Transfer order "${params.id}" not found.`);
    }
    const nextStatus: TransferOrderStatus = nextTransferOrderStatus(order.status as TransferOrderStatus, "dispatch");

    const pickedPallets = await db
      .select({ pallet: pallets, line: transferOrderPallets })
      .from(transferOrderPallets)
      .innerJoin(pallets, eq(transferOrderPallets.palletId, pallets.id))
      .where(eq(transferOrderPallets.transferOrderId, params.id));
    if (pickedPallets.length === 0) {
      throw new ValidationError("Cannot dispatch a transfer order with no picked pallets.");
    }

    const transferType = order.transferType as TransferType;
    const plans = pickedPallets.map(({ pallet, line }) => {
      if (transferType === "NORMAL") {
        return { pallet, line, transition: validatePalletStatusTransition(pallet.statusCode as PalletStatus, "IN_TRANSIT", role) };
      }
      return { pallet, line, transition: null };
    });

    const now = new Date().toISOString();
    // db.transaction() would crash on real D1 (no multi-statement
    // BEGIN/COMMIT - see PEN-044 / src/lib/db.ts). The guarded UPDATE
    // below decides whether this dispatch is even allowed to proceed
    // (optimistic concurrency), so it runs alone first - a single
    // statement is already atomic - and only if it actually matched a
    // row do the per-pallet writes run, together, as one atomic batch.
    // Residual risk (PEN-045): a crash between these two calls could
    // leave the order marked IN_TRANSIT with its pallets not yet moved -
    // narrower than, but not identical to, the single real ACID
    // transaction this replaced (D1 has no such primitive to fall back
    // to - see PEN-044).
    const guardResult = await db
      .update(transferOrders)
      .set({ status: nextStatus, dispatchedAt: now })
      .where(and(eq(transferOrders.id, params.id), eq(transferOrders.status, order.status)))
      .run();
    const applied = changesOf(guardResult);
    if (applied === 0) {
      throw new ConflictError("This transfer order was changed by someone else - your dispatch action was not applied.");
    }

    const palletStmts = plans.flatMap(({ pallet, line, transition }) => {
      const ledgerEntry = transition
        ? describeLedgerEntry(transition)
        : {
            transactionType: "TRANSFER_OUT" as const,
            statusBefore: pallet.statusCode as PalletStatus,
            statusAfter: pallet.statusCode as PalletStatus,
          };

      const stmts: UnrunStatement[] = [
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
          qtyChange: 0,
          qtyAfter: pallet.totalCartons,
          weightChangeKg: 0,
          weightAfterKg: pallet.totalWeightKg,
          statusBefore: ledgerEntry.statusBefore,
          statusAfter: ledgerEntry.statusAfter,
          referenceType: "TRANSFER_ORDER",
          referenceId: order.id,
          userId: currentUserId,
        }),
        db
          .update(pallets)
          .set({
            statusCode: transition ? "IN_TRANSIT" : pallet.statusCode,
            currentLocationId: null,
          })
          .where(eq(pallets.id, pallet.id)),
      ];
      if (pallet.currentLocationId) {
        stmts.push(
          db
            .update(locations)
            .set({ status: "EMPTY", currentPalletId: null })
            .where(eq(locations.id, pallet.currentLocationId))
        );
      }
      return stmts;
    });
    if (palletStmts.length > 0) {
      await runAtomicBatch(db, [palletStmts[0], ...palletStmts.slice(1)]);
    }

    const [updated] = await db.select().from(transferOrders).where(eq(transferOrders.id, params.id));
    return NextResponse.json({ transferOrder: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
