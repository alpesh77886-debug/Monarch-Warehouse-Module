import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { transferOrders } from "../../../../../../drizzle/schema";
import { requireRole } from "@/lib/auth";
import { nextTransferOrderStatus, type TransferOrderStatus } from "@/lib/business-rules/transfer-order";
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
 * RECEIVED -> COMPLETED (Flow 4 Step 6 - "Transfer document archived").
 * A pure status-closure step: Step 6's own bullets ("stock deducted...
 * ledger updated") are already the real, permanent effect the receive
 * route just wrote - nothing further mutates a pallet or writes another
 * ledger row here, only the transfer_order's own bookkeeping status
 * closes out. Same actor reasoning as receive (requireRole(["R01","R03"])
 * - no separate matrix permission exists for this step either).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole(["R01", "R03"]);

    const db = getDb();
    const [order] = await db.select().from(transferOrders).where(eq(transferOrders.id, params.id));
    if (!order) {
      throw new NotFoundError(`Transfer order "${params.id}" not found.`);
    }
    const nextStatus: TransferOrderStatus = nextTransferOrderStatus(order.status as TransferOrderStatus, "complete");

    const applied = db.transaction((tx) => {
      const result = tx
        .update(transferOrders)
        .set({ status: nextStatus })
        .where(and(eq(transferOrders.id, params.id), eq(transferOrders.status, order.status)))
        .run();
      return result.changes;
    });
    if (applied === 0) {
      throw new ConflictError("This transfer order was changed by someone else - your complete action was not applied.");
    }

    const [updated] = await db.select().from(transferOrders).where(eq(transferOrders.id, params.id));
    return NextResponse.json({ transferOrder: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
