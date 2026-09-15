import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

/**
 * Live, end-to-end Receiving Sheet flow (Loop 35 / TASK-004) - same
 * requirePermission-mock technique as tests/unit/mutations-live.test.ts,
 * so every route's real transaction logic runs against the real local D1
 * file, not just a mocked unit test. Exercises the full Flow 1 lifecycle:
 * create (DRAFT) -> add pallet rows -> both sides confirm -> LOCKED, then
 * verifies the lock-time materialization (real batch, pallets,
 * pallet_batches, stock_ledger rows) rather than only the HTTP response.
 */
const FIXTURE_USER_ID = "loop-35-fixture-user";

vi.mock("@/lib/auth", () => ({
  requirePermission: vi.fn().mockResolvedValue("R12"),
  requireRole: vi.fn().mockResolvedValue("R12"),
  requireCurrentUserId: vi.fn().mockResolvedValue(FIXTURE_USER_ID),
}));

const { getDb } = await import("@/lib/db");
const { users, materials, warehouses, receivingSheets, receivingSheetPallets, batches, pallets, palletBatches, stockLedger } =
  await import("../../drizzle/schema");
const { POST: createSheet, GET: listSheets } = await import("@/app/api/receiving-sheets/route");
const { PATCH: updateSheet, GET: getSheet } = await import("@/app/api/receiving-sheets/[id]/route");
const { POST: addPallet } = await import("@/app/api/receiving-sheets/[id]/pallets/route");
const { POST: confirmPacking } = await import("@/app/api/receiving-sheets/[id]/confirm-packing/route");
const { POST: confirmWarehouse } = await import("@/app/api/receiving-sheets/[id]/confirm-warehouse/route");
const { POST: cancelSheet } = await import("@/app/api/receiving-sheets/[id]/cancel/route");

function jsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(new URL(url, "http://localhost"), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const db = getDb();

const FIXTURE_MATERIAL_CODE = "LFG00006";
const FIXTURE_BATCH_NUMBER = "L26I070006";
const CANCEL_BATCH_NUMBER = "L26I070060";

let materialId: string;
let warehouseId: string;

/**
 * Only receiving_sheets/receiving_sheet_pallets are ever deleted here.
 * Once a sheet locks, it writes real stock_ledger rows (append-only,
 * INV-009), and stock_ledger's own foreign keys make everything it
 * references - the pallet, the pallet_batches row, the batch, the
 * material, the confirming user - permanently undeletable while foreign
 * keys stay enforced (the same PEN-009/PEN-026 finding this repository's
 * other live tests already accepted, not a new discovery). The fixture
 * material/user are therefore find-or-create, not delete-then-recreate,
 * and any pallets/batch/ledger rows this suite creates are left in
 * place - harmless, clearly-named test data, exactly like every other
 * live-mutation test file in this repository.
 */
async function cleanup() {
  for (const batchNumber of [FIXTURE_BATCH_NUMBER, CANCEL_BATCH_NUMBER]) {
    const rows = await db.select().from(receivingSheets).where(eq(receivingSheets.batchNumber, batchNumber));
    for (const r of rows) {
      await db.delete(receivingSheetPallets).where(eq(receivingSheetPallets.receivingSheetId, r.id));
    }
    await db.delete(receivingSheets).where(eq(receivingSheets.batchNumber, batchNumber));
  }
}

beforeAll(async () => {
  await cleanup();

  // Find-or-create, not delete-then-recreate (PEN-026): once a
  // stock_ledger row references this user, the row becomes permanently
  // undeletable while foreign keys stay enforced.
  const [existingUser] = await db.select().from(users).where(eq(users.id, FIXTURE_USER_ID));
  if (!existingUser) {
    await db.insert(users).values({
      id: FIXTURE_USER_ID,
      clerkUserId: "loop-35-fixture-clerk-user",
      name: "Loop 35 Fixture User",
      email: "loop35-fixture@example.test",
      roleId: "R12",
      department: "Warehouse",
      plant: "LIMBASI",
    });
  }

  const [existingMaterial] = await db.select().from(materials).where(eq(materials.code, FIXTURE_MATERIAL_CODE));
  if (existingMaterial) {
    materialId = existingMaterial.id;
  } else {
    const id = crypto.randomUUID();
    await db.insert(materials).values({
      id,
      code: FIXTURE_MATERIAL_CODE,
      description: "Loop 35 receiving-sheet fixture",
      uomKgPerCarton: 10,
      category: "TEST",
      palletWeightLimitKg: 1000,
      palletType: "CARTON",
      plantOrigin: "LIMBASI",
    });
    materialId = id;
  }

  const [wh] = await db.select().from(warehouses).where(eq(warehouses.plant, "LIMBASI"));
  if (!wh) {
    throw new Error("No LIMBASI warehouse seeded - run npm run db:seed before this test.");
  }
  warehouseId = wh.id;
});

afterAll(async () => {
  await cleanup();
});

let sheetId: string;

describe("Receiving Sheet - create (Flow 1 Step 1)", () => {
  it("creates a real DRAFT sheet with an auto-generated sheet number", async () => {
    const res = await createSheet(
      jsonRequest("/api/receiving-sheets", "POST", {
        date: "2026-09-07",
        shift: "A",
        line: "FF",
        materialId,
        batchNumber: FIXTURE_BATCH_NUMBER,
        defaultPalletStatus: "QC_HOLD",
      })
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.receivingSheet.status).toBe("DRAFT");
    expect(body.receivingSheet.sheetNumber).toMatch(/^RS-2026-0907-\d{3}$/);
    sheetId = body.receivingSheet.id;

    const [row] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, sheetId));
    expect(row).toBeDefined();
    expect(row.materialId).toBe(materialId);
  });

  it("rejects an invalid batch number format (NS-018)", async () => {
    const res = await createSheet(
      jsonRequest("/api/receiving-sheets", "POST", {
        date: "2026-09-07",
        shift: "B",
        line: "FF",
        materialId,
        batchNumber: "NOT-A-BATCH",
      })
    );
    expect(res.status).toBe(422);
  });

  it("rejects a duplicate material+batch+shift sheet (NS-012)", async () => {
    const res = await createSheet(
      jsonRequest("/api/receiving-sheets", "POST", {
        date: "2026-09-07",
        shift: "A",
        line: "FF",
        materialId,
        batchNumber: FIXTURE_BATCH_NUMBER,
      })
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(409);
  });

  it("lists the real sheet", async () => {
    const res = await listSheets();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.receivingSheets.some((s: { id: string }) => s.id === sheetId)).toBe(true);
  });
});

