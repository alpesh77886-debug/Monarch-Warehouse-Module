import { describe, expect, it, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

/**
 * Loop 41: live, end-to-end Loading Sheet flow (TASK-008, Flow 5/6).
 * Same requirePermission-mock technique as hold-live.test.ts - a
 * faithful re-implementation over the real permission matrix, driven
 * by a hoisted mutable `currentRole`, so the routes' real transaction
 * logic runs against the real local D1 file. Also mocks requireRole
 * (used only by the dispatch route, which names its actors directly
 * rather than via a permission string - see dispatch/route.ts's own
 * comment) the same faithful way.
 *
 * Covers GS-001 (normal domestic full lifecycle incl. location
 * freeing + stock ledger), GS-005 (export container dispatch),
 * GS-007 (FIFO override), and NS-001/002/008/009/010/013.
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
  requireRole: vi.fn(async (allowedRoles: string[]) => {
    const { ForbiddenError, UnauthorizedError } = await import("../../src/lib/errors");
    const role = currentRole.value;
    if (!role) throw new UnauthorizedError();
    if (!allowedRoles.includes(role)) {
      throw new ForbiddenError(`Role ${role} is not permitted to perform this action.`);
    }
    return role;
  }),
  requireCurrentUserId: vi.fn().mockResolvedValue("loop-41-fixture-user"),
}));

const { getDb } = await import("@/lib/db");
const { users, materials, warehouses, batches, pallets, palletBatches, locations, loadingSheets, loadingSheetPallets, stockLedger } =
  await import("../../drizzle/schema");
const { GET: getSheet } = await import("@/app/api/loading-sheets/[id]/route");
const { POST: createSheet } = await import("@/app/api/loading-sheets/route");
const { POST: pickPallet } = await import("@/app/api/loading-sheets/[id]/pallets/route");
const { POST: qcApprove } = await import("@/app/api/loading-sheets/[id]/qc-approve/route");
const { POST: loadSheet } = await import("@/app/api/loading-sheets/[id]/load/route");
const { POST: verifySheet } = await import("@/app/api/loading-sheets/[id]/verify/route");
const { POST: gatePass } = await import("@/app/api/loading-sheets/[id]/gate-pass/route");
const { POST: dispatchSheet } = await import("@/app/api/loading-sheets/[id]/dispatch/route");

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

const FIXTURE_USER_ID = "loop-41-fixture-user";
const FIXTURE_WAREHOUSE_CODE = "TEST-LS-WH";
const FIXTURE_LOCATION_CODE = "TEST-LS-LOC-1";

async function findOrCreateMaterial(code: string): Promise<string> {
  const [existing] = await db.select().from(materials).where(eq(materials.code, code));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(materials).values({
    id,
    code,
    description: `Loop 41 loading-sheet fixture material ${code}`,
    uomKgPerCarton: 10,
    category: "TEST",
    palletWeightLimitKg: 1000,
    palletType: "CARTON",
    plantOrigin: "LIMBASI",
  });
  return id;
}

async function findOrCreateBatch(batchNumber: string, materialId: string, productionDate: string): Promise<string> {
  const [existing] = await db.select().from(batches).where(eq(batches.batchNumber, batchNumber));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(batches).values({
    id,
    batchNumber,
    materialId,
    productionDate,
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
    // A previous run may have moved this pallet through the dispatch
    // lifecycle - reset it back to its intended starting state so this
    // run's own transitions are exercised again for real.
    await db
      .update(pallets)
      .set({ statusCode, currentLocationId })
      .where(eq(pallets.id, id));
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
  const [existingBatchLink] = await db.select().from(palletBatches).where(eq(palletBatches.palletId, id));
  if (!existingBatchLink) {
    await db.insert(palletBatches).values({
      id: crypto.randomUUID(),
      palletId: id,
      batchId,
      cartonQty: 10,
      weightKg: 100,
    });
  }
  if (currentLocationId) {
    await db.update(locations).set({ status: "OCCUPIED", currentPalletId: id }).where(eq(locations.id, currentLocationId));
  }
  return id;
}

let warehouseId: string;
let locationId: string;

let materialM1Id: string; // GS-001 domestic normal
let batchM1Id: string;
let palletM1OkId: string;

let materialM2Id: string; // GS-007 FIFO
let batchM2OldId: string;
let batchM2NewId: string;
let palletM2OldId: string;
let palletM2NewId: string;

let materialM3Id: string; // GS-005 export
let batchM3Id: string;
let palletM3OkId: string;

let palletHoldId: string;
let palletRejectedId: string;
let palletQcHoldId: string;

beforeAll(async () => {
  currentRole.value = "R01";

  const [existingUser] = await db.select().from(users).where(eq(users.id, FIXTURE_USER_ID));
  if (!existingUser) {
    await db.insert(users).values({
      id: FIXTURE_USER_ID,
      clerkUserId: "loop-41-fixture-clerk-user",
      name: "Loop 41 Fixture User",
      email: "loop41-fixture@example.test",
      roleId: "R01",
      department: "Warehouse",
      plant: "LIMBASI",
    });
  }

  const [existingWarehouse] = await db.select().from(warehouses).where(eq(warehouses.code, FIXTURE_WAREHOUSE_CODE));
  if (existingWarehouse) {
    warehouseId = existingWarehouse.id;
  } else {
    warehouseId = crypto.randomUUID();
    await db.insert(warehouses).values({
      id: warehouseId,
      code: FIXTURE_WAREHOUSE_CODE,
      name: "Loop 41 loading-sheet fixture warehouse",
      type: "OWN",
      plant: "LIMBASI",
      sapCode: "LMFGA",
      locationStructure: "RACK",
    });
  }

  const [existingLocation] = await db.select().from(locations).where(eq(locations.fullCode, FIXTURE_LOCATION_CODE));
  if (existingLocation) {
    locationId = existingLocation.id;
  } else {
    locationId = crypto.randomUUID();
    await db.insert(locations).values({
      id: locationId,
      warehouseId,
      coldRoom: "CR1",
      block: "A",
      position: "1",
      floor: 1,
      fullCode: FIXTURE_LOCATION_CODE,
      capacityPallets: 1,
      status: "EMPTY",
    });
  }

  materialM1Id = await findOrCreateMaterial("LFG00030");
  batchM1Id = await findOrCreateBatch("L26I030010", materialM1Id, "2026-01-10");
  palletM1OkId = await findOrCreatePallet("TEST-LS-PALLET-M1", materialM1Id, batchM1Id, "OK", warehouseId, locationId);

  materialM2Id = await findOrCreateMaterial("LFG00031");
  batchM2OldId = await findOrCreateBatch("L26I031005", materialM2Id, "2026-01-05");
  batchM2NewId = await findOrCreateBatch("L26I031015", materialM2Id, "2026-01-15");
  palletM2OldId = await findOrCreatePallet("TEST-LS-PALLET-M2-OLD", materialM2Id, batchM2OldId, "OK", warehouseId);
  palletM2NewId = await findOrCreatePallet("TEST-LS-PALLET-M2-NEW", materialM2Id, batchM2NewId, "OK", warehouseId);

  materialM3Id = await findOrCreateMaterial("LFG00032");
  batchM3Id = await findOrCreateBatch("L26I032010", materialM3Id, "2026-01-10");
  palletM3OkId = await findOrCreatePallet("TEST-LS-PALLET-M3", materialM3Id, batchM3Id, "OK", warehouseId);

  palletHoldId = await findOrCreatePallet("TEST-LS-PALLET-HOLD", materialM1Id, batchM1Id, "HOLD", warehouseId);
  palletRejectedId = await findOrCreatePallet("TEST-LS-PALLET-REJECTED", materialM1Id, batchM1Id, "REJECTED", warehouseId);
  palletQcHoldId = await findOrCreatePallet("TEST-LS-PALLET-QCHOLD", materialM1Id, batchM1Id, "QC_HOLD", warehouseId);
});

async function createDraftSheet(vehicle: string, exportDomestic: "EXPORT" | "DOMESTIC") {
  currentRole.value = "R01";
  const res = await createSheet(
    jsonRequest("/api/loading-sheets", {
      date: "2026-02-01",
      vehicleNumber: vehicle,
      driverName: "Test Driver",
      transporter: "Test Transporter",
      partyName: "Test Party",
      destination: "Test Destination",
      exportDomestic,
      temperatureC: -18,
    })
  );
  const body = await res.json();
  expect(res.status, JSON.stringify(body)).toBe(201);
  return body.loadingSheet.id as string;
}

describe("GS-001: normal domestic full lifecycle really writes to local D1", () => {
  let sheetId: string;

  it("creates a DRAFT loading sheet", async () => {
    sheetId = await createDraftSheet("GJ-TEST-0001", "DOMESTIC");
  });

  it("picks the single-batch OK pallet, auto-advancing DRAFT -> STAGING", async () => {
    currentRole.value = "R02";
    const res = await pickPallet(jsonRequest(`/api/loading-sheets/${sheetId}/pallets`, { palletId: palletM1OkId }), {
      params: { id: sheetId },
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(201);

    const getRes = await getSheet(getRequest(`/api/loading-sheets/${sheetId}`), { params: { id: sheetId } });
    const getBody = await getRes.json();
    expect(getBody.loadingSheet.status).toBe("STAGING");
    expect(getBody.pallets).toHaveLength(1);
  });

  it("loads (STAGING -> LOADED), no QC needed for DOMESTIC", async () => {
    currentRole.value = "R02";
    const res = await loadSheet(jsonRequest(`/api/loading-sheets/${sheetId}/load`, {}), { params: { id: sheetId } });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.loadingSheet.status).toBe("LOADED");
    expect(body.loadingSheet.loadedById).toBe(FIXTURE_USER_ID);
  });

  it("verifies (LOADED -> VERIFIED)", async () => {
    currentRole.value = "R01";
    const res = await verifySheet(jsonRequest(`/api/loading-sheets/${sheetId}/verify`, {}), { params: { id: sheetId } });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.loadingSheet.status).toBe("VERIFIED");
    expect(body.loadingSheet.verifiedById).toBe(FIXTURE_USER_ID);
  });

  it("records gate pass (VERIFIED -> GATE_PASSED)", async () => {
    currentRole.value = "R10";
    const res = await gatePass(jsonRequest(`/api/loading-sheets/${sheetId}/gate-pass`, { gatePassNumber: "GP-0001" }), {
      params: { id: sheetId },
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.loadingSheet.status).toBe("GATE_PASSED");
    expect(body.loadingSheet.gatePassNumber).toBe("GP-0001");
  });

  it("dispatches (GATE_PASSED -> DISPATCHED): pallet DISPATCHED, location freed, real DISPATCH ledger row", async () => {
    currentRole.value = "R03";
    const res = await dispatchSheet(jsonRequest(`/api/loading-sheets/${sheetId}/dispatch`, {}), { params: { id: sheetId } });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.loadingSheet.status).toBe("DISPATCHED");

    const [pallet] = await db.select().from(pallets).where(eq(pallets.id, palletM1OkId));
    expect(pallet.statusCode).toBe("DISPATCHED");
    expect(pallet.currentLocationId).toBeNull();

    const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
    expect(location.status).toBe("EMPTY");
    expect(location.currentPalletId).toBeNull();

    const ledgerRows = await db.select().from(stockLedger).where(eq(stockLedger.referenceId, sheetId));
    expect(ledgerRows.length).toBe(1);
    expect(ledgerRows[0].transactionType).toBe("DISPATCH");
    expect(ledgerRows[0].referenceType).toBe("LOADING_SHEET");
    expect(ledgerRows[0].qtyChange).toBe(-10);
    expect(ledgerRows[0].weightChangeKg).toBe(-100);
    expect(ledgerRows[0].statusBefore).toBe("OK");
    expect(ledgerRows[0].statusAfter).toBe("DISPATCHED");
  });

  it("a dispatched sheet is immutable - a further action is refused", async () => {
    currentRole.value = "R02";
    const res = await loadSheet(jsonRequest(`/api/loading-sheets/${sheetId}/load`, {}), { params: { id: sheetId } });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Dispatched loading sheets are immutable.");
  });
});

describe("GS-007 / NS-008: FIFO override on pick", () => {
  let sheetId: string;

  it("creates a DRAFT sheet for the FIFO-fixture material", async () => {
    sheetId = await createDraftSheet("GJ-TEST-0002", "DOMESTIC");
  });

  it("NS-008: refuses to pick the newer batch without an override reason", async () => {
    currentRole.value = "R02";
    const res = await pickPallet(jsonRequest(`/api/loading-sheets/${sheetId}/pallets`, { palletId: palletM2NewId }), {
      params: { id: sheetId },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("FIFO violation - override requires reason.");

    const rows = await db.select().from(loadingSheetPallets).where(eq(loadingSheetPallets.loadingSheetId, sheetId));
    expect(rows.length).toBe(0);
  });

  it("GS-007: picks the newer batch with a logged override reason - real fifo_override_reason row written", async () => {
    currentRole.value = "R02";
    const res = await pickPallet(
      jsonRequest(`/api/loading-sheets/${sheetId}/pallets`, {
        palletId: palletM2NewId,
        overrideReason: "Older batch quarantined for re-inspection - QC approved this dispatch",
      }),
      { params: { id: sheetId } }
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.pallet.fifoOverrideReason).toBe("Older batch quarantined for re-inspection - QC approved this dispatch");
  });

  it("picking the older batch afterward needs no override (nothing older left available)", async () => {
    currentRole.value = "R02";
    const res = await pickPallet(jsonRequest(`/api/loading-sheets/${sheetId}/pallets`, { palletId: palletM2OldId }), {
      params: { id: sheetId },
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.pallet.fifoOverrideReason).toBeNull();
  });
});

describe("GS-005 / NS-013: export container dispatch", () => {
  let sheetId: string;

  it("creates a DRAFT EXPORT sheet and picks the export-fixture pallet", async () => {
    sheetId = await createDraftSheet("GJ-TEST-0003", "EXPORT");
    currentRole.value = "R02";
    const res = await pickPallet(jsonRequest(`/api/loading-sheets/${sheetId}/pallets`, { palletId: palletM3OkId }), {
      params: { id: sheetId },
    });
    expect(res.status).toBe(201);
  });

  it("NS-013: refuses to load an EXPORT sheet without QC container approval", async () => {
    currentRole.value = "R02";
    const res = await loadSheet(jsonRequest(`/api/loading-sheets/${sheetId}/load`, {}), { params: { id: sheetId } });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Export requires QC approval.");
  });

  it("GS-005: QC approves the container, then load/verify/gate-pass/dispatch all succeed", async () => {
    currentRole.value = "R04";
    const qcRes = await qcApprove(
      jsonRequest(`/api/loading-sheets/${sheetId}/qc-approve`, {
        containerNumber: "CONT-0001",
        sealNumber: "SEAL-0001",
        boltNumber: "BOLT-0001",
      }),
      { params: { id: sheetId } }
    );
    const qcBody = await qcRes.json();
    expect(qcRes.status, JSON.stringify(qcBody)).toBe(200);
    expect(qcBody.loadingSheet.qcApprovalById).toBe(FIXTURE_USER_ID);

    currentRole.value = "R02";
    const loadRes = await loadSheet(jsonRequest(`/api/loading-sheets/${sheetId}/load`, {}), { params: { id: sheetId } });
    expect(loadRes.status).toBe(200);

    currentRole.value = "R01";
    const verifyRes = await verifySheet(jsonRequest(`/api/loading-sheets/${sheetId}/verify`, {}), { params: { id: sheetId } });
    expect(verifyRes.status).toBe(200);

    currentRole.value = "R10";
    const gatePassRes = await gatePass(jsonRequest(`/api/loading-sheets/${sheetId}/gate-pass`, { gatePassNumber: "GP-0002" }), {
      params: { id: sheetId },
    });
    expect(gatePassRes.status).toBe(200);

    currentRole.value = "R09";
    const dispatchRes = await dispatchSheet(jsonRequest(`/api/loading-sheets/${sheetId}/dispatch`, {}), { params: { id: sheetId } });
    const dispatchBody = await dispatchRes.json();
    expect(dispatchRes.status, JSON.stringify(dispatchBody)).toBe(200);
    expect(dispatchBody.loadingSheet.status).toBe("DISPATCHED");
  });
});

describe("NS-001 / NS-002 / NS-010: ineligible material cannot be picked", () => {
  let sheetId: string;

  it("creates a DRAFT sheet for the ineligibility checks", async () => {
    sheetId = await createDraftSheet("GJ-TEST-0004", "DOMESTIC");
  });

  it("NS-001: refuses a HOLD pallet", async () => {
    currentRole.value = "R02";
    const res = await pickPallet(jsonRequest(`/api/loading-sheets/${sheetId}/pallets`, { palletId: palletHoldId }), {
      params: { id: sheetId },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Cannot include HOLD material.");
  });

  it("NS-002: refuses a REJECTED pallet", async () => {
    currentRole.value = "R02";
    const res = await pickPallet(jsonRequest(`/api/loading-sheets/${sheetId}/pallets`, { palletId: palletRejectedId }), {
      params: { id: sheetId },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Cannot include REJECTED material.");
  });

  it("NS-010: refuses a QC_HOLD pallet (non-OK status)", async () => {
    currentRole.value = "R02";
    const res = await pickPallet(jsonRequest(`/api/loading-sheets/${sheetId}/pallets`, { palletId: palletQcHoldId }), {
      params: { id: sheetId },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Cannot include QC_HOLD material.");
  });
});

describe("NS-009: gate pass without a verified loading sheet", () => {
  it("refuses a gate pass on a DRAFT sheet with the exact NS-009 wording", async () => {
    const sheetId = await createDraftSheet("GJ-TEST-0005", "DOMESTIC");
    currentRole.value = "R10";
    const res = await gatePass(jsonRequest(`/api/loading-sheets/${sheetId}/gate-pass`, { gatePassNumber: "GP-0003" }), {
      params: { id: sheetId },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/^Gate pass requires linked loading sheet/);
  });
});
