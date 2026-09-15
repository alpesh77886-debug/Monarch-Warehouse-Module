import { describe, expect, it, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";

/**
 * Loop 42: live, end-to-end Bulk Management flow (TASK-007, Flow 3 Step
 * 7 / GS-004 "Bulk Material Flow"). Same requirePermission/requireRole
 * hoisted-currentRole mock technique as hold-live.test.ts and
 * loading-sheet-live.test.ts, driven by the real permission matrix, so
 * the repack route's own requireRole(["R01","R06"]) gate (reusing
 * pallet-status.ts's contracted bulk_repacked actor list) is exercised
 * for real, not bypassed with a fixed always-succeeds role.
 *
 * Covers the full lifecycle GS-004 itself describes: a BULK receiving
 * sheet is created and locked (real BULK-status pallet materializes,
 * reusing the already-built Receiving Sheet flow) -> it ages onto the
 * Bulk dashboard -> repack receipt (BULK -> QC_HOLD + a real
 * BULK_RECEIVE ledger row + a new linked DRAFT receiving sheet) -> the
 * new sheet is completed through the same existing flow -> its own new
 * pallet ends up real and QC_HOLD, honestly demonstrating "traceability"
 * without re-testing normal Receiving Sheet mechanics already covered by
 * receiving-sheet-live.test.ts.
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
  requireCurrentUserId: vi.fn().mockResolvedValue("loop-42-fixture-user"),
}));

const { getDb } = await import("@/lib/db");
const { users, materials, warehouses, receivingSheets, receivingSheetPallets, pallets, stockLedger } =
  await import("../../drizzle/schema");
const { POST: createSheet } = await import("@/app/api/receiving-sheets/route");
const { POST: addPallet } = await import("@/app/api/receiving-sheets/[id]/pallets/route");
const { POST: confirmPacking } = await import("@/app/api/receiving-sheets/[id]/confirm-packing/route");
const { POST: confirmWarehouse } = await import("@/app/api/receiving-sheets/[id]/confirm-warehouse/route");
const { GET: listBulkPallets } = await import("@/app/api/bulk-pallets/route");
const { POST: repackBulkPallet } = await import("@/app/api/bulk-pallets/[id]/repack/route");

function jsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(new URL(url, "http://localhost"), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function getRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

const db = getDb();

const FIXTURE_USER_ID = "loop-42-fixture-user";
const FIXTURE_MATERIAL_CODE = "LFG00041";
const FIXTURE_BATCH_NUMBER = "L26I041010";
const REPACK_BATCH_NUMBER = "L26I041011";

let materialId: string;

async function cleanup() {
  for (const batchNumber of [FIXTURE_BATCH_NUMBER, REPACK_BATCH_NUMBER]) {
    const rows = await db.select().from(receivingSheets).where(eq(receivingSheets.batchNumber, batchNumber));
    for (const r of rows) {
      await db.delete(receivingSheetPallets).where(eq(receivingSheetPallets.receivingSheetId, r.id));
    }
    await db.delete(receivingSheets).where(eq(receivingSheets.batchNumber, batchNumber));
  }
}

beforeAll(async () => {
  currentRole.value = "R01";
  await cleanup();

  const [existingUser] = await db.select().from(users).where(eq(users.id, FIXTURE_USER_ID));
  if (!existingUser) {
    await db.insert(users).values({
      id: FIXTURE_USER_ID,
      clerkUserId: "loop-42-fixture-clerk-user",
      name: "Loop 42 Fixture User",
      email: "loop42-fixture@example.test",
      roleId: "R01",
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
      description: "Loop 42 bulk fixture material",
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
});

let bulkSheetId: string;
let bulkPalletId: string;
let bulkPalletNumber: string;
let repackSheetId: string;
let repackPalletNumber: string;

describe("BULK receiving sheet create + lock really materializes a BULK pallet", () => {
  it("rejects create with defaultPalletStatus=BULK and no bulk reason", async () => {
    currentRole.value = "R01";
    const res = await createSheet(
      jsonRequest("/api/receiving-sheets", "POST", {
        date: "2026-02-01",
        shift: "A",
        line: "FF",
        materialId,
        batchNumber: FIXTURE_BATCH_NUMBER,
        defaultPalletStatus: "BULK",
      })
    );
    expect(res.status).toBe(422);
  });

  it("rejects a bulk reason on a normal QC_HOLD sheet", async () => {
    const res = await createSheet(
      jsonRequest("/api/receiving-sheets", "POST", {
        date: "2026-02-01",
        shift: "B",
        line: "FF",
        materialId,
        batchNumber: FIXTURE_BATCH_NUMBER,
        defaultPalletStatus: "QC_HOLD",
        bulkReason: "Over-production (bulk)",
      })
    );
    expect(res.status).toBe(422);
  });

  it("creates a real BULK DRAFT sheet with a fixed bulk reason", async () => {
    const res = await createSheet(
      jsonRequest("/api/receiving-sheets", "POST", {
        date: "2026-02-01",
        shift: "A",
        line: "FF",
        materialId,
        batchNumber: FIXTURE_BATCH_NUMBER,
        defaultPalletStatus: "BULK",
        bulkReason: "Over-production (bulk)",
      })
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.receivingSheet.bulkReason).toBe("Over-production (bulk)");
    bulkSheetId = body.receivingSheet.id;
    // Pallet numbers are not unique in the pallets table (ENTITY-003 has
    // no such constraint), and this repository's PEN-026 finding means a
    // ledger-referenced pallet from an earlier run of this same suite
    // can never be deleted - so a fixed literal pallet number would be
    // ambiguous across repeated runs. Suffixing with this run's own
    // fresh sheet id (crypto.randomUUID(), guaranteed unique) keeps every
    // run's pallets unambiguous without needing a delete-first fixture.
    bulkPalletNumber = `TEST-BULK-PALLET-${bulkSheetId.slice(0, 8)}`;
  });

  it("adds one pallet row and locks the sheet (packing then warehouse confirm)", async () => {
    const addRes = await addPallet(
      jsonRequest(`/api/receiving-sheets/${bulkSheetId}/pallets`, "POST", {
        palletNumber: bulkPalletNumber,
        qty: 30,
        receivingTime: "10:00",
        cartonCondition: "OK",
      }),
      { params: { id: bulkSheetId } }
    );
    expect(addRes.status, JSON.stringify(await addRes.json())).toBe(201);

    currentRole.value = "R06";
    const packRes = await confirmPacking(jsonRequest(`/api/receiving-sheets/${bulkSheetId}/confirm-packing`, "POST", {}), {
      params: { id: bulkSheetId },
    });
    expect(packRes.status, JSON.stringify(await packRes.json())).toBe(200);

    currentRole.value = "R01";
    const whRes = await confirmWarehouse(
      jsonRequest(`/api/receiving-sheets/${bulkSheetId}/confirm-warehouse`, "POST", {}),
      { params: { id: bulkSheetId } }
    );
    const whBody = await whRes.json();
    expect(whRes.status, JSON.stringify(whBody)).toBe(200);
    expect(whBody.receivingSheet.status).toBe("LOCKED");

    const [palletRow] = await db.select().from(pallets).where(eq(pallets.palletNumber, bulkPalletNumber));
    expect(palletRow).toBeDefined();
    expect(palletRow.statusCode).toBe("BULK");
    bulkPalletId = palletRow.id;
  });
});

describe("Bulk dashboard - real read", () => {
  it("lists the real BULK pallet with its reason and age", async () => {
    const res = await listBulkPallets();
    const body = await res.json();
    expect(res.status).toBe(200);
    const found = (body.bulkPallets as { id: string; bulkReason: string | null; ageBucket: string }[]).find(
      (p) => p.id === bulkPalletId
    );
    expect(found).toBeDefined();
    expect(found!.bulkReason).toBe("Over-production (bulk)");
    expect(found!.ageBucket).toBe("OK");
  });
});

describe("Repack receipt (GS-004) - real transition + real linked sheet", () => {
  it("refuses a role outside [R01, R06] (requireRole, matching pallet-status.ts's own actor list)", async () => {
    currentRole.value = "R04";
    const res = await repackBulkPallet(
      jsonRequest(`/api/bulk-pallets/${bulkPalletId}/repack`, "POST", {
        date: "2026-02-05",
        shift: "A",
        line: "FF",
        batchNumber: REPACK_BATCH_NUMBER,
      }),
      { params: { id: bulkPalletId } }
    );
    expect(res.status).toBe(403);

    const [pallet] = await db.select().from(pallets).where(eq(pallets.id, bulkPalletId));
    expect(pallet.statusCode).toBe("BULK"); // unchanged - the refusal is real
  });

  it("R06 (packing team) repacks: pallet -> QC_HOLD, real BULK_RECEIVE ledger row, location freed, linked DRAFT sheet created", async () => {
    currentRole.value = "R06";
    const res = await repackBulkPallet(
      jsonRequest(`/api/bulk-pallets/${bulkPalletId}/repack`, "POST", {
        date: "2026-02-05",
        shift: "A",
        line: "FF",
        batchNumber: REPACK_BATCH_NUMBER,
      }),
      { params: { id: bulkPalletId } }
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.bulkPallet.statusCode).toBe("QC_HOLD");
    expect(body.receivingSheet.defaultPalletStatus).toBe("QC_HOLD");
    expect(body.receivingSheet.originalBulkPalletId).toBe(bulkPalletId);
    expect(body.receivingSheet.status).toBe("DRAFT");
    repackSheetId = body.receivingSheet.id;
    repackPalletNumber = `TEST-BULK-REPACK-PALLET-${repackSheetId.slice(0, 8)}`;

    const [pallet] = await db.select().from(pallets).where(eq(pallets.id, bulkPalletId));
    expect(pallet.statusCode).toBe("QC_HOLD");
    expect(pallet.currentLocationId).toBeNull();

    const ledgerRows = await db
      .select()
      .from(stockLedger)
      .where(and(eq(stockLedger.referenceId, bulkPalletId), eq(stockLedger.referenceType, "MANUAL_MOVE")));
    expect(ledgerRows.length).toBe(1);
    expect(ledgerRows[0].transactionType).toBe("BULK_RECEIVE");
    expect(ledgerRows[0].statusBefore).toBe("BULK");
    expect(ledgerRows[0].statusAfter).toBe("QC_HOLD");
  });

  it("removed from the Bulk dashboard now that it is QC_HOLD, not BULK", async () => {
    const res = await listBulkPallets();
    const body = await res.json();
    const found = (body.bulkPallets as { id: string }[]).find((p) => p.id === bulkPalletId);
    expect(found).toBeUndefined();
  });

  it("refuses a second repack attempt on the same, now-QC_HOLD pallet (no such transition)", async () => {
    currentRole.value = "R06";
    const res = await repackBulkPallet(
      jsonRequest(`/api/bulk-pallets/${bulkPalletId}/repack`, "POST", {
        date: "2026-02-06",
        shift: "B",
        line: "FF",
        batchNumber: "L26I041099",
      }),
      { params: { id: bulkPalletId } }
    );
    expect(res.status).toBe(422);
  });

  it("the linked repack sheet completes through the ordinary Receiving Sheet flow - new pallet ends up real and QC_HOLD", async () => {
    currentRole.value = "R01";
    const addRes = await addPallet(
      jsonRequest(`/api/receiving-sheets/${repackSheetId}/pallets`, "POST", {
        palletNumber: repackPalletNumber,
        qty: 30,
        receivingTime: "14:00",
        cartonCondition: "OK",
      }),
      { params: { id: repackSheetId } }
    );
    expect(addRes.status, JSON.stringify(await addRes.json())).toBe(201);

    currentRole.value = "R06";
    const packRes = await confirmPacking(
      jsonRequest(`/api/receiving-sheets/${repackSheetId}/confirm-packing`, "POST", {}),
      { params: { id: repackSheetId } }
    );
    expect(packRes.status).toBe(200);

    currentRole.value = "R01";
    const whRes = await confirmWarehouse(
      jsonRequest(`/api/receiving-sheets/${repackSheetId}/confirm-warehouse`, "POST", {}),
      { params: { id: repackSheetId } }
    );
    expect(whRes.status).toBe(200);

    const [newPallet] = await db.select().from(pallets).where(eq(pallets.palletNumber, repackPalletNumber));
    expect(newPallet).toBeDefined();
    expect(newPallet.statusCode).toBe("QC_HOLD"); // "new QC hold", per the flow document
    expect(newPallet.id).not.toBe(bulkPalletId); // a genuinely new pallet, not the original reused
  });
});
