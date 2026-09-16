import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, runAtomicBatch, type UnrunStatement } from "@/lib/db";
import { transferOrders, transferOrderPallets, pallets, palletBatches } from "../../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { transferOrderPickSchema } from "@/lib/validations/transfer-order";
import {
  assertPalletEligibleForTransferType,
  nextTransferOrderStatus,
  type TransferOrderStatus,
  type TransferType,
} from "@/lib/business-rules/transfer-order";
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
 * Pick a pallet onto a transfer order (Flow 4 Step 2), gated
 * "transfers.create" (R03/R09 - the matrix has no separate pick
 * permission, unlike Loading Sheet's own dedicated .load grant). Enforces
 * that the pallet's status matches the transfer's own declared type
 * (NORMAL/HOLD_TAG/BULK_TAG -> OK/HOLD/BULK respectively). Auto-advances
 * DRAFT -> PICKED on the first pick, same pattern as Loading Sheet.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("transfers.create");

    const body = await request.json();
    const parsed = transferOrderPickSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [order] = await db.select().from(transferOrders).where(eq(transferOrders.id, params.id));
    if (!order) {
      throw new NotFoundError(`Transfer order "${params.id}" not found.`);
    }
    if (order.status !== "DRAFT" && order.status !== "PICKED") {
      throw new ValidationError(`Cannot pick pallets onto a transfer order in status ${order.status}.`);
    }

    const [pallet] = await db.select().from(pallets).where(eq(pallets.id, parsed.data.palletId));
    if (!pallet) {
      throw new NotFoundError(`Pallet "${parsed.data.palletId}" not found.`);
    }
    assertPalletEligibleForTransferType(pallet.statusCode, order.transferType as TransferType);
    if (pallet.currentWarehouseId !== order.sourceWarehouseId) {
      throw new ValidationError("Pallet is not in the transfer order's own source warehouse.");
    }

    const [palletBatchRow] = await db.select().from(palletBatches).where(eq(palletBatches.palletId, pallet.id));
    if (!palletBatchRow) {
      throw new ValidationError(`Pallet ${pallet.palletNumber} has no known batch - cannot be picked for transfer.`);
    }

    const nextStatus: TransferOrderStatus =
      order.status === "DRAFT" ? nextTransferOrderStatus("DRAFT", "pick") : (order.status as TransferOrderStatus);

    const rowId = crypto.randomUUID();
    // db.transaction() would crash on real D1 (no multi-statement
    // BEGIN/COMMIT - see PEN-044 / src/lib/db.ts). Neither statement's
    // value depends on the other's result (the DRAFT->PICKED bump is
    // decided from `order.status` read before this point, plain
    // JS array-building, not a guard on a write result), so a plain
    // atomic batch is the correct replacement.
    const stmts: UnrunStatement[] = [];
    if (order.status === "DRAFT") {
      stmts.push(db.update(transferOrders).set({ status: nextStatus }).where(eq(transferOrders.id, params.id)));
    }
    stmts.push(
      db.insert(transferOrderPallets).values({
        id: rowId,
        transferOrderId: params.id,
        palletId: pallet.id,
        materialId: pallet.materialId,
        batchId: palletBatchRow.batchId,
        cartonQty: pallet.totalCartons,
        weightKg: pallet.totalWeightKg,
      })
    );
    try {
      await runAtomicBatch(db, [stmts[0], ...stmts.slice(1)]);
    } catch (e) {
      if (e instanceof Error && /UNIQUE constraint failed/i.test(e.message)) {
        throw new ConflictError("This pallet is already picked onto this transfer order.");
      }
      throw e;
    }

    const [created] = await db.select().from(transferOrderPallets).where(eq(transferOrderPallets.id, rowId));
    return NextResponse.json({ pallet: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