describe("Receiving Sheet - pallet rows (Flow 1 Step 2)", () => {
  it("adds a real pallet row with a running total", async () => {
    const res = await addPallet(
      jsonRequest(`/api/receiving-sheets/${sheetId}/pallets`, "POST", {
        palletNumber: "30673",
        qty: 60,
        receivingTime: "09:40",
        cartonCondition: "OK",
      }),
      { params: { id: sheetId } }
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.pallet.srNo).toBe(1);

    const [sheet] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, sheetId));
    expect(sheet.totalQty).toBe(60);
    expect(sheet.totalBoxes).toBe(1);
  });

  it("requires remarks for a non-OK carton condition (GS-008)", async () => {
    const res = await addPallet(
      jsonRequest(`/api/receiving-sheets/${sheetId}/pallets`, "POST", {
        palletNumber: "30676",
        qty: 60,
        receivingTime: "10:10",
        cartonCondition: "BULGING",
      }),
      { params: { id: sheetId } }
    );
    expect(res.status).toBe(422);
  });

  it("adds a second real pallet row with the dispute-prevention remark", async () => {
    const res = await addPallet(
      jsonRequest(`/api/receiving-sheets/${sheetId}/pallets`, "POST", {
        palletNumber: "30676",
        qty: 60,
        receivingTime: "10:10",
        cartonCondition: "BULGING",
        remarks: "sides bulging",
        temperatureC: -12,
      }),
      { params: { id: sheetId } }
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.pallet.srNo).toBe(2);
  });
});

