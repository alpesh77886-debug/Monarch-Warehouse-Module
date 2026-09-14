import { describe, expect, it, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { eq, and, count } from "drizzle-orm";

/**
 * Loop 26: proves the real GET /api/stock/ledger query (join,
 * pagination, transaction_type filter) actually works against real
 * local D1 data - same technique as tests/unit/mutations-live.test.ts
 * (mock only requirePermission, since Clerk stub mode would otherwise
 * 503 before the query ever runs).
 *
 * Fixture setup is idempotent (find-or-create), not delete-then-create
 * like every other test file's fixtures: stock_ledger is append-only
 * (INV-009, a real DB trigger, not just an app-layer rule - confirmed
 * directly by a run of this test file before this fix, which hit
 * "stock_ledger is append-only. DELETE is not allowed."), and this
 * better-sqlite3 connection has real SQLite foreign-key enforcement on
 * by default (confirmed with `PRAGMA foreign_keys` = 1) - so once a
 * stock_ledger row references a material/batch/pallet/warehouse/user,
 * those rows can never be deleted either. Deleting them between test
 * runs would just fail with a foreign-key error - a genuine, correct
 * consequence of an audit-grade ledger, not a bug to work around.
 */
vi.mock("@/lib/auth", () => ({
  requirePermission: vi.fn().mockResolvedValue("R12"),
}));

const { getDb } = await import("@/lib/db");
const { materials, warehouses, users, batches, pallets, stockLedger, locations } = await import(
  "../../drizzle/schema"
);
const { GET: getLedger } = await import("@/app/api/stock/ledger/route");

function getRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

const db = getDb();

const MATERIAL_CODE = "LFG00005";
const WAREHOUSE_CODE = "TEST-LEDGER-WH";
const USER_CLERK_ID = "test-ledger-user";
const BATCH_NUMBER = "L26I010005";
const PALLET_NUMBER = "TEST-LEDGER-PALLET";

let materialId: string;
let warehouseId: string;
let userId: string;
let batchId: string;
let palletId: string;

async function findOrCreateMaterial(): Promise<string> {
  const [existing] = await db.select().from(materials).where(eq(materials.code, MATERIAL_CODE));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(materials).values({
    id,
    code: MATERIAL_CODE,
    description: "Loop 26 ledger fixture material",
    uomKgPerCarton: 10,
    category: "TEST",
    palletWeightLimitKg: 1000,
    palletType: "CARTON",
    plantOrigin: "LIMBASI",
  });
  return id;
}

async function findOrCreateWarehouse(): Promise<string> {
  const [existing] = await db.select().from(warehouses).where(eq(warehouses.code, WAREHOUSE_CODE));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(warehouses).values({
    id,
    code: WAREHOUSE_CODE,
    name: "Loop 26 ledger fixture warehouse",
    type: "OWN",
    plant: "LIMBASI",
    sapCode: "LMFGA",
    locationStructure: "RACK",
  });
  return id;
}

async function findOrCreateUser(): Promise<string> {
  const [existing] = await db.select().from(users).where(eq(users.clerkUserId, USER_CLERK_ID));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    clerkUserId: USER_CLERK_ID,
    name: "Loop 26 Test User",
    email: "loop26-ledger@example.com",
    roleId: "R01",
    department: "Warehouse",
    plant: "LIMBASI",
  });
  return id;
}

async function findOrCreateBatch(materialIdForBatch: string): Promise<string> {
  const [existing] = await db.select().from(batches).where(eq(batches.batchNumber, BATCH_NUMBER));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(batches).values({
    id,
    batchNumber: BATCH_NUMBER,
    materialId: materialIdForBatch,
    productionDate: "2026-09-01",
    productionLine: "FF",
    shift: "A",
  });
  return id;
}

const PALLET_LOCATION_CODE = "TEST-LEDGER-LOCATION";

/**
 * This pallet is permanent (see the module doc comment above), so it
 * is given a real location here rather than left with none - an
 * unlocated pallet permanently sitting in the shared local D1 file
 * would otherwise show up forever in the Storage/Putaway screen's
 * "awaiting putaway" list, which is a different screen's concern, not
 * something this ledger-read test should leave behind as a side
 * effect for it.
 */
