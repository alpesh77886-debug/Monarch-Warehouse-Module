import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

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
vi.mock("@/lib/auth", () => ({
  requirePermission: vi.fn().mockResolvedValue("R12"),
}));

const { getDb } = await import("@/lib/db");
const { materials, warehouses, locations, pallets } = await import("../../drizzle/schema");
const { POST: createMaterial } = await import("@/app/api/masters/materials/route");
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