describe("Receiving Sheet - dual confirmation and lock (Flow 1 Step 3/4)", () => {
  it("packing confirms first: DRAFT -> PENDING_WAREHOUSE", async () => {
    const res = await confirmPacking(
      jsonRequest(`/api/receiving-sheets/${sheetId}/confirm-packing`, "POST", {
        supervisorId: FIXTURE_USER_ID,
      }),
      { params: { id: sheetId } }
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.receivingSheet.status).toBe("PENDING_WAREHOUSE");
    expect(body.receivingSheet.packingConfirmedAt).not.toBeNull();
  });

  it("a second packing confirm on the same sheet is rejected (NS-011's underlying case)", async () => {
    const res = await confirmPacking(
      jsonRequest(`/api/receiving-sheets/${sheetId}/confirm-packing`, "POST", {}),
      { params: { id: sheetId } }
    );
    expect(res.status).toBe(409);
  });

  it("warehouse confirms second: PENDING_WAREHOUSE -> LOCKED, and really materializes batch/pallets/ledger", async () => {
    const res = await confirmWarehouse(
      jsonRequest(`/api/receiving-sheets/${sheetId}/confirm-warehouse`, "POST", {
        executiveId: FIXTURE_USER_ID,
      }),
      { params: { id: sheetId } }
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.receivingSheet.status).toBe("LOCKED");
    expect(body.receivingSheet.totalQty).toBe(120);
    expect(body.receivingSheet.totalBoxes).toBe(2);

    const [batch] = await db.select().from(batches).where(eq(batches.batchNumber, FIXTURE_BATCH_NUMBER));
    expect(batch).toBeDefined();
    expect(batch.materialId).toBe(materialId);
    expect(batch.productionDate).toBe("2026-09-07");
    expect(batch.productionLine).toBe("FF");
    expect(batch.shift).toBe("A");

    // Scoped by this specific sheet's own id (fresh every test run),
    // not by material/batch - both the fixture material and its batch
    // are find-or-create and persist across repeated runs (see cleanup's
    // own comment), so counting "all pallets for this material" would
    // over-count on a second run in the same local D1 file.
    const ledgerRows = await db
      .select()
      .from(stockLedger)
      .where(eq(stockLedger.referenceId, sheetId));
    expect(ledgerRows).toHaveLength(2);
    for (const row of ledgerRows) {
      expect(row.transactionType).toBe("INWARD");
      expect(row.referenceType).toBe("RECEIVING_SHEET");
      expect(row.statusAfter).toBe("QC_HOLD");
    }

    const totalWeight = ledgerRows.reduce((sum, r) => sum + r.weightChangeKg, 0);
    expect(totalWeight).toBe(1200); // 120 cartons x 10 kg/carton

    const createdPalletIds = ledgerRows.map((r) => r.palletId);
    for (const palletId of createdPalletIds) {
      const [p] = await db.select().from(pallets).where(eq(pallets.id, palletId));
      expect(p).toBeDefined();
      expect(p.palletType).toBe("PLASTIC");
      expect(p.statusCode).toBe("QC_HOLD");
      expect(p.currentWarehouseId).toBe(warehouseId);
      expect(p.currentLocationId).toBeNull(); // putaway not yet done

      const [junction] = await db.select().from(palletBatches).where(eq(palletBatches.palletId, palletId));
      expect(junction).toBeDefined();
      expect(junction.batchId).toBe(batch.id);
    }
  });

  it("cannot edit a LOCKED sheet - 403 (NS-006)", async () => {
    const res = await updateSheet(
      jsonRequest(`/api/receiving-sheets/${sheetId}`, "PATCH", { line: "SPECIALITY" }),
      { params: { id: sheetId } }
    );
    expect(res.status).toBe(403);
  });

  it("the real DB trigger also refuses a raw UPDATE on the LOCKED row (INV-008)", async () => {
    await expect(
      db.update(receivingSheets).set({ line: "SPECIALITY" }).where(eq(receivingSheets.id, sheetId))
    ).rejects.toThrow(/append-only|immutable|ABORT/i);
  });

  it("shows the locked sheet with its pallet rows via GET", async () => {
    const res = await getSheet(new NextRequest(new URL(`/api/receiving-sheets/${sheetId}`, "http://localhost")), {
      params: { id: sheetId },
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.receivingSheet.status).toBe("LOCKED");
    expect(body.pallets).toHaveLength(2);
  });
});

// Loop 39 / PEN-033 (Alpesh-approved): DRAFT -> CANCELLED. Uses its own
// fresh sheet (a different batch number) rather than the file's shared
// `sheetId`, which the block above has already driven to LOCKED.
describe("Receiving Sheet - cancel a DRAFT sheet (PEN-033)", () => {
  let cancelSheetId: string;

  it("creates a fresh DRAFT sheet and cancels it", async () => {
    const createRes = await createSheet(
      jsonRequest("/api/receiving-sheets", "POST", {
        date: "2026-09-07",
        shift: "B",
        line: "FF",
        materialId,
        batchNumber: CANCEL_BATCH_NUMBER,
      })
    );
    const createBody = await createRes.json();
    expect(createRes.status, JSON.stringify(createBody)).toBe(201);
    cancelSheetId = createBody.receivingSheet.id;

    const res = await cancelSheet(jsonRequest(`/api/receiving-sheets/${cancelSheetId}/cancel`, "POST", {}), {
      params: { id: cancelSheetId },
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.receivingSheet.status).toBe("CANCELLED");

    const [row] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, cancelSheetId));
    expect(row.status).toBe("CANCELLED");
  });

  it("refuses to cancel an already-cancelled sheet", async () => {
    const res = await cancelSheet(jsonRequest(`/api/receiving-sheets/${cancelSheetId}/cancel`, "POST", {}), {
      params: { id: cancelSheetId },
    });
    expect(res.status).toBe(422);
  });

  it("refuses to cancel a LOCKED sheet (the file's own main fixture)", async () => {
    const res = await cancelSheet(jsonRequest(`/api/receiving-sheets/${sheetId}/cancel`, "POST", {}), {
      params: { id: sheetId },
    });
    expect(res.status).toBe(422);
    const [row] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, sheetId));
    expect(row.status).toBe("LOCKED"); // unchanged
  });

  it("a cancelled sheet cannot be edited via PATCH either", async () => {
    const res = await updateSheet(
      jsonRequest(`/api/receiving-sheets/${cancelSheetId}`, "PATCH", { line: "SPECIALITY" }),
      { params: { id: cancelSheetId } }
    );
    expect(res.status).toBe(422);
  });
});
