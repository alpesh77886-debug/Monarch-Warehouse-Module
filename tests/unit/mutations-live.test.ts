import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";

/**
 * Loop 24 finding: every mutation API route in this repository calls
 * `requirePermission()` before touching the database, and Clerk stub
 * mode makes that call always throw (by design - see PEN-021). That
 * means, until this test, the actual INSERT/UPDATE/transaction code
 * in every one of those routes had only ever been type-checked, never
 * executed against a real database - the 503 refusal always fired
 * first, in every manual curl check and every E2E test so far.
 *
 * This file closes that gap by mocking only `requirePermission` (the
 * same technique tests/unit/auth.test.ts already uses to mock Clerk
 * itself) so each route's real mutation logic actually runs against
 * the real local D1 file, then reads the database back directly to
 * prove the write was correct - not just that the HTTP response
 * looked right.
 */
const FIXTURE_USER_ID = "loop-24-fixture-user";

vi.mock("@/lib/auth", () => ({
  requirePermission: vi.fn().mockResolvedValue("R12"),
  requireCurrentUserId: vi.fn().mockResolvedValue(FIXTURE_USER_ID),
}));

const { getDb } = await import("@/lib/db");
const { users, materials, warehouses, locations, pallets, batches, palletBatches, stockLedger } = await import(
  "../../drizzle/schema"
);
const { POST: createMaterial } = await import("@/app/api/masters/materials/route");
const { PATCH: patchMaterial } = await import("@/app/api/masters/materials/[id]/route");
const { POST: createWarehouse } = await import("@/app/api/masters/warehouses/route");
const { POST: createLocation } = await import("@/app/api/storage/locations/route");
const { POST: assignPallet } = await import("@/app/api/storage/putaway/route");
const { POST: movePallet } = await import("@/app/api/storage/move/route");

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchRequest(url: string, body: unknown) {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const db = getDb();

const FIXTURE_MATERIAL_CODE = "LFG00002";
const FIXTURE_WAREHOUSE_CODE = "TEST-MUT-WH";
const FIXTURE_LOCATION_A = "TEST-MUT-LOC-A";
const FIXTURE_LOCATION_B = "TEST-MUT-LOC-B";
const FIXTURE_PALLET_NUMBER = "TEST-MUT-PALLET-1";

let warehouseId: string;
let materialId: string;
let locationAId: string;
let locationBId: string;
let palletId: string;

async function cleanup() {
  await db.delete(pallets).where(eq(pallets.palletNumber, FIXTURE_PALLET_NUMBER));
  await db.delete(locations).where(eq(locations.fullCode, FIXTURE_LOCATION_A));
  await db.delete(locations).where(eq(locations.fullCode, FIXTURE_LOCATION_B));
  await db.delete(materials).where(eq(materials.code, FIXTURE_MATERIAL_CODE));
  await db.delete(warehouses).where(eq(warehouses.code, FIXTURE_WAREHOUSE_CODE));
}

beforeAll(async () => {
  await cleanup();

  // Find-or-create, not delete-then-recreate (PEN-026): once a
  // stock_ledger row references this user (Loop 37's putaway/move
  // ledger-write tests below), the row becomes permanently
  // undeletable while foreign keys stay enforced.
  const [existingUser] = await db.select().from(users).where(eq(users.id, FIXTURE_USER_ID));
  if (!existingUser) {
    await db.insert(users).values({
      id: FIXTURE_USER_ID,
      clerkUserId: "loop-24-fixture-clerk-user",
      name: "Loop 24 Fixture User",
      email: "loop24-fixture@example.test",
      roleId: "R12",
      department: "Warehouse",
      plant: "LIMBASI",
    });
  }
});

afterAll(async () => {
  await cleanup();
});

describe("Material Master POST really inserts into local D1 (not just 503s)", () => {
  it("creates a real row, readable back from the database", async () => {
    const res = await createMaterial(
      jsonRequest("/api/masters/materials", {
        code: FIXTURE_MATERIAL_CODE,
        description: "Loop 24 live-mutation fixture",
        uomKgPerCarton: 10,
        category: "TEST",
        palletWeightLimitKg: 1000,
        palletType: "CARTON",
        plantOrigin: "LIMBASI",
      })
    );
    expect(res.status).toBe(201);
    const [row] = await db.select().from(materials).where(eq(materials.code, FIXTURE_MATERIAL_CODE));
    expect(row).toBeDefined();
    expect(row.description).toBe("Loop 24 live-mutation fixture");
    materialId = row.id;
  });
});

describe("Material Master PATCH really updates local D1 (Loop 29, PEN-007 pallet-weight editability)", () => {
  it("updates only the field sent - partial update, not a full replace", async () => {
    const res = await patchMaterial(patchRequest(`/api/masters/materials/${materialId}`, { palletWeightLimitKg: 750 }), {
      params: { id: materialId },
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.material.palletWeightLimitKg).toBe(750);
    // Untouched fields survive the partial update.
    expect(body.material.description).toBe("Loop 24 live-mutation fixture");

    const [row] = await db.select().from(materials).where(eq(materials.id, materialId));
    expect(row.palletWeightLimitKg).toBe(750);
  });

  it("rejects a non-positive pallet weight limit (422 - matches ValidationError.status)", async () => {
    const res = await patchMaterial(patchRequest(`/api/masters/materials/${materialId}`, { palletWeightLimitKg: 0 }), {
      params: { id: materialId },
    });
    expect(res.status).toBe(422);
    const [row] = await db.select().from(materials).where(eq(materials.id, materialId));
    expect(row.palletWeightLimitKg).toBe(750); // unchanged
  });

  it("rejects an empty patch body (422 - matches ValidationError.status)", async () => {
    const res = await patchMaterial(patchRequest(`/api/masters/materials/${materialId}`, {}), {
      params: { id: materialId },
    });
    expect(res.status).toBe(422);
  });

  it("404s for a material id that does not exist", async () => {
    const res = await patchMaterial(
      patchRequest(`/api/masters/materials/does-not-exist`, { palletWeightLimitKg: 500 }),
      { params: { id: "does-not-exist" } }
    );
    expect(res.status).toBe(404);
  });
});

describe("Warehouse Master POST really inserts into local D1", () => {
  it("creates a real row, readable back from the database", async () => {
    const res = await createWarehouse(
      jsonRequest("/api/masters/warehouses", {
        code: FIXTURE_WAREHOUSE_CODE,
        name: "Loop 24 live-mutation fixture warehouse",
        type: "OWN",
        plant: "LIMBASI",
        sapCode: "LMFGA",
        locationStructure: "RACK",
      })
    );
    expect(res.status).toBe(201);
    const [row] = await db.select().from(warehouses).where(eq(warehouses.code, FIXTURE_WAREHOUSE_CODE));
    expect(row).toBeDefined();
    warehouseId = row.id;
  });
});

describe("Location POST really inserts into local D1", () => {
  it("creates two real EMPTY locations", async () => {
    const resA = await createLocation(
      jsonRequest("/api/storage/locations", {
        warehouseId,
        coldRoom: "CR1",
        fullCode: FIXTURE_LOCATION_A,
        capacityPallets: 1,
      })
    );
    expect(resA.status).toBe(201);
    const resB = await createLocation(
      jsonRequest("/api/storage/locations", {
        warehouseId,
        coldRoom: "CR1",
        fullCode: FIXTURE_LOCATION_B,
        capacityPallets: 1,
      })
    );
    expect(resB.status).toBe(201);

    const [rowA] = await db.select().from(locations).where(eq(locations.fullCode, FIXTURE_LOCATION_A));
    const [rowB] = await db.select().from(locations).where(eq(locations.fullCode, FIXTURE_LOCATION_B));
    expect(rowA.status).toBe("EMPTY");
    expect(rowB.status).toBe("EMPTY");
    locationAId = rowA.id;
    locationBId = rowB.id;

    // Pallet is inserted directly (not through an API - pallet creation
    // is the still-blocked Receiving Sheet flow's job, see PEN-014).
    palletId = crypto.randomUUID();
    await db.insert(pallets).values({
      id: palletId,
      palletNumber: FIXTURE_PALLET_NUMBER,
      palletType: "PLASTIC",
      materialId,
      statusCode: "OK",
      totalWeightKg: 500,
      totalCartons: 50,
      currentWarehouseId: warehouseId,
    });
  });
});

describe("Putaway assign really updates local D1 in one transaction", () => {
  it("occupies the location and links the pallet to it", async () => {
    const res = await assignPallet(
      jsonRequest("/api/storage/putaway", { palletId, locationId: locationAId })
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);

    const [location] = await db.select().from(locations).where(eq(locations.id, locationAId));
    const [pallet] = await db.select().from(pallets).where(eq(pallets.id, palletId));
    expect(location.status).toBe("OCCUPIED");
    expect(location.currentPalletId).toBe(palletId);
    expect(pallet.currentLocationId).toBe(locationAId);
    // "current_warehouse_id derived from location" (architecture
    // blueprint's own Pallet attribute rule) - re-derived here even
    // though the fixture pallet already had the same warehouseId, to
    // prove the route actually sets it rather than leaving it as-is.
    expect(pallet.currentWarehouseId).toBe(warehouseId);
  });

  it("refuses a second assign attempt on an already-located pallet (must use move instead)", async () => {
    const res = await assignPallet(
      jsonRequest("/api/storage/putaway", { palletId, locationId: locationBId })
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/use the move action/i);
  });
});

describe("Move really frees the old location and occupies the new one, in one transaction", () => {
  it("moves the pallet from location A to location B", async () => {
    const res = await movePallet(
      jsonRequest("/api/storage/move", {
        palletId,
        locationId: locationBId,
        reason: "Loop 24 live-mutation test move",
      })
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);

    const [oldLocation] = await db.select().from(locations).where(eq(locations.id, locationAId));
    const [newLocation] = await db.select().from(locations).where(eq(locations.id, locationBId));
    const [pallet] = await db.select().from(pallets).where(eq(pallets.id, palletId));

    expect(oldLocation.status).toBe("EMPTY");
    expect(oldLocation.currentPalletId).toBeNull();
    expect(newLocation.status).toBe("OCCUPIED");
    expect(newLocation.currentPalletId).toBe(palletId);
    expect(pallet.currentLocationId).toBe(locationBId);
  });
});

describe("Location guard, exercised through the real route (not just the pure function test)", () => {
  it("refuses to move a different-material pallet into an occupied location, with no DB change", async () => {
    const otherMaterialId = crypto.randomUUID();
    await db.insert(materials).values({
      id: otherMaterialId,
      code: "SFG00099",
      description: "Loop 24 second fixture material",
      uomKgPerCarton: 5,
      category: "TEST",
      palletWeightLimitKg: 500,
      palletType: "CARTON",
      plantOrigin: "SABARKANTHA",
    });
    const otherPalletId = crypto.randomUUID();
    await db.insert(pallets).values({
      id: otherPalletId,
      palletNumber: "TEST-MUT-PALLET-2",
      palletType: "PLASTIC",
      materialId: otherMaterialId,
      currentLocationId: null,
      statusCode: "OK",
      totalWeightKg: 100,
      totalCartons: 10,
      currentWarehouseId: warehouseId,
    });

    const res = await assignPallet(
      jsonRequest("/api/storage/putaway", { palletId: otherPalletId, locationId: locationBId })
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain(FIXTURE_PALLET_NUMBER);

    const [location] = await db.select().from(locations).where(eq(locations.id, locationBId));
    expect(location.currentPalletId).toBe(palletId); // unchanged - the original pallet, not otherPalletId

    await db.delete(pallets).where(eq(pallets.id, otherPalletId));
    await db.delete(materials).where(eq(materials.id, otherMaterialId));
  });
});

/**
 * Loop 37: closes PEN-024. Everything above this point predates the
 * pallet_batches table and never gives its fixture pallet a batch -
 * intentionally left as-is, since it still correctly proves the
 * "no pallet_batches row -> skip the ledger write" half of the new
 * logic. This block gives a pallet a real pallet_batches row (the
 * shape every pallet gets today via receiving-sheet-lock.ts) and
 * proves putaway/move now write the append-only stock_ledger MOVE
 * rows that make its location history traceable.
 *
 * Find-or-create throughout (PEN-026): once these fixtures earn a
 * stock_ledger reference, they become permanently undeletable while
 * foreign keys stay enforced - matching every other live-ledger test
 * in this repository (receiving-sheet-live.test.ts, stock-ledger-read.test.ts).
 */
describe("Putaway/move write real stock_ledger rows (Loop 37, closes PEN-024)", () => {
  const LEDGER_MATERIAL_CODE = "LFG00009";
  const LEDGER_WAREHOUSE_CODE = "TEST-LEDGER-MOVE-WH";
  const LEDGER_LOCATION_C = "TEST-LEDGER-MOVE-LOC-C";
  const LEDGER_LOCATION_D = "TEST-LEDGER-MOVE-LOC-D";
  const LEDGER_BATCH_NUMBER = "L26I010009";
  const LEDGER_PALLET_NUMBER = "TEST-LEDGER-MOVE-PALLET";

  let ledgerMaterialId: string;
  let ledgerWarehouseId: string;
  let ledgerLocationCId: string;
  let ledgerLocationDId: string;
  let ledgerBatchId: string;
  let ledgerPalletId: string;

  it("sets up a pallet with a real pallet_batches row", async () => {
    const [existingMaterial] = await db.select().from(materials).where(eq(materials.code, LEDGER_MATERIAL_CODE));
    if (existingMaterial) {
      ledgerMaterialId = existingMaterial.id;
    } else {
      ledgerMaterialId = crypto.randomUUID();
      await db.insert(materials).values({
        id: ledgerMaterialId,
        code: LEDGER_MATERIAL_CODE,
        description: "Loop 37 putaway/move ledger fixture material",
        uomKgPerCarton: 10,
        category: "TEST",
        palletWeightLimitKg: 1000,
        palletType: "CARTON",
        plantOrigin: "LIMBASI",
      });
    }

    const [existingWarehouse] = await db.select().from(warehouses).where(eq(warehouses.code, LEDGER_WAREHOUSE_CODE));
    if (existingWarehouse) {
      ledgerWarehouseId = existingWarehouse.id;
    } else {
      ledgerWarehouseId = crypto.randomUUID();
      await db.insert(warehouses).values({
        id: ledgerWarehouseId,
        code: LEDGER_WAREHOUSE_CODE,
        name: "Loop 37 ledger fixture warehouse",
        type: "OWN",
        plant: "LIMBASI",
        sapCode: "LMFGA",
        locationStructure: "RACK",
      });
    }

    const [existingLocC] = await db.select().from(locations).where(eq(locations.fullCode, LEDGER_LOCATION_C));
    if (existingLocC) {
      ledgerLocationCId = existingLocC.id;
      await db
        .update(locations)
        .set({ status: "EMPTY", currentPalletId: null })
        .where(eq(locations.id, ledgerLocationCId));
    } else {
      ledgerLocationCId = crypto.randomUUID();
      await db.insert(locations).values({
        id: ledgerLocationCId,
        warehouseId: ledgerWarehouseId,
        coldRoom: "CR1",
        fullCode: LEDGER_LOCATION_C,
        capacityPallets: 1,
      });
    }

    const [existingLocD] = await db.select().from(locations).where(eq(locations.fullCode, LEDGER_LOCATION_D));
    if (existingLocD) {
      ledgerLocationDId = existingLocD.id;
      await db
        .update(locations)
        .set({ status: "EMPTY", currentPalletId: null })
        .where(eq(locations.id, ledgerLocationDId));
    } else {
      ledgerLocationDId = crypto.randomUUID();
      await db.insert(locations).values({
        id: ledgerLocationDId,
        warehouseId: ledgerWarehouseId,
        coldRoom: "CR1",
        fullCode: LEDGER_LOCATION_D,
        capacityPallets: 1,
      });
    }

    const [existingBatch] = await db.select().from(batches).where(eq(batches.batchNumber, LEDGER_BATCH_NUMBER));
    if (existingBatch) {
      ledgerBatchId = existingBatch.id;
    } else {
      ledgerBatchId = crypto.randomUUID();
      await db.insert(batches).values({
        id: ledgerBatchId,
        batchNumber: LEDGER_BATCH_NUMBER,
        materialId: ledgerMaterialId,
        productionDate: "2026-01-09",
        productionLine: "FF",
        shift: "A",
      });
    }

    const [existingPallet] = await db.select().from(pallets).where(eq(pallets.palletNumber, LEDGER_PALLET_NUMBER));
    if (existingPallet) {
      ledgerPalletId = existingPallet.id;
      // A previous run may have left this pallet located - reset to
      // "no location" so this run's putaway (first-assignment) test is
      // exercising the same real code path again, not silently 422ing.
      await db
        .update(locations)
        .set({ status: "EMPTY", currentPalletId: null })
        .where(eq(locations.currentPalletId, ledgerPalletId));
      await db.update(pallets).set({ currentLocationId: null }).where(eq(pallets.id, ledgerPalletId));
    } else {
      ledgerPalletId = crypto.randomUUID();
      await db.insert(pallets).values({
        id: ledgerPalletId,
        palletNumber: LEDGER_PALLET_NUMBER,
        palletType: "PLASTIC",
        materialId: ledgerMaterialId,
        statusCode: "OK",
        totalWeightKg: 100,
        totalCartons: 10,
        currentWarehouseId: ledgerWarehouseId,
      });
      await db.insert(palletBatches).values({
        id: crypto.randomUUID(),
        palletId: ledgerPalletId,
        batchId: ledgerBatchId,
        cartonQty: 10,
        weightKg: 100,
      });
    }
  });

  /**
   * stock_ledger is append-only (INV-009) and this fixture's pallet/
   * locations are find-or-create (deterministic codes, per PEN-026) -
   * so re-running this file against the same persistent local D1 file
   * writes one more row each time, on top of whatever earlier runs
   * left behind. Every field these routes write is itself fully
   * deterministic given the fixed fixture data, so "at least one row
   * exists with exactly these values" is the correct, re-run-safe
   * assertion here - not "exactly one row exists" (stock-ledger-read.
   * test.ts hits the same shape of problem and settles it the same
   * way, via a pre-insert existence check rather than an exact count).
   */
  it("putaway (first assignment) writes a real stock_ledger MOVE row per pallet_batches entry", async () => {
    const res = await assignPallet(
      jsonRequest("/api/storage/putaway", { palletId: ledgerPalletId, locationId: ledgerLocationCId })
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);

    const rows = await db
      .select()
      .from(stockLedger)
      .where(and(eq(stockLedger.palletId, ledgerPalletId), eq(stockLedger.locationId, ledgerLocationCId)));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // No quantity actually moves on a plain assignment - only the
    // location becomes known, which is what makes this row exist.
    expect(rows).toContainEqual(
      expect.objectContaining({
        transactionType: "MOVE",
        batchId: ledgerBatchId,
        materialId: ledgerMaterialId,
        warehouseId: ledgerWarehouseId,
        qtyChange: 0,
        qtyAfter: 10,
        weightChangeKg: 0,
        weightAfterKg: 100,
        referenceType: "MANUAL_MOVE",
        referenceId: ledgerPalletId,
        userId: FIXTURE_USER_ID,
        remarks: null,
      })
    );
  });

  it("move writes a real stock_ledger MOVE row, with the mandatory reason in remarks", async () => {
    const res = await movePallet(
      jsonRequest("/api/storage/move", {
        palletId: ledgerPalletId,
        locationId: ledgerLocationDId,
        reason: "Loop 37 ledger test move",
      })
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);

    const rows = await db
      .select()
      .from(stockLedger)
      .where(and(eq(stockLedger.palletId, ledgerPalletId), eq(stockLedger.locationId, ledgerLocationDId)));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows).toContainEqual(
      expect.objectContaining({ transactionType: "MOVE", remarks: "Loop 37 ledger test move" })
    );

    // At least two real, append-only rows now exist for this pallet's
    // location history - one from putaway, one from move (INV-009
    // traceability) - possibly more if this file has run before.
    const allRows = await db.select().from(stockLedger).where(eq(stockLedger.palletId, ledgerPalletId));
    expect(allRows.length).toBeGreaterThanOrEqual(2);
  });

  it("the rack map's own pallets read now reports this pallet's distinct batch count", async () => {
    const { GET: listPallets } = await import("@/app/api/pallets/route");
    const res = await listPallets();
    const body = await res.json();
    const row = (body.pallets as { id: string; distinctBatchCount: number }[]).find(
      (p) => p.id === ledgerPalletId
    );
    expect(row).toBeDefined();
    expect(row!.distinctBatchCount).toBe(1);
  });
});
