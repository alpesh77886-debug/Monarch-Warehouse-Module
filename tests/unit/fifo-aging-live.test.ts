import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * TASK-013 FIFO Aging Report (SCREEN-013) - live-DB test for
 * GET /api/stock/aging, same hoisted-currentRole requirePermission mock
 * technique as every other *-live.test.ts file in this repository.
 */
const { currentRole } = vi.hoisted(() => ({ currentRole: { value: "R01" as string | undefined } }));

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
}));

const { getDb } = await import("@/lib/db");
const { materials, warehouses, batches, pallets, palletBatches, loadingSheets, loadingSheetPallets } =
  await import("../../drizzle/schema");
const { GET: getAging } = await import("@/app/api/stock/aging/route");

const db = getDb();

const FIXTURE_MATERIAL_CODE = "LFG-FIFO-48";
const FIXTURE_OLD_BATCH = "L26I480001";
const FIXTURE_NEW_BATCH = "L26I480002";
const FIXTURE_SHEET_NUMBER = "LS-FIFO-48";

let materialId: string;
let warehouseId: string;
let oldBatchId: string;
let newBatchId: string;
const palletIds: string[] = [];
let sheetId: string;

async function cleanup() {
  await db.delete(loadingSheetPallets).where(eq(loadingSheetPallets.loadingSheetId, sheetId ?? ""));
  await db.delete(loadingSheets).where(eq(loadingSheets.loadingSheetNumber, FIXTURE_SHEET_NUMBER));
  for (const id of palletIds) {
    await db.delete(palletBatches).where(eq(palletBatches.palletId, id));
  }
  if (palletIds.length > 0) {
    for (const id of palletIds) {
      await db.delete(pallets).where(eq(pallets.id, id));
    }
  }
  await db.delete(batches).where(eq(batches.batchNumber, FIXTURE_OLD_BATCH));
  await db.delete(batches).where(eq(batches.batchNumber, FIXTURE_NEW_BATCH));
}

beforeAll(async () => {
  currentRole.value = "R01";

  const [existingMaterial] = await db.select().from(materials).where(eq(materials.code, FIXTURE_MATERIAL_CODE));
  materialId = existingMaterial
    ? existingMaterial.id
    : await (async () => {
        const id = crypto.randomUUID();
        await db.insert(materials).values({
          id,
          code: FIXTURE_MATERIAL_CODE,
          description: "Loop 48 FIFO aging fixture material",
          uomKgPerCarton: 10,
          category: "TEST",
          palletWeightLimitKg: 1000,
          palletType: "CARTON",
          plantOrigin: "LIMBASI",
        });
        return id;
      })();

  const [wh] = await db.select().from(warehouses).where(eq(warehouses.plant, "LIMBASI"));
  if (!wh) throw new Error("No LIMBASI warehouse seeded - run npm run db:seed before this test.");
  warehouseId = wh.id;

  await cleanup();

  oldBatchId = crypto.randomUUID();
  await db.insert(batches).values({
    id: oldBatchId,
    batchNumber: FIXTURE_OLD_BATCH,
    materialId,
    productionDate: "2026-01-01",
    productionLine: "FF",
    shift: "A",
  });
  newBatchId = crypto.randomUUID();
  await db.insert(batches).values({
    id: newBatchId,
    batchNumber: FIXTURE_NEW_BATCH,
    materialId,
    productionDate: "2026-09-10",
    productionLine: "FF",
    shift: "A",
  });

  // One OK pallet on the OLD batch - must appear in aging-by-batch.
  const oldPalletId = crypto.randomUUID();
  palletIds.push(oldPalletId);
  await db.insert(pallets).values({
    id: oldPalletId,
    palletNumber: "FIFO48-OLD-1",
    palletType: "PLASTIC",
    materialId,
    statusCode: "OK",
    totalWeightKg: 300,
    totalCartons: 30,
    currentWarehouseId: warehouseId,
  });
  await db.insert(palletBatches).values({ id: crypto.randomUUID(), palletId: oldPalletId, batchId: oldBatchId, cartonQty: 30, weightKg: 300 });

  // One BULK pallet on the OLD batch - must NOT appear (only OK counts).
  const bulkPalletId = crypto.randomUUID();
  palletIds.push(bulkPalletId);
  await db.insert(pallets).values({
    id: bulkPalletId,
    palletNumber: "FIFO48-BULK-1",
    palletType: "PLASTIC",
    materialId,
    statusCode: "BULK",
    totalWeightKg: 100,
    totalCartons: 10,
    currentWarehouseId: warehouseId,
  });
  await db.insert(palletBatches).values({ id: crypto.randomUUID(), palletId: bulkPalletId, batchId: oldBatchId, cartonQty: 10, weightKg: 100 });

  // A DISPATCHED loading sheet with 2 picks: one compliant (no override),
  // one overridden - real fifo_override_reason data for the compliance rate.
  sheetId = crypto.randomUUID();
  await db.insert(loadingSheets).values({
    id: sheetId,
    loadingSheetNumber: FIXTURE_SHEET_NUMBER,
    date: "2026-09-15",
    vehicleNumber: "GJ-01-AB-1234",
    driverName: "Loop 48 fixture driver",
    partyName: "Loop 48 fixture party",
    destination: "Test destination",
    exportDomestic: "DOMESTIC",
    temperatureC: 4,
    status: "DISPATCHED",
  });
  await db.insert(loadingSheetPallets).values([
    {
      id: crypto.randomUUID(),
      loadingSheetId: sheetId,
      palletId: oldPalletId,
      materialId,
      batchId: oldBatchId,
      cartonQty: 30,
      weightKg: 300,
      loadingSequence: 1,
      fifoOverrideReason: null,
    },
    {
      id: crypto.randomUUID(),
      loadingSheetId: sheetId,
      palletId: bulkPalletId,
      materialId,
      batchId: oldBatchId,
      cartonQty: 10,
      weightKg: 100,
      loadingSequence: 2,
      fifoOverrideReason: "Loop 48 fixture override",
    },
  ]);
});

afterAll(async () => {
  await cleanup();
});

describe("GET /api/stock/aging", () => {
  it("returns 401 with no session", async () => {
    currentRole.value = undefined;
    const res = await getAging();
    expect(res.status).toBe(401);
  });

  it("gates on stock.view_ledger - a role without it (R02) is refused", async () => {
    currentRole.value = "R02";
    const res = await getAging();
    expect(res.status).toBe(403);
  });

  it("aging by batch: lists the real OK-status batch, aggregated across its pallets, excludes BULK", async () => {
    currentRole.value = "R01";
    const res = await getAging();
    expect(res.status).toBe(200);
    const body = await res.json();
    const oldEntry = body.agingByBatch.find((b: { batchId: string }) => b.batchId === oldBatchId);
    expect(oldEntry).toBeDefined();
    expect(oldEntry.totalCartons).toBe(30);
    expect(oldEntry.palletCount).toBe(1);
    expect(oldEntry.ageBucket).toBe("90+");

    const newEntry = body.agingByBatch.find((b: { batchId: string }) => b.batchId === newBatchId);
    expect(newEntry).toBeUndefined();
  });

  it("FIFO compliance: real dispatched picks counted, override correctly excluded from compliant", async () => {
    const res = await getAging();
    const body = await res.json();
    expect(body.fifoCompliance.totalDispatchedPicks).toBeGreaterThanOrEqual(2);
    expect(body.fifoCompliance.overriddenPicks).toBeGreaterThanOrEqual(1);
    expect(body.fifoCompliance.compliancePct).not.toBeNull();
  });
});
