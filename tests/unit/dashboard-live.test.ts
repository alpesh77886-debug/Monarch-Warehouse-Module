import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";

/**
 * TASK-012 Dashboard (SCREEN-001) - live-DB test against real fixture
 * rows inserted directly (not via each entity's own create flow, already
 * covered by that entity's own live test - this test is about the
 * dashboard's own read/aggregation logic, not re-proving writes work).
 * Same hoisted-currentRole auth mock technique as bulk-live.test.ts,
 * extended with a getCurrentUser mock since the dashboard route calls
 * that directly (a soft per-panel permission check, not requirePermission's
 * hard gate - see the route's own doc comment for why).
 */
const { currentRole } = vi.hoisted(() => ({ currentRole: { value: "R03" as string | undefined } }));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ role: currentRole.value, department: undefined, plant: undefined })),
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
  requireCurrentUserId: vi.fn().mockResolvedValue("loop-47-dashboard-fixture-user"),
}));

const { getDb } = await import("@/lib/db");
const {
  materials,
  warehouses,
  batches,
  pallets,
  locations,
  holdRecords,
  holdPallets,
  maintenanceTickets,
  transferOrders,
  stockLedger,
  users,
} = await import("../../drizzle/schema");
const { GET: getDashboard } = await import("@/app/api/dashboard/route");

const db = getDb();

const FIXTURE_MATERIAL_CODE = "LFG-DASH-47";
const FIXTURE_BATCH_NUMBER = "L26I470001";
const FIXTURE_USER_ID = "loop-47-dashboard-fixture-user";

let materialId: string;
let batchId: string;
let warehouseId: string;
const palletIds: string[] = [];
let holdId: string;
let maintenanceTicketId: string;
let transferOrderId: string;

async function cleanup() {
  await db.delete(stockLedger).where(eq(stockLedger.referenceId, "loop-47-dashboard-fixture"));
  if (holdId) {
    await db.delete(holdPallets).where(eq(holdPallets.holdId, holdId));
    await db.delete(holdRecords).where(eq(holdRecords.id, holdId));
  }
  await db.delete(holdRecords).where(eq(holdRecords.holdNumber, "HOLD-DASH-47"));
  await db.delete(maintenanceTickets).where(eq(maintenanceTickets.ticketNumber, "MT-DASH-47"));
  await db.delete(transferOrders).where(eq(transferOrders.transferNumber, "TO-DASH-47"));
  if (palletIds.length > 0) {
    await db.delete(pallets).where(inArray(pallets.id, palletIds));
  }
  await db.delete(locations).where(eq(locations.fullCode, "DASH47-CR1-01-A-1"));
  if (batchId) {
    await db.delete(batches).where(eq(batches.id, batchId));
  }
}

