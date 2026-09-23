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
  loadingSheets,
  loadingSheetPallets,
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
let loadingSheetId: string;

async function cleanup() {
  // stock_ledger is append-only (INV-009) - once Loop 50's own real
  // INWARD fixture row below is written, it (and everything it
  // references) is permanently undeletable while foreign keys stay
  // enforced (PEN-026's own already-established finding). This delete
  // was always a no-op before Loop 50 added a real row at this
  // reference id; it would now fail the whole suite's afterAll, so it
  // is removed rather than left to break on every future run.
  // Looked up by hold_number, not just the in-memory `holdId` variable -
  // a crashed earlier run (e.g. this file's own Loop 50 append-only
  // discovery, before the fix above) can leave a real holdPallets row
  // dangling from a PRIOR process, which this run's own `holdId` never
  // knows about; deleting the parent hold_records row first would then
  // fail with a real FK violation.
  const [existingHoldByNumber] = await db.select().from(holdRecords).where(eq(holdRecords.holdNumber, "HOLD-DASH-47"));
  if (existingHoldByNumber) {
    await db.delete(holdPallets).where(eq(holdPallets.holdId, existingHoldByNumber.id));
  }
  if (holdId) {
    await db.delete(holdPallets).where(eq(holdPallets.holdId, holdId));
  }
  await db.delete(holdRecords).where(eq(holdRecords.holdNumber, "HOLD-DASH-47"));
  await db.delete(maintenanceTickets).where(eq(maintenanceTickets.ticketNumber, "MT-DASH-47"));
  await db.delete(transferOrders).where(eq(transferOrders.transferNumber, "TO-DASH-47"));
  const [existingLoadingSheetByNumber] = await db
    .select()
    .from(loadingSheets)
    .where(eq(loadingSheets.loadingSheetNumber, "LS-DASH-50"));
  if (existingLoadingSheetByNumber) {
    await db.delete(loadingSheetPallets).where(eq(loadingSheetPallets.loadingSheetId, existingLoadingSheetByNumber.id));
  }
  if (loadingSheetId) {
    await db.delete(loadingSheetPallets).where(eq(loadingSheetPallets.loadingSheetId, loadingSheetId));
  }
  await db.delete(loadingSheets).where(eq(loadingSheets.loadingSheetNumber, "LS-DASH-50"));
  if (palletIds.length > 0) {
    await db.delete(pallets).where(inArray(pallets.id, palletIds));
  }
  await db.delete(locations).where(eq(locations.fullCode, "DASH47-CR1-01-A-1"));
  // batches is no longer deleted here (Loop 50): this file's own real
  // stock_ledger fixture row now permanently references this batch
  // (append-only, INV-009/PEN-026) - the delete below would fail with a
  // real FK violation once that row exists, exactly like the
  // stock_ledger delete removed above. The batch (like the material and
  // user fixtures already handled this way elsewhere in this file) is
  // simply find-or-created instead, never deleted.
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

  // One OK pallet (current stock, 0-30 bucket). Find-or-create, NOT
  // pushed to the bulk-deletable palletIds array below - Loop 50 gives
  // this specific pallet a real stock_ledger row (for the new Daily
  // Flow panel), which makes it permanently undeletable while foreign
  // keys stay enforced (PEN-026's own already-established finding).
  const [existingOkPallet] = await db.select().from(pallets).where(eq(pallets.palletNumber, "DASH47-OK-1"));
  const okPalletId = existingOkPallet?.id ?? crypto.randomUUID();
  if (!existingOkPallet) {
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
  }

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

  // Loop 50 (Dashboard redesign): a real today-dated INWARD ledger row,
  // for the new Daily Flow panel. Idempotent (find-or-create), not
  // delete-then-recreate - stock_ledger is append-only (PEN-026). A
  // second run's "today" may differ from the first run's own fixture
  // row's date (a real limitation of a date-scoped panel over an
  // append-only ledger, not a bug) - the assertion below only checks
  // that inward is not zero, not an exact count, for this reason.
  // Keyed per day: a single fixed key left the only fixture row on its first run's date, so the
  // "today's inward" assertion failed on every later day.
  const todayStr = new Date().toISOString().slice(0, 10);
  const ledgerFixtureRef = `loop-47-dashboard-fixture-${todayStr}`;
  const [existingLedgerRow] = await db
    .select()
    .from(stockLedger)
    .where(eq(stockLedger.referenceId, ledgerFixtureRef));
  if (!existingLedgerRow) {
    await db.insert(stockLedger).values({
      id: crypto.randomUUID(),
      date: todayStr,
      shift: "A",
      transactionType: "INWARD",
      materialId,
      batchId,
      palletId: okPalletId,
      warehouseId,
      qtyChange: 50,
      qtyAfter: 50,
      weightChangeKg: 100,
      weightAfterKg: 100,
      referenceType: "RECEIVING_SHEET",
      referenceId: ledgerFixtureRef,
      userId: FIXTURE_USER_ID,
    });
  }

  // Loop 50: a real today-dated loading sheet + picked pallet, for the
  // new Today's Dispatch panel.
  loadingSheetId = crypto.randomUUID();
  await db.insert(loadingSheets).values({
    id: loadingSheetId,
    loadingSheetNumber: "LS-DASH-50",
    date: todayStr,
    vehicleNumber: "GJ-DASH-50",
    driverName: "Loop 50 fixture driver",
    partyName: "Loop 50 fixture party",
    destination: "Test destination",
    exportDomestic: "DOMESTIC",
    temperatureC: -18,
    status: "STAGING",
  });
  await db.insert(loadingSheetPallets).values({
    id: crypto.randomUUID(),
    loadingSheetId,
    palletId: okPalletId,
    materialId,
    batchId,
    cartonQty: 50,
    weightKg: 100,
    loadingSequence: 1,
  });
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

  it("Warehouse-wise Stock: real per-warehouse cartons include our fixture pallets", async () => {
    const res = await getDashboard();
    const body = await res.json();
    const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId));
    const ours = body.warehouseWiseStock.find((w: { warehouseCode: string }) => w.warehouseCode === wh.code);
    expect(ours).toBeDefined();
    expect(ours.cartons).toBeGreaterThanOrEqual(50 + 40 + 30 + 45);
  });

  it("Daily Flow: 14 real days returned, today's real inward reflected", async () => {
    const res = await getDashboard();
    const body = await res.json();
    expect(body.dailyFlow).toHaveLength(14);
    const todayStr = new Date().toISOString().slice(0, 10);
    const today = body.dailyFlow.find((d: { date: string }) => d.date === todayStr);
    expect(today).toBeDefined();
    expect(today.inward).toBeGreaterThanOrEqual(50);
  });

  it("Top Aged Holds: restricted for a role with no holds.view (R02), real for R03", async () => {
    currentRole.value = "R02";
    const restrictedRes = await getDashboard();
    const restrictedBody = await restrictedRes.json();
    expect(restrictedBody.topAgedHolds).toEqual({ restricted: true });

    currentRole.value = "R03";
    const res = await getDashboard();
    const body = await res.json();
    expect(body.topAgedHolds.restricted).toBe(false);
    const ours = body.topAgedHolds.rows.find((r: { id: string }) => r.id === holdId);
    expect(ours).toBeDefined();
    expect(ours.materialCode).toBe(FIXTURE_MATERIAL_CODE);
    expect(ours.totalCartons).toBe(45);
  });

  it("Today's Dispatch: real today-dated loading sheet with its real picked quantity", async () => {
    const res = await getDashboard();
    const body = await res.json();
    const ours = body.todaysDispatch.find((d: { id: string }) => d.id === loadingSheetId);
    expect(ours).toBeDefined();
    expect(ours.vehicleNumber).toBe("GJ-DASH-50");
    expect(ours.totalCartons).toBe(50);
  });

  it("no session (undefined role): still 200, sensitive panels restricted", async () => {
    currentRole.value = undefined;
    const res = await getDashboard();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.holdTracking).toEqual({ restricted: true });
    expect(body.stockLedgerRecent).toEqual({ restricted: true });
    expect(body.inOutSummary).toEqual({ restricted: true });
    expect(body.topAgedHolds).toEqual({ restricted: true });
    // Ungated panels still return real data even signed-out (PEN-022).
    expect(body.bulkTracking.count).toBeGreaterThanOrEqual(1);
  });
});
