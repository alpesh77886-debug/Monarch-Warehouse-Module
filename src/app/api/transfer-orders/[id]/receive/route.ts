import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb, changesOf, runAtomicBatch, type UnrunStatement } from "@/lib/db";
import { transferOrders, transferOrderPallets, pallets, stockLedger } from "../../../../../../drizzle/schema";
import { requireRole, requireCurrentUserId } from "@/lib/auth";
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
 * IN_TRANSIT -> RECEIVED (Flow 4 Step 5), gated
 * requireRole(["R01","R03"]) - reusing pallet-status.ts's own already-
 * contracted transfer_receive actor list directly, the same precedent as
 * Loading Sheet dispatch and Bulk repack, since the real permission
 * matrix has no "transfers.receive" string. Mirrors the dispatch route's
 * own NORMAL-vs-tagged split: a NORMAL pallet really transitions
 * IN_TRANSIT -> OK (real, contracted, writes TRANSFER_IN); a HOLD_TAG/
 * BULK_TAG pallet's own status is untouched (still HOLD or still BULK -
 * Flow 4 Step 5's own explicit rule: "If HOLD TAG: material enters
 * receiving warehouse with status HOLD... If BULK TAG: ... status BULK"),
 * with a real TRANSFER_IN ledger row still written directly. Every
 * pallet's current_warehouse_id moves to the destination warehouse -
 * it has now physically arrived; current_location_id stays null (needs
 * putaway again at the new warehouse, same as any newly-arrived pallet).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = await requireRole(["R01", "R03"]);
    const currentUserId = await requireCurrentUserId();

    const db = getDb();
    const [order] = await db.select().from(transferOrders).where(eq(transferOrders.id, params.id));
    if (!order) {
      throw new NotFoundError(`Transfer order "${params.id}" not found.`);
    }
    const nextStatus: TransferOrderStatus = nextTransferOrderStatus(order.status as TransferOrderStatus, "receive");

    const pickedPallets = await db
      .select({ pallet: pallets, line: transferOrderPallets })
      .from(transferOrderPallets)
      .innerJoin(pallets, eq(transferOrderPallets.palletId, pallets.id))
      .where(eq(transferOrderPallets.transferOrderId, params.id));

    const transferType = order.transferType as TransferType;
    const plans = pickedPallets.map(({ pallet, line }) => {
      if (transferType === "NORMAL") {
        return { pallet, line, transition: validatePalletStatusTransition(pallet.statusCode as PalletStatus, "OK", role) };
      }
      return { pallet, line, transition: null };
    });

    const now = new Date().toISOString();
    // db.transaction() would crash on real D1 (no multi-statement
    // BEGIN/COMMIT - see PEN-044 / src/lib/db.ts). The guarded UPDATE
    // below decides whether this receive is even allowed to proceed
    // (optimistic concurrency), so it runs alone first - a single
    // statement is already atomic - and only if it actually matched a
    // row do the per-pallet writes run, together, as one atomic batch.
    // Residual risk (PEN-045): a crash between these two calls could
    // leave the order marked RECEIVED with its pallets not yet moved -
    // narrower than, but not identical to, the single real ACID
    // transaction this replaced (D1 has no such primitive to fall back
    // to - see PEN-044).
    const guardResult = await db
      .update(transferOrders)
      .set({ status: nextStatus, receivedAt: now, receivedById: currentUserId })
      .where(and(eq(transferOrders.id, params.id), eq(transferOrders.status, order.status)))
      .run();
    const applied = changesOf(guardResult);
    if (applied === 0) {
      throw new ConflictError("This transfer order was changed by someone else - your receive action was not applied.");
    }

    const palletStmts = plans.flatMap(({ pallet, line, transition }) => {
      const ledgerEntry = transition
        ? describeLedgerEntry(transition)
        : {
            transactionType: "TRANSFER_IN" as const,
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
          locationId: null,
          warehouseId: order.destinationWarehouseId,
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
            statusCode: transition ? "OK" : pallet.statusCode,
            currentWarehouseId: order.destinationWarehouseId,
            currentLocationId: null,
          })
          .where(eq(pallets.id, pallet.id)),
      ];
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