beforeAll(async () => {
  currentRole.value = "R03";

  const [existingUser] = await db.select().from(users).where(eq(users.id, FIXTURE_USER_ID));
  if (!existingUser) {
    await db.insert(users).values({
      id: FIXTURE_USER_ID,
      clerkUserId: "loop-47-dashboard-clerk-user",
      name: "Loop 47 Dashboard Fixture User",
      email: "loop47-dashboard-fixture@example.test",
      roleId: "R03",
      department: "Warehouse",
      plant: "LIMBASI",
    });
  }

  const [existingMaterial] = await db.select().from(materials).where(eq(materials.code, FIXTURE_MATERIAL_CODE));
  if (existingMaterial) {
    materialId = existingMaterial.id;
  } else {
    materialId = crypto.randomUUID();
    await db.insert(materials).values({
      id: materialId,
      code: FIXTURE_MATERIAL_CODE,
      description: "Loop 47 dashboard fixture material",
      uomKgPerCarton: 10,
      category: "TEST",
      palletWeightLimitKg: 1000,
      palletType: "CARTON",
      plantOrigin: "LIMBASI",
    });
  }

  const [wh] = await db.select().from(warehouses).where(eq(warehouses.plant, "LIMBASI"));
  if (!wh) {
    throw new Error("No LIMBASI warehouse seeded - run npm run db:seed before this test.");
  }
  warehouseId = wh.id;

  await cleanup();

  const [existingBatch] = await db.select().from(batches).where(eq(batches.batchNumber, FIXTURE_BATCH_NUMBER));
  if (existingBatch) {
    batchId = existingBatch.id;
  } else {
    batchId = crypto.randomUUID();
    await db.insert(batches).values({
      id: batchId,
      batchNumber: FIXTURE_BATCH_NUMBER,
      materialId,
      productionDate: "2026-09-01",
      productionLine: "FF",
      shift: "A",
    });
  }

  // One OK pallet (current stock, 0-30 bucket).
  const okPalletId = crypto.randomUUID();
  palletIds.push(okPalletId);
  await db.insert(pallets).values({
    id: okPalletId,
    palletNumber: "DASH47-OK-1",
    palletType: "PLASTIC",
    materialId,
    statusCode: "OK",
    totalWeightKg: 100,
    totalCartons: 50,
    currentWarehouseId: warehouseId,
  });

  // One QC_HOLD pallet (D-04 queue).
  const qcPalletId = crypto.randomUUID();
  palletIds.push(qcPalletId);
  await db.insert(pallets).values({
    id: qcPalletId,
    palletNumber: "DASH47-QC-1",
    palletType: "PLASTIC",
    materialId,
    statusCode: "QC_HOLD",
    totalWeightKg: 80,
    totalCartons: 40,
    currentWarehouseId: warehouseId,
  });

  // One BULK pallet (D-03).
  const bulkPalletId = crypto.randomUUID();
  palletIds.push(bulkPalletId);
  await db.insert(pallets).values({
    id: bulkPalletId,
    palletNumber: "DASH47-BULK-1",
    palletType: "PLASTIC",
    materialId,
    statusCode: "BULK",
    totalWeightKg: 60,
    totalCartons: 30,
    currentWarehouseId: warehouseId,
  });

  // One HOLD pallet, linked to a real ACTIVE hold_record (D-02).
  const holdPalletId = crypto.randomUUID();
  palletIds.push(holdPalletId);
  await db.insert(pallets).values({
    id: holdPalletId,
    palletNumber: "DASH47-HOLD-1",
    palletType: "PLASTIC",
    materialId,
    statusCode: "HOLD",
    totalWeightKg: 90,
    totalCartons: 45,
    currentWarehouseId: warehouseId,
  });
  holdId = crypto.randomUUID();
  await db.insert(holdRecords).values({
    id: holdId,
    holdNumber: "HOLD-DASH-47",
    materialId,
    batchId,
    holdReason: "High Temperature",
    placedById: FIXTURE_USER_ID,
    placedByDepartment: "QC",
    placedAt: new Date().toISOString(),
    status: "ACTIVE",
  });
  await db.insert(holdPallets).values({ id: crypto.randomUUID(), holdId, palletId: holdPalletId });

  // One DISPATCHED pallet (must be excluded from Stock Snapshot totals).
  const dispatchedPalletId = crypto.randomUUID();
  palletIds.push(dispatchedPalletId);
  await db.insert(pallets).values({
    id: dispatchedPalletId,
    palletNumber: "DASH47-DISPATCHED-1",
    palletType: "PLASTIC",
    materialId,
    statusCode: "DISPATCHED",
    totalWeightKg: 500,
    totalCartons: 250,
    currentWarehouseId: warehouseId,
  });

  // One real location, CR1, OCCUPIED (D-08).
  await db.insert(locations).values({
    id: crypto.randomUUID(),
    warehouseId,
    coldRoom: "CR1",
    fullCode: "DASH47-CR1-01-A-1",
    capacityPallets: 1,
    status: "OCCUPIED",
  });

  // One OPEN CRITICAL maintenance ticket (D-07).
  maintenanceTicketId = crypto.randomUUID();
  await db.insert(maintenanceTickets).values({
    id: maintenanceTicketId,
    ticketNumber: "MT-DASH-47",
    category: "REFRIGERATION",
    location: "CR1",
    description: "Loop 47 dashboard fixture ticket",
    severity: "CRITICAL",
    status: "OPEN",
    raisedById: FIXTURE_USER_ID,
  });

  // One IN_TRANSIT transfer order (D-06). Needs a second real warehouse -
  // reuse the same LIMBASI warehouse row twice is invalid (source != dest
  // CHECK) - look for any other seeded warehouse, skip D-06 seeding if
  // none exists rather than inventing one.
  const otherWarehouses = await db.select().from(warehouses);
  const destWarehouse = otherWarehouses.find((w) => w.id !== warehouseId);
  if (destWarehouse) {
    transferOrderId = crypto.randomUUID();
    await db.insert(transferOrders).values({
      id: transferOrderId,
      transferNumber: "TO-DASH-47",
      sourceWarehouseId: warehouseId,
      destinationWarehouseId: destWarehouse.id,
      transferType: "NORMAL",
      status: "IN_TRANSIT",
    });
  }
});

afterAll(async () => {
  await cleanup();
});

