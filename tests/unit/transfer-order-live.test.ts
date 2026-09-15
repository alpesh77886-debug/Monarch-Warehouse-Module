import { describe, expect, it, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";

/**
 * Loop 43: live, end-to-end Transfer Order flow (TASK-009, Flow 4).
 * Same requirePermission/requireRole hoisted-currentRole mock technique
 * as loading-sheet-live.test.ts and bulk-live.test.ts.
 *
 * Covers GS-003 (Inter-Warehouse Transfer of Hold Material) / INV-017
 * (hold material transfers with hold tag, keeping its HOLD status
 * throughout - see PEN-041 for why no pallet_status transition exists
 * for this), a full NORMAL lifecycle (using pallet-status.ts's own
 * already-contracted OK<->IN_TRANSIT transitions), GS-010 (3PL Inward -
 * a NORMAL transfer to a 3PL-type destination warehouse), and INV-016
 * (batch traceability - every ledger row carries a real batch_id).
 */
const { currentRole } = vi.hoisted(() => ({ currentRole: { value: "R03" as string | undefined } }));

vi.mock("@/lib/auth", () => ({
  requirePermission: vi.fn(async (permission: string) => {
    const { hasPermission } = await import("../../src/lib/permissions");
    const { ForbiddenError, UnauthorizedError } = await import("../../src/lib/errors");
    const role = currentRole.value;
    if (!role) throw new UnauthorizedError();
    if (!hasPermission(role as never, permission)) {
      throw new ForbiddenError(`Role ${role} does not have permission "${permission}".`);
    }
    return role;
  }),
  requireRole: vi.fn(async (allowedRoles: string[]) => {
    const { ForbiddenError, UnauthorizedError } = await import("../../src/lib/errors");
    const role = currentRole.value;
    if (!role) throw new UnauthorizedError();
    if (!allowedRoles.includes(role)) {
      throw new ForbiddenError(`Role ${role} is not permitted to perform this action.`);
    }
    return role;
  }),
  requireCurrentUserId: vi.fn().mockResolvedValue("loop-43-fixture-user"),
}));

const { getDb } = await import("@/lib/db");
const { users, materials, warehouses, batches, pallets, palletBatches, locations, transferOrders, transferOrderPallets, stockLedger } =
  await import("../../drizzle/schema");
const { POST: createOrder } = await import("@/app/api/transfer-orders/route");
const { GET: getOrder } = await import("@/app/api/transfer-orders/[id]/route");
const { POST: pickPallet } = await import("@/app/api/transfer-orders/[id]/pallets/route");
const { POST: loadOrder } = await import("@/app/api/transfer-orders/[id]/load/route");
const { POST: dispatchOrder } = await import("@/app/api/transfer-orders/[id]/dispatch/route");
const { POST: receiveOrder } = await import("@/app/api/transfer-orders/[id]/receive/route");
const { POST: completeOrder } = await import("@/app/api/transfer-orders/[id]/complete/route");

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function getRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

const db = getDb();

const FIXTURE_USER_ID = "loop-43-fixture-user";
const SOURCE_WAREHOUSE_CODE = "TEST-TO-SRC-WH";
const DEST_WAREHOUSE_CODE = "TEST-TO-DEST-WH";
const DEST_3PL_WAREHOUSE_CODE = "TEST-TO-3PL-WH";
const LOCATION_CODE = "TEST-TO-LOC-1";

let sourceWarehouseId: string;
let destWarehouseId: string;
let dest3plWarehouseId: string;
let locationId: string;

let materialOkId: string;
let materialHoldId: string;
let batchOkId: string;
let batchHoldId: string;
let palletOkId: string;
let palletHoldId: string;
let palletOk3plId: string;
let palletOk4Id: string;

async function findOrCreateWarehouse(code: string, type: string): Promise<string> {
  const [existing] = await db.select().from(warehouses).where(eq(warehouses.code, code));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(warehouses).values({
    id,
    code,
    name: `Loop 43 fixture warehouse ${code}`,
    type,
    plant: "LIMBASI",
    sapCode: "LMFGA",
    locationStructure: "RACK",
  });
  return id;
}

async function findOrCreateMaterial(code: string): Promise<string> {
  const [existing] = await db.select().from(materials).where(eq(materials.code, code));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(materials).values({
    id,
    code,
    description: `Loop 43 transfer fixture material ${code}`,
    uomKgPerCarton: 10,
    category: "TEST",
    palletWeightLimitKg: 1000,
    palletType: "CARTON",
    plantOrigin: "LIMBASI",
  });
  return id;
}

async function findOrCreateBatch(batchNumber: string, materialId: string): Promise<string> {
  const [existing] = await db.select().from(batches).where(eq(batches.batchNumber, batchNumber));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(batches).values({
    id,
    batchNumber,
    materialId,
    productionDate: "2026-01-10",
    productionLine: "FF",
    shift: "A",
  });
  return id;
}

async function findOrCreatePallet(
  palletNumber: string,
  materialId: string,
  batchId: string,
  statusCode: string,
  warehouseId: string,
  currentLocationId: string | null = null
): Promise<string> {
  const [existing] = await db.select().from(pallets).where(eq(pallets.palletNumber, palletNumber));
  let id: string;
  if (existing) {
    id = existing.id;
    await db.update(pallets).set({ statusCode, currentWarehouseId: warehouseId, currentLocationId }).where(eq(pallets.id, id));
  } else {
    id = crypto.randomUUID();
    await db.insert(pallets).values({
      id,
      palletNumber,
      palletType: "PLASTIC",
      materialId,
      statusCode,
      totalWeightKg: 100,
      totalCartons: 10,
      currentWarehouseId: warehouseId,
      currentLocationId,
    });
  }
  const [existingLink] = await db.select().from(palletBatches).where(eq(palletBatches.palletId, id));
  if (!existingLink) {
    await db.insert(palletBatches).values({ id: crypto.randomUUID(), palletId: id, batchId, cartonQty: 10, weightKg: 100 });
  }
  return id;
}

beforeAll(async () => {
  currentRole.value = "R03";

  const [existingUser] = await db.select().from(users).where(eq(users.id, FIXTURE_USER_ID));
  if (!existingUser) {
    await db.insert(users).values({
      id: FIXTURE_USER_ID,
      clerkUserId: "loop-43-fixture-clerk-user",
      name: "Loop 43 Fixture User",
      email: "loop43-fixture@example.test",
      roleId: "R03",
      department: "Warehouse",
      plant: "LIMBASI",
    });
  }

  sourceWarehouseId = await findOrCreateWarehouse(SOURCE_WAREHOUSE_CODE, "OWN");
  destWarehouseId = await findOrCreateWarehouse(DEST_WAREHOUSE_CODE, "CROSS_PLANT");
  dest3plWarehouseId = await findOrCreateWarehouse(DEST_3PL_WAREHOUSE_CODE, "3PL");

  const [existingLocation] = await db.select().from(locations).where(eq(locations.fullCode, LOCATION_CODE));
  if (existingLocation) {
    locationId = existingLocation.id;
    await db.update(locations).set({ status: "EMPTY", currentPalletId: null }).where(eq(locations.id, locationId));
  } else {
    locationId = crypto.randomUUID();
    await db.insert(locations).values({
      id: locationId,
      warehouseId: sourceWarehouseId,
      coldRoom: "CR1",
      block: "A",
      position: "1",
      floor: 1,
      fullCode: LOCATION_CODE,
      capacityPallets: 1,
      status: "EMPTY",
    });
  }

  materialOkId = await findOrCreateMaterial("LFG00043");
  materialHoldId = await findOrCreateMaterial("LFG00044");
  batchOkId = await findOrCreateBatch("L26I043010", materialOkId);
  batchHoldId = await findOrCreateBatch("L26I044010", materialHoldId);

  palletOkId = await findOrCreatePallet("TEST-TO-PALLET-OK", materialOkId, batchOkId, "OK", sourceWarehouseId, locationId);
  palletHoldId = await findOrCreatePallet("TEST-TO-PALLET-HOLD", materialHoldId, batchHoldId, "HOLD", sourceWarehouseId);
  palletOk3plId = await findOrCreatePallet("TEST-TO-PALLET-OK-3PL", materialOkId, batchOkId, "OK", sourceWarehouseId);
  palletOk4Id = await findOrCreatePallet("TEST-TO-PALLET-OK-4", materialOkId, batchOkId, "OK", sourceWarehouseId);
});

async function createDraftOrder(transferType: "NORMAL" | "HOLD_TAG" | "BULK_TAG", destinationWarehouseId: string) {
  currentRole.value = "R03";
  const res = await createOrder(
    jsonRequest("/api/transfer-orders", {
      date: "2026-02-10",
      sourceWarehouseId,
      destinationWarehouseId,
      transferType,
    })
  );
  const body = await res.json();
  expect(res.status, JSON.stringify(body)).toBe(201);
  return body.transferOrder.id as string;
}

describe("GS-003 / INV-017: HOLD_TAG transfer keeps HOLD status throughout", () => {
  let orderId: string;

  it("creates a HOLD_TAG DRAFT transfer order", async () => {
    orderId = await createDraftOrder("HOLD_TAG", destWarehouseId);
  });

  it("refuses an OK pallet on a HOLD_TAG transfer (only HOLD material allowed)", async () => {
    const res = await pickPallet(jsonRequest(`/api/transfer-orders/${orderId}/pallets`, { palletId: palletOkId }), {
      params: { id: orderId },
    });
    expect(res.status).toBe(422);
  });

  it("picks the real HOLD pallet, auto-advancing DRAFT -> PICKED", async () => {
    const res = await pickPallet(jsonRequest(`/api/transfer-orders/${orderId}/pallets`, { palletId: palletHoldId }), {
      params: { id: orderId },
    });
    expect(res.status, JSON.stringify(await res.json())).toBe(201);

    const getRes = await getOrder(getRequest(`/api/transfer-orders/${orderId}`), { params: { id: orderId } });
    const getBody = await getRes.json();
    expect(getBody.transferOrder.status).toBe("PICKED");
  });

  it("loads (PICKED -> LOADED)", async () => {
    const res = await loadOrder(
      jsonRequest(`/api/transfer-orders/${orderId}/load`, { vehicleNumber: "GJ01AB1234", driverName: "Test Driver" }),
      { params: { id: orderId } }
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.transferOrder.status).toBe("LOADED");
  });

  it("dispatches (LOADED -> IN_TRANSIT): pallet stays HOLD, real TRANSFER_OUT ledger row, location freed", async () => {
    currentRole.value = "R09";
    const res = await dispatchOrder(jsonRequest(`/api/transfer-orders/${orderId}/dispatch`, {}), { params: { id: orderId } });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.transferOrder.status).toBe("IN_TRANSIT");

    const [pallet] = await db.select().from(pallets).where(eq(pallets.id, palletHoldId));
    expect(pallet.statusCode).toBe("HOLD"); // unchanged - INV-017
    expect(pallet.currentLocationId).toBeNull();
    expect(pallet.currentWarehouseId).toBe(sourceWarehouseId); // not yet arrived

    const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
    expect(location.status).toBe("EMPTY");

    const outRows = await db
      .select()
      .from(stockLedger)
      .where(and(eq(stockLedger.referenceId, orderId), eq(stockLedger.transactionType, "TRANSFER_OUT")));
    expect(outRows.length).toBe(1);
    expect(outRows[0].statusBefore).toBe("HOLD");
    expect(outRows[0].statusAfter).toBe("HOLD");
    expect(outRows[0].batchId).toBe(batchHoldId); // INV-016 traceability
  });

  it("receives (IN_TRANSIT -> RECEIVED): pallet still HOLD at the destination warehouse (Flow 4 Step 5), real TRANSFER_IN row", async () => {
    currentRole.value = "R01";
    const res = await receiveOrder(jsonRequest(`/api/transfer-orders/${orderId}/receive`, {}), { params: { id: orderId } });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.transferOrder.status).toBe("RECEIVED");

    const [pallet] = await db.select().from(pallets).where(eq(pallets.id, palletHoldId));
    expect(pallet.statusCode).toBe("HOLD"); // still HOLD - receiving warehouse's own QC must release it
    expect(pallet.currentWarehouseId).toBe(destWarehouseId);

    const inRows = await db
      .select()
      .from(stockLedger)
      .where(and(eq(stockLedger.referenceId, orderId), eq(stockLedger.transactionType, "TRANSFER_IN")));
    expect(inRows.length).toBe(1);
    expect(inRows[0].statusBefore).toBe("HOLD");
    expect(inRows[0].statusAfter).toBe("HOLD");
  });

  it("completes (RECEIVED -> COMPLETED), then refuses any further action (immutable)", async () => {
    currentRole.value = "R01";
    const res = await completeOrder(jsonRequest(`/api/transfer-orders/${orderId}/complete`, {}), { params: { id: orderId } });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.transferOrder.status).toBe("COMPLETED");

    const again = await completeOrder(jsonRequest(`/api/transfer-orders/${orderId}/complete`, {}), { params: { id: orderId } });
    expect(again.status).toBe(422);
  });
});

