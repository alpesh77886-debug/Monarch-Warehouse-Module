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
const OVERWEIGHT_BATCH_NUMBER = "L26I070099";
const REUSE_BATCH_A = "L26I070071";
const REUSE_BATCH_B = "L26I070072";
const REUSE_MISMATCH_BATCH = "L26I070073";
const OTHER_MATERIAL_CODE = "LFG00007";
// GS-009's new reuse-by-pallet-number logic (this loop) means a pallet
// number, once locked, is never safely reusable across a SEPARATE test
// run in this shared, ever-growing local D1 file (PEN-026) - reusing a
// fixed string would silently accumulate cartons onto the same real
// pallet run after run until it broke the material's own weight limit
// (found and fixed this loop, not a hypothetical). Every pallet-number
// fixture below is suffixed with a fresh per-process id instead, the
// same uniqueness-not-deletion answer PEN-026 already established for
// undeletable ledger-referenced rows.
const RUN_ID = crypto.randomUUID().slice(0, 8);

let materialId: string;
let warehouseId: string;
let otherMaterialId: string;

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
  for (const batchNumber of [
    FIXTURE_BATCH_NUMBER,
    CANCEL_BATCH_NUMBER,
    OVERWEIGHT_BATCH_NUMBER,
    REUSE_BATCH_A,
    REUSE_BATCH_B,
    REUSE_MISMATCH_BATCH,
  ]) {
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

  const [existingOtherMaterial] = await db.select().from(materials).where(eq(materials.code, OTHER_MATERIAL_CODE));
  if (existingOtherMaterial) {
    otherMaterialId = existingOtherMaterial.id;
  } else {
    const id = crypto.randomUUID();
    await db.insert(materials).values({
      id,
      code: OTHER_MATERIAL_CODE,
      description: "GS-009 mismatch-material fixture",
      uomKgPerCarton: 10,
      category: "TEST",
      palletWeightLimitKg: 1000,
      palletType: "CARTON",
      plantOrigin: "LIMBASI",
    });
    otherMaterialId = id;
  }
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
        palletNumber: `RSLIVE-30673-${RUN_ID}`,
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
        palletNumber: `RSLIVE-30676-${RUN_ID}`,
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
        palletNumber: `RSLIVE-30676-${RUN_ID}`,
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

// TASK-014 (Loop 49): INV-007 / NS-005 - "Pallet weight exceeds limit".
// This project's own audit for TASK-014 found this was never actually
// enforced anywhere until this loop's own fix to receiving-sheet-lock.ts
// - covered here with its own fresh sheet/batch, not folded into the
// file's shared `sheetId` fixture above.
describe("Receiving Sheet - lock refuses an over-limit pallet (NS-005)", () => {
  let overweightSheetId: string;

  it("creates a fresh DRAFT sheet and pallet row that would weigh over the material's own limit", async () => {
    const createRes = await createSheet(
      jsonRequest("/api/receiving-sheets", "POST", {
        date: "2026-09-07",
        shift: "B",
        line: "FF",
        materialId,
        batchNumber: OVERWEIGHT_BATCH_NUMBER,
      })
    );
    const createBody = await createRes.json();
    expect(createRes.status, JSON.stringify(createBody)).toBe(201);
    overweightSheetId = createBody.receivingSheet.id;

    // Fixture material: uomKgPerCarton=10, palletWeightLimitKg=1000 - 101
    // cartons resolves to 1010kg, 10kg over the real limit.
    const addRes = await addPallet(
      jsonRequest(`/api/receiving-sheets/${overweightSheetId}/pallets`, "POST", {
        palletNumber: "OVERWEIGHT-1",
        qty: 101,
        receivingTime: "11:00",
        cartonCondition: "OK",
      }),
      { params: { id: overweightSheetId } }
    );
    expect(addRes.status).toBe(201);
  });

  it("refuses to lock - 422, and writes nothing (NS-005)", async () => {
    await confirmPacking(jsonRequest(`/api/receiving-sheets/${overweightSheetId}/confirm-packing`, "POST", {}), {
      params: { id: overweightSheetId },
    });
    const res = await confirmWarehouse(
      jsonRequest(`/api/receiving-sheets/${overweightSheetId}/confirm-warehouse`, "POST", {}),
      { params: { id: overweightSheetId } }
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(422);
    expect(body.error).toMatch(/1010kg.*1000kg limit/);

    // The guarded closing UPDATE runs the materialization plan check
    // BEFORE it, so a refused lock must leave the sheet un-transitioned.
    const [row] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, overweightSheetId));
    expect(row.status).toBe("PENDING_WAREHOUSE");
    const createdPallet = await db.select().from(pallets).where(eq(pallets.palletNumber, "OVERWEIGHT-1"));
    expect(createdPallet).toHaveLength(0);
  });
});