describe("GET /api/dashboard", () => {
  it("Stock Snapshot: totals current stock, excludes DISPATCHED, buckets by age", async () => {
    const res = await getDashboard();
    expect(res.status).toBe(200);
    const body = await res.json();

    const ourStatuses = body.stockSnapshot.byStatus.filter((s: { status: string }) =>
      ["OK", "QC_HOLD", "BULK", "HOLD"].includes(s.status)
    );
    const ourCartons = ourStatuses.reduce((sum: number, s: { cartons: number }) => sum + s.cartons, 0);
    expect(ourCartons).toBeGreaterThanOrEqual(50 + 40 + 30 + 45);

    const dispatchedStatus = body.stockSnapshot.byStatus.find((s: { status: string }) => s.status === "DISPATCHED");
    expect(dispatchedStatus).toBeUndefined();

    const zeroTo30 = body.stockSnapshot.agingBuckets.find((b: { bucket: string }) => b.bucket === "0-30");
    expect(zeroTo30.cartons).toBeGreaterThan(0);
  });

  it("Hold Tracking: real ACTIVE hold count and cartons for a role with holds.view (R03)", async () => {
    currentRole.value = "R03";
    const res = await getDashboard();
    const body = await res.json();
    expect(body.holdTracking.restricted).toBe(false);
    expect(body.holdTracking.activeCount).toBeGreaterThanOrEqual(1);
    expect(body.holdTracking.totalCartons).toBeGreaterThanOrEqual(45);
  });

  it("Hold Tracking: restricted for a role with no holds.view (R02)", async () => {
    currentRole.value = "R02";
    const res = await getDashboard();
    const body = await res.json();
    expect(body.holdTracking).toEqual({ restricted: true });
  });

  it("Stock Ledger recent + In-Out Summary: restricted for a role with no stock.view_ledger/stock.view_summary (R06)", async () => {
    currentRole.value = "R06";
    const res = await getDashboard();
    const body = await res.json();
    expect(body.stockLedgerRecent).toEqual({ restricted: true });
    expect(body.inOutSummary).toEqual({ restricted: true });
  });

  it("Stock Ledger recent + In-Out Summary: real data for R01 (has both permissions)", async () => {
    currentRole.value = "R01";
    const res = await getDashboard();
    const body = await res.json();
    expect(body.stockLedgerRecent.restricted).toBe(false);
    expect(body.inOutSummary.restricted).toBe(false);
  });

  it("Bulk Tracking: real BULK pallet count and cartons", async () => {
    const res = await getDashboard();
    const body = await res.json();
    expect(body.bulkTracking.count).toBeGreaterThanOrEqual(1);
    expect(body.bulkTracking.pendingCartons).toBeGreaterThanOrEqual(30);
  });

  it("QC Pending Queue: real QC_HOLD pallet count, no invented SLA breach coloring", async () => {
    const res = await getDashboard();
    const body = await res.json();
    expect(body.qcPendingQueue.count).toBeGreaterThanOrEqual(1);
    expect(typeof body.qcPendingQueue.oldestHours).toBe("number");
  });

  it("Maintenance: real OPEN CRITICAL ticket counted", async () => {
    const res = await getDashboard();
    const body = await res.json();
    expect(body.maintenance.openCount).toBeGreaterThanOrEqual(1);
    expect(body.maintenance.criticalCount).toBeGreaterThanOrEqual(1);
  });

  it("Rack Map mini: real CR1 occupancy reflects the fixture OCCUPIED location", async () => {
    const res = await getDashboard();
    const body = await res.json();
    const cr1 = body.rackMapMini.find((r: { coldRoom: string }) => r.coldRoom === "CR1");
    expect(cr1).toBeDefined();
    expect(cr1.occupied).toBeGreaterThanOrEqual(1);
  });

  it("Transfers: real IN_TRANSIT count reflected, when a second warehouse exists", async () => {
    const res = await getDashboard();
    const body = await res.json();
    if (transferOrderId) {
      expect(body.transfers.inTransitCount).toBeGreaterThanOrEqual(1);
      expect(body.transfers.pendingReceiptCount).toBe(body.transfers.inTransitCount);
    } else {
      expect(body.transfers.inTransitCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("no session (undefined role): still 200, sensitive panels restricted", async () => {
    currentRole.value = undefined;
    const res = await getDashboard();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.holdTracking).toEqual({ restricted: true });
    expect(body.stockLedgerRecent).toEqual({ restricted: true });
    expect(body.inOutSummary).toEqual({ restricted: true });
    // Ungated panels still return real data even signed-out (PEN-022).
    expect(body.bulkTracking.count).toBeGreaterThanOrEqual(1);
  });
});