describe("Normal transfer full lifecycle (real pallet-status.ts OK<->IN_TRANSIT transitions)", () => {
  let orderId: string;

  it("creates, picks the OK pallet (refuses the HOLD pallet), loads, dispatches, receives, completes", async () => {
    orderId = await createDraftOrder("NORMAL", destWarehouseId);

    const badPick = await pickPallet(jsonRequest(`/api/transfer-orders/${orderId}/pallets`, { palletId: palletHoldId }), {
      params: { id: orderId },
    });
    expect(badPick.status).toBe(422);

    currentRole.value = "R03";
    const pickRes = await pickPallet(jsonRequest(`/api/transfer-orders/${orderId}/pallets`, { palletId: palletOkId }), {
      params: { id: orderId },
    });
    expect(pickRes.status, JSON.stringify(await pickRes.json())).toBe(201);

    const loadRes = await loadOrder(
      jsonRequest(`/api/transfer-orders/${orderId}/load`, { vehicleNumber: "GJ02CD5678", driverName: "Test Driver 2" }),
      { params: { id: orderId } }
    );
    expect(loadRes.status).toBe(200);

    currentRole.value = "R09";
    const dispatchRes = await dispatchOrder(jsonRequest(`/api/transfer-orders/${orderId}/dispatch`, {}), {
      params: { id: orderId },
    });
    expect(dispatchRes.status).toBe(200);
    const [inTransitPallet] = await db.select().from(pallets).where(eq(pallets.id, palletOkId));
    expect(inTransitPallet.statusCode).toBe("IN_TRANSIT"); // real pallet-status.ts transition

    currentRole.value = "R01";
    const receiveRes = await receiveOrder(jsonRequest(`/api/transfer-orders/${orderId}/receive`, {}), {
      params: { id: orderId },
    });
    expect(receiveRes.status).toBe(200);
    const [okPallet] = await db.select().from(pallets).where(eq(pallets.id, palletOkId));
    expect(okPallet.statusCode).toBe("OK");
    expect(okPallet.currentWarehouseId).toBe(destWarehouseId);

    const completeRes = await completeOrder(jsonRequest(`/api/transfer-orders/${orderId}/complete`, {}), {
      params: { id: orderId },
    });
    expect(completeRes.status).toBe(200);
  });

  it("refuses dispatch before loading (out-of-order action)", async () => {
    const freshOrderId = await createDraftOrder("NORMAL", destWarehouseId);
    currentRole.value = "R09";
    const res = await dispatchOrder(jsonRequest(`/api/transfer-orders/${freshOrderId}/dispatch`, {}), {
      params: { id: freshOrderId },
    });
    expect(res.status).toBe(422);
  });
});

