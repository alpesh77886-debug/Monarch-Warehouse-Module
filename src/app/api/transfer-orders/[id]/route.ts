import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { transferOrders, transferOrderPallets, pallets, materials, batches, warehouses } from "../../../../../drizzle/schema";
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

// Not gated - see the list route's own comment (PEN-022 precedent).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb();
    const [order] = await db.select().from(transferOrders).where(eq(transferOrders.id, params.id));
    if (!order) {
      throw new NotFoundError(`Transfer order "${params.id}" not found.`);
    }

    const [sourceWarehouse] = await db.select().from(warehouses).where(eq(warehouses.id, order.sourceWarehouseId));
    const [destWarehouse] = await db.select().from(warehouses).where(eq(warehouses.id, order.destinationWarehouseId));

    const pickedPallets = await db
      .select({
        id: transferOrderPallets.id,
        palletId: transferOrderPallets.palletId,
        palletNumber: pallets.palletNumber,
        materialCode: materials.code,
        materialDescription: materials.description,
        batchNumber: batches.batchNumber,
        cartonQty: transferOrderPallets.cartonQty,
        weightKg: transferOrderPallets.weightKg,
      })
      .from(transferOrderPallets)
      .innerJoin(pallets, eq(transferOrderPallets.palletId, pallets.id))
      .innerJoin(materials, eq(transferOrderPallets.materialId, materials.id))
      .innerJoin(batches, eq(transferOrderPallets.batchId, batches.id))
      .where(eq(transferOrderPallets.transferOrderId, params.id));

    return NextResponse.json({
      transferOrder: {
        ...order,
        sourceWarehouseCode: sourceWarehouse?.code ?? null,
        destinationWarehouseCode: destWarehouse?.code ?? null,
        destinationWarehouseType: destWarehouse?.type ?? null,
      },
      pallets: pickedPallets,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