// GS-009 / PEN-048 closure (Alpesh: "Ek pallet pe 2 batches ek hi
// material ki rakh sakte hai") - proves the real creation path, not just
// the already-existing display logic (tests/e2e/golden-scenarios.spec.ts
// used to only seed this state directly). Two sheets, two different
// batches, same pallet number, same material.
describe("Receiving Sheet - reusing an existing pallet number adds a second batch (GS-009)", () => {
  const REUSE_PALLET_NUMBER = `GS009-LIVE-PALLET-${RUN_ID}`;

  it("first sheet (batch A) locks and creates the pallet fresh", async () => {
    const createRes = await createSheet(
      jsonRequest("/api/receiving-sheets", "POST", {
        date: "2026-09-07",
        shift: "C",
        line: "FF",
        materialId,
        batchNumber: REUSE_BATCH_A,
      })
    );
    const createBody = await createRes.json();
    expect(createRes.status, JSON.stringify(createBody)).toBe(201);
    const sheetAId = createBody.receivingSheet.id;

    await addPallet(
      jsonRequest(`/api/receiving-sheets/${sheetAId}/pallets`, "POST", {
        palletNumber: REUSE_PALLET_NUMBER,
        qty: 50,
        receivingTime: "08:00",
        cartonCondition: "OK",
      }),
      { params: { id: sheetAId } }
    );
    await confirmPacking(jsonRequest(`/api/receiving-sheets/${sheetAId}/confirm-packing`, "POST", {}), {
      params: { id: sheetAId },
    });
    const res = await confirmWarehouse(jsonRequest(`/api/receiving-sheets/${sheetAId}/confirm-warehouse`, "POST", {}), {
      params: { id: sheetAId },
    });
    expect(res.status).toBe(200);

    const [pallet] = await db.select().from(pallets).where(eq(pallets.palletNumber, REUSE_PALLET_NUMBER));
    expect(pallet).toBeDefined();
    expect(pallet.totalCartons).toBe(50);
    expect(pallet.totalWeightKg).toBe(500);
    const batchRows = await db.select().from(palletBatches).where(eq(palletBatches.palletId, pallet.id));
    expect(batchRows).toHaveLength(1);
  });

  it("second sheet (batch B, same material, same pallet number) adds a real second pallet_batches row - not a new pallet", async () => {
    const [firstPallet] = await db.select().from(pallets).where(eq(pallets.palletNumber, REUSE_PALLET_NUMBER));

    const createRes = await createSheet(
      jsonRequest("/api/receiving-sheets", "POST", {
        date: "2026-09-08",
        shift: "C",
        line: "FF",
        materialId,
        batchNumber: REUSE_BATCH_B,
      })
    );
    const createBody = await createRes.json();
    expect(createRes.status, JSON.stringify(createBody)).toBe(201);
    const sheetBId = createBody.receivingSheet.id;

    await addPallet(
      jsonRequest(`/api/receiving-sheets/${sheetBId}/pallets`, "POST", {
        palletNumber: REUSE_PALLET_NUMBER,
        qty: 30,
        receivingTime: "09:00",
        cartonCondition: "OK",
      }),
      { params: { id: sheetBId } }
    );
    await confirmPacking(jsonRequest(`/api/receiving-sheets/${sheetBId}/confirm-packing`, "POST", {}), {
      params: { id: sheetBId },
    });
    const res = await confirmWarehouse(jsonRequest(`/api/receiving-sheets/${sheetBId}/confirm-warehouse`, "POST", {}), {
      params: { id: sheetBId },
    });
    expect(res.status).toBe(200);

    // Exactly one pallet row still exists for this number - not a second,
    // colliding one.
    const allWithThisNumber = await db.select().from(pallets).where(eq(pallets.palletNumber, REUSE_PALLET_NUMBER));
    expect(allWithThisNumber).toHaveLength(1);
    expect(allWithThisNumber[0].id).toBe(firstPallet.id);
    expect(allWithThisNumber[0].totalCartons).toBe(80); // 50 + 30
    expect(allWithThisNumber[0].totalWeightKg).toBe(800);

    const batchRows = await db.select().from(palletBatches).where(eq(palletBatches.palletId, firstPallet.id));
    expect(batchRows).toHaveLength(2);
    const totalFromBatches = batchRows.reduce((sum, r) => sum + r.cartonQty, 0);
    expect(totalFromBatches).toBe(80);

    // Running balance, not a fresh-pallet balance (NS/GS-009 own bug this
    // loop fixed - see receiving-sheet-lock.ts's own doc comment).
    const [ledgerRow] = await db
      .select()
      .from(stockLedger)
      .where(eq(stockLedger.referenceId, sheetBId));
    expect(ledgerRow.qtyAfter).toBe(80);
    expect(ledgerRow.weightAfterKg).toBe(800);
    expect(ledgerRow.statusBefore).toBe("QC_HOLD"); // the existing pallet's own unchanged status
    expect(ledgerRow.statusAfter).toBe("QC_HOLD");
  });

  it("refuses to reuse the pallet number for a DIFFERENT material (INV-006)", async () => {
    const createRes = await createSheet(
      jsonRequest("/api/receiving-sheets", "POST", {
        date: "2026-09-09",
        shift: "C",
        line: "FF",
        materialId: otherMaterialId,
        batchNumber: REUSE_MISMATCH_BATCH,
      })
    );
    const createBody = await createRes.json();
    const sheetId3 = createBody.receivingSheet.id;

    await addPallet(
      jsonRequest(`/api/receiving-sheets/${sheetId3}/pallets`, "POST", {
        palletNumber: REUSE_PALLET_NUMBER,
        qty: 10,
        receivingTime: "10:00",
        cartonCondition: "OK",
      }),
      { params: { id: sheetId3 } }
    );
    await confirmPacking(jsonRequest(`/api/receiving-sheets/${sheetId3}/confirm-packing`, "POST", {}), {
      params: { id: sheetId3 },
    });
    const res = await confirmWarehouse(jsonRequest(`/api/receiving-sheets/${sheetId3}/confirm-warehouse`, "POST", {}), {
      params: { id: sheetId3 },
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(422);
    expect(body.error).toMatch(/INV-006/);

    // Nothing about the real, existing pallet changed.
    const [pallet] = await db.select().from(pallets).where(eq(pallets.palletNumber, REUSE_PALLET_NUMBER));
    expect(pallet.totalCartons).toBe(80);
  });
});
