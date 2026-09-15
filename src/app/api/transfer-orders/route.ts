import { NextRequest, NextResponse } from "next/server";
import { eq, desc, count, sum } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { transferOrders, transferOrderPallets, warehouses } from "../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { transferOrderCreateSchema } from "@/lib/validations/transfer-order";
import { transferOrderNumberPrefix } from "@/lib/business-rules/transfer-order";
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
 * Transfer Order list (SCREEN-007, TASK-009). Not gated - same PEN-022
 * precedent already applied to Receiving/Loading Sheet: no role in the
 * real permission matrix has an explicit "transfers.view" grant at all
 * (only .create/.dispatch exist), so gating the plain read would make
 * this screen unreadable to its own creators in Clerk stub mode.
 */
export async function GET() {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: transferOrders.id,
        transferNumber: transferOrders.transferNumber,
        sourceWarehouseId: transferOrders.sourceWarehouseId,
        sourceWarehouseCode: warehouses.code,
        destinationWarehouseId: transferOrders.destinationWarehouseId,
        transferType: transferOrders.transferType,
        vehicleNumber: transferOrders.vehicleNumber,
        status: transferOrders.status,
        createdAt: transferOrders.createdAt,
      })
      .from(transferOrders)
      .innerJoin(warehouses, eq(transferOrders.sourceWarehouseId, warehouses.id))
      .orderBy(desc(transferOrders.createdAt));

    const destWarehouses = await db.select({ id: warehouses.id, code: warehouses.code, type: warehouses.type }).from(warehouses);
    const destById = new Map(destWarehouses.map((w) => [w.id, w]));

    const aggregates = await db
      .select({
        transferOrderId: transferOrderPallets.transferOrderId,
        palletCount: count(),
        totalCartons: sum(transferOrderPallets.cartonQty),
      })
      .from(transferOrderPallets)
      .groupBy(transferOrderPallets.transferOrderId);
    const aggregateById = new Map(aggregates.map((a) => [a.transferOrderId, a]));

    return NextResponse.json({
      transferOrders: rows.map((r) => {
        const a = aggregateById.get(r.id);
        const dest = destById.get(r.destinationWarehouseId);
        return {
          ...r,
          destinationWarehouseCode: dest?.code ?? null,
          destinationWarehouseType: dest?.type ?? null,
          palletCount: a?.palletCount ?? 0,
          totalCartons: Number(a?.totalCartons ?? 0),
        };
      }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

async function nextTransferNumber(db: ReturnType<typeof getDb>, date: string): Promise<string> {
  const prefix = transferOrderNumberPrefix(date);
  const existing = await db.select({ transferNumber: transferOrders.transferNumber }).from(transferOrders);
  const todayCount = existing.filter((r) => r.transferNumber.startsWith(prefix)).length;
  const seq = String(todayCount + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

/**
 * Create a DRAFT transfer order (Flow 4 Step 1's header fields - material/
 * batch/pallet selection happens afterward via the pallets sub-route,
 * same split already used by Loading Sheet). Gated "transfers.create"
 * (R03/R09, matching Flow 4 Step 1's own "Warehouse Incharge, Logistics"
 * actor description).
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("transfers.create");

    const body = await request.json();
    const parsed = transferOrderCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }
    if (parsed.data.sourceWarehouseId === parsed.data.destinationWarehouseId) {
      throw new ValidationError("Source and destination warehouse must be different.");
    }

    const db = getDb();
    const [sourceWarehouse] = await db.select().from(warehouses).where(eq(warehouses.id, parsed.data.sourceWarehouseId));
    if (!sourceWarehouse) {
      throw new NotFoundError(`Warehouse "${parsed.data.sourceWarehouseId}" not found.`);
    }
    const [destWarehouse] = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.id, parsed.data.destinationWarehouseId));
    if (!destWarehouse) {
      throw new NotFoundError(`Warehouse "${parsed.data.destinationWarehouseId}" not found.`);
    }

    const id = crypto.randomUUID();
    const transferNumber = await nextTransferNumber(db, parsed.data.date);
    await db.insert(transferOrders).values({
      id,
      transferNumber,
      sourceWarehouseId: parsed.data.sourceWarehouseId,
      destinationWarehouseId: parsed.data.destinationWarehouseId,
      transferType: parsed.data.transferType,
      status: "DRAFT",
    });

    const [created] = await db.select().from(transferOrders).where(eq(transferOrders.id, id));
    return NextResponse.json({ transferOrder: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