async function findOrCreatePallet(materialIdForPallet: string, warehouseIdForPallet: string): Promise<string> {
  let locationId: string;
  const [existingLocation] = await db
    .select()
    .from(locations)
    .where(eq(locations.fullCode, PALLET_LOCATION_CODE));
  if (existingLocation) {
    locationId = existingLocation.id;
  } else {
    locationId = crypto.randomUUID();
    await db.insert(locations).values({
      id: locationId,
      warehouseId: warehouseIdForPallet,
      coldRoom: "CR1",
      fullCode: PALLET_LOCATION_CODE,
      capacityPallets: 1,
      status: "EMPTY",
      createdAt: new Date().toISOString(),
    });
  }

  const [existing] = await db.select().from(pallets).where(eq(pallets.palletNumber, PALLET_NUMBER));
  if (existing) {
    if (!existing.currentLocationId) {
      await db
        .update(pallets)
        .set({ currentLocationId: locationId })
        .where(eq(pallets.id, existing.id));
      await db
        .update(locations)
        .set({ status: "OCCUPIED", currentPalletId: existing.id })
        .where(eq(locations.id, locationId));
    }
    return existing.id;
  }

  const id = crypto.randomUUID();
  await db.insert(pallets).values({
    id,
    palletNumber: PALLET_NUMBER,
    palletType: "PLASTIC",
    materialId: materialIdForPallet,
    currentLocationId: locationId,
    statusCode: "OK",
    totalWeightKg: 600,
    totalCartons: 60,
    currentWarehouseId: warehouseIdForPallet,
  });
  await db.update(locations).set({ status: "OCCUPIED", currentPalletId: id }).where(eq(locations.id, locationId));
  return id;
}

beforeAll(async () => {
  materialId = await findOrCreateMaterial();
  warehouseId = await findOrCreateWarehouse();
  userId = await findOrCreateUser();
  batchId = await findOrCreateBatch(materialId);
  palletId = await findOrCreatePallet(materialId, warehouseId);

  // Only add the fixture ledger rows once - stock_ledger is
  // append-only, so re-running this file must not keep growing them
  // forever. referenceType is fixed and distinctive enough to count.
  const [{ existingCount }] = await db
    .select({ existingCount: count() })
    .from(stockLedger)
    .where(and(eq(stockLedger.palletId, palletId), eq(stockLedger.referenceType, "MANUAL_MOVE")));

  if (existingCount === 0) {
    for (let i = 0; i < 3; i++) {
      await db.insert(stockLedger).values({
        id: crypto.randomUUID(),
        date: "2026-09-14",
        shift: "A",
        transactionType: "INWARD",
        materialId,
        batchId,
        palletId,
        warehouseId,
        qtyChange: 10,
        qtyAfter: 10 * (i + 1),
        weightChangeKg: 100,
        weightAfterKg: 100 * (i + 1),
        referenceType: "MANUAL_MOVE",
        referenceId: `fixture-${i}`,
        userId,
      });
    }
    for (let i = 0; i < 2; i++) {
      await db.insert(stockLedger).values({
        id: crypto.randomUUID(),
        date: "2026-09-14",
        shift: "A",
        transactionType: "MOVE",
        materialId,
        batchId,
        palletId,
        warehouseId,
        qtyChange: 0,
        qtyAfter: 30,
        weightChangeKg: 0,
        weightAfterKg: 600,
        referenceType: "MANUAL_MOVE",
        referenceId: `fixture-move-${i}`,
        userId,
      });
    }
  }
});

describe("GET /api/stock/ledger - real query against local D1", () => {
  it("returns the fixture entries with the joined material code", async () => {
    const res = await getLedger(getRequest("/api/stock/ledger"));
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.total).toBeGreaterThanOrEqual(5);
    const fixtureRows = body.entries.filter((e: { materialCode: string }) => e.materialCode === MATERIAL_CODE);
    expect(fixtureRows.length).toBeGreaterThan(0);
  });

  it("filters by transaction_type", async () => {
    const res = await getLedger(getRequest("/api/stock/ledger?transactionType=MOVE"));
    const body = await res.json();
    expect(res.status).toBe(200);
    for (const entry of body.entries) {
      expect(entry.transactionType).toBe("MOVE");
    }
  });

  it("paginates with a fixed page size", async () => {
    const res = await getLedger(getRequest("/api/stock/ledger?page=1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.pageSize).toBe(25);
    expect(body.entries.length).toBeLessThanOrEqual(25);
  });
});