describe("GS-010: 3PL Inward (NORMAL transfer to a 3PL-type destination warehouse)", () => {
  it("a transfer received at a 3PL warehouse is identifiable as 3PL inward", async () => {
    const orderId = await createDraftOrder("NORMAL", dest3plWarehouseId);

    currentRole.value = "R03";
    await pickPallet(jsonRequest(`/api/transfer-orders/${orderId}/pallets`, { palletId: palletOk3plId }), {
      params: { id: orderId },
    });
    await loadOrder(jsonRequest(`/api/transfer-orders/${orderId}/load`, { vehicleNumber: "GJ03EF9012", driverName: "Test Driver 3" }), {
      params: { id: orderId },
    });
    currentRole.value = "R09";
    await dispatchOrder(jsonRequest(`/api/transfer-orders/${orderId}/dispatch`, {}), { params: { id: orderId } });
    currentRole.value = "R01";
    const receiveRes = await receiveOrder(jsonRequest(`/api/transfer-orders/${orderId}/receive`, {}), {
      params: { id: orderId },
    });
    expect(receiveRes.status).toBe(200);

    const getRes = await getOrder(getRequest(`/api/transfer-orders/${orderId}`), { params: { id: orderId } });
    const getBody = await getRes.json();
    expect(getBody.transferOrder.status).toBe("RECEIVED");
    expect(getBody.transferOrder.destinationWarehouseType).toBe("3PL");
  });
});

describe("Role gates - a role outside the contracted actor list is refused", () => {
  it("R04 (QC) cannot dispatch (requires transfers.dispatch - R03/R09 only)", async () => {
    const orderId = await createDraftOrder("NORMAL", destWarehouseId);
    currentRole.value = "R03";
    await pickPallet(jsonRequest(`/api/transfer-orders/${orderId}/pallets`, { palletId: palletOk4Id }), {
      params: { id: orderId },
    });
    await loadOrder(jsonRequest(`/api/transfer-orders/${orderId}/load`, { vehicleNumber: "GJ04GH3456", driverName: "Test Driver 4" }), {
      params: { id: orderId },
    });
    currentRole.value = "R04";
    const res = await dispatchOrder(jsonRequest(`/api/transfer-orders/${orderId}/dispatch`, {}), { params: { id: orderId } });
    expect(res.status).toBe(403);
  });
});
