import { NextRequest, NextResponse } from "next/server";
import { eq, and, count } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { transferOrders, transferOrderPallets } from "../../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { transferOrderLoadSchema } from "@/lib/validations/transfer-order";
import { assertReadyToLoad, nextTransferOrderStatus, type TransferOrderStatus } from "@/lib/business-rules/transfer-order";
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
 * PICKED -> LOADED (Flow 4 Step 3 - vehicle number/driver/transporter
 * recorded), gated "transfers.create" (same reasoning as the pick
 * route - no separate matrix permission exists for this step).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("transfers.create");

    const body = await request.json();
    const parsed = transferOrderLoadSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [order] = await db.select().from(transferOrders).where(eq(transferOrders.id, params.id));
    if (!order) {
      throw new NotFoundError(`Transfer order "${params.id}" not found.`);
    }
    const nextStatus: TransferOrderStatus = nextTransferOrderStatus(order.status as TransferOrderStatus, "load");

    const [{ pickedCount }] = await db
      .select({ pickedCount: count() })
      .from(transferOrderPallets)
      .where(eq(transferOrderPallets.transferOrderId, params.id));
    if (pickedCount === 0) {
      throw new ValidationError("Pick at least one pallet before loading.");
    }

    assertReadyToLoad({ vehicleNumber: parsed.data.vehicleNumber, driverName: parsed.data.driverName });

    const applied = db.transaction((tx) => {
      const result = tx
        .update(transferOrders)
        .set({
          status: nextStatus,
          vehicleNumber: parsed.data.vehicleNumber,
          driverName: parsed.data.driverName,
          transporter: parsed.data.transporter ?? null,
          temperatureC: parsed.data.temperatureC ?? null,
          lrNumber: parsed.data.lrNumber ?? null,
        })
        .where(and(eq(transferOrders.id, params.id), eq(transferOrders.status, order.status)))
        .run();
      return result.changes;
    });
    if (applied === 0) {
      throw new ConflictError("This transfer order was changed by someone else - your load action was not applied.");
    }

    const [updated] = await db.select().from(transferOrders).where(eq(transferOrders.id, params.id));
    return NextResponse.json({ transferOrder: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
