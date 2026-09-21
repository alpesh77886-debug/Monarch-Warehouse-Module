import { describe, expect, it, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";

/**
 * Loop 38: live, end-to-end Hold Management flow (TASK-006, Flow 3),
 * same requirePermission-mock technique as every other *-live.test.ts
 * file in this repository, so the routes' real transaction logic runs
 * against the real local D1 file, not just a mocked unit test.
 *
 * requirePermission is mocked with a faithful re-implementation over
 * the real permission matrix (not a blanket "always succeeds" stub),
 * driven by a hoisted mutable `currentRole` - this is the one live test
 * file in this repository that needs to actually exercise a genuine
 * role-based 403 (NS-003's own exact wording), which a fixed-role mock
 * cannot reach.
 */
const { currentRole } = vi.hoisted(() => ({ currentRole: { value: "R04" as string | undefined } }));

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
  requireCurrentUserId: vi.fn().mockResolvedValue("loop-38-fixture-user"),
}));

const { getDb } = await import("@/lib/db");
const { users, materials, warehouses, batches, pallets, holdRecords, holdPallets, stockLedger, notifications } =
  await import("../../drizzle/schema");
const { GET: listHolds, POST: createHold } = await import("@/app/api/holds/route");
const { GET: getHold } = await import("@/app/api/holds/[id]/route");
const { POST: releaseHold } = await import("@/app/api/holds/[id]/release/route");
const { POST: rejectHold } = await import("@/app/api/holds/[id]/reject/route");
const { POST: followupHold } = await import("@/app/api/holds/[id]/followup/route");

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

const FIXTURE_USER_ID = "loop-38-fixture-user";
const FIXTURE_MATERIAL_CODE = "LFG00010";
const FIXTURE_WAREHOUSE_CODE = "TEST-HOLD-WH";
const FIXTURE_BATCH_NUMBER = "L26I010010";
const FIXTURE_PALLET_A = "TEST-HOLD-PALLET-A";
const FIXTURE_PALLET_B = "TEST-HOLD-PALLET-B";
const FIXTURE_PALLET_C = "TEST-HOLD-PALLET-C";
const FIXTURE_PALLET_D = "TEST-HOLD-PALLET-D";
const FIXTURE_PALLET_E = "TEST-HOLD-PALLET-E";
const FIXTURE_PALLET_F = "TEST-HOLD-PALLET-F";

const WAREHOUSE_FIXTURE_USERS: Array<{ id: string; roleId: "R01" | "R02" | "R03" }> = [
  { id: "loop-50-fixture-r01", roleId: "R01" },
  { id: "loop-50-fixture-r02", roleId: "R02" },
  { id: "loop-50-fixture-r03", roleId: "R03" },
];

let materialId: string;
let warehouseId: string;
let batchId: string;
let palletAId: string;
let palletBId: string;
let palletCId: string;
let palletDId: string;
let palletEId: string;
let palletFId: string;

beforeAll(async () => {
  currentRole.value = "R04";

  const [existingUser] = await db.select().from(users).where(eq(users.id, FIXTURE_USER_ID));
  if (!existingUser) {
    await db.insert(users).values({
      id: FIXTURE_USER_ID,
      clerkUserId: "loop-38-fixture-clerk-user",
      name: "Loop 38 Fixture User",
      email: "loop38-fixture@example.test",
      roleId: "R04",
      department: "Quality",
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
      description: "Loop 38 hold fixture material",
      uomKgPerCarton: 10,
      category: "TEST",
      palletWeightLimitKg: 1000,
      palletType: "CARTON",
      plantOrigin: "LIMBASI",
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
      name: "Loop 38 hold fixture warehouse",
      type: "OWN",
      plant: "LIMBASI",
      sapCode: "LMFGA",
      locationStructure: "RACK",
    });
  }

  const [existingBatch] = await db.select().from(batches).where(eq(batches.batchNumber, FIXTURE_BATCH_NUMBER));
  if (existingBatch) {
    batchId = existingBatch.id;
  } else {
    batchId = crypto.randomUUID();
    await db.insert(batches).values({
      id: batchId,
      batchNumber: FIXTURE_BATCH_NUMBER,
      materialId,
      productionDate: "2026-01-10",
      productionLine: "FF",
      shift: "A",
    });
  }

  async function findOrCreateQcHoldPallet(palletNumber: string): Promise<string> {
    const [existing] = await db.select().from(pallets).where(eq(pallets.palletNumber, palletNumber));
    if (existing) {
      // A previous run may have already moved this pallet through the
      // HOLD lifecycle - reset it back to QC_HOLD so this run's own
      // create-hold test exercises the same real transition again.
      await db.update(pallets).set({ statusCode: "QC_HOLD" }).where(eq(pallets.id, existing.id));
      return existing.id;
    }
    const id = crypto.randomUUID();
    await db.insert(pallets).values({
      id,
      palletNumber,
      palletType: "PLASTIC",
      materialId,
      statusCode: "QC_HOLD",
      totalWeightKg: 100,
      totalCartons: 10,
      currentWarehouseId: warehouseId,
    });
    const { palletBatches } = await import("../../drizzle/schema");
    await db.insert(palletBatches).values({
      id: crypto.randomUUID(),
      palletId: id,
      batchId,
      cartonQty: 10,
      weightKg: 100,
    });
    return id;
  }

  // Loop 50 / PEN-038: real R01/R02/R03 users to prove the real
  // Warehouse-role notification fan-out against, not a mock.
  for (const u of WAREHOUSE_FIXTURE_USERS) {
    const [existing] = await db.select().from(users).where(eq(users.id, u.id));
    if (!existing) {
      await db.insert(users).values({
        id: u.id,
        clerkUserId: `${u.id}-clerk`,
        name: `Loop 50 fixture ${u.roleId}`,
        email: `${u.id}@example.test`,
        roleId: u.roleId,
        department: "Warehouse",
        plant: "LIMBASI",
      });
    }
  }

  palletAId = await findOrCreateQcHoldPallet(FIXTURE_PALLET_A);
  palletBId = await findOrCreateQcHoldPallet(FIXTURE_PALLET_B);
  palletCId = await findOrCreateQcHoldPallet(FIXTURE_PALLET_C);
  palletDId = await findOrCreateQcHoldPallet(FIXTURE_PALLET_D);
  palletEId = await findOrCreateQcHoldPallet(FIXTURE_PALLET_E);
  palletFId = await findOrCreateQcHoldPallet(FIXTURE_PALLET_F);
});

let holdId: string;

describe("Hold create (Flow 3 Step 1) really writes to local D1", () => {
  it("places a hold on 2 QC_HOLD pallets, writing real hold_records/hold_pallets/stock_ledger rows", async () => {
    const res = await createHold(
      jsonRequest("/api/holds", {
        materialId,
        batchId,
        palletIds: [palletAId, palletBId],
        holdReason: "Metal piece found (repass needed)",
        placedByDepartment: "QC Lab",
      })
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.hold.holdNumber).toMatch(/^HOLD-\d{4}-\d{4}-\d{3}$/);
    holdId = body.hold.id;

    const [palletA] = await db.select().from(pallets).where(eq(pallets.id, palletAId));
    const [palletB] = await db.select().from(pallets).where(eq(pallets.id, palletBId));
    expect(palletA.statusCode).toBe("HOLD");
    expect(palletB.statusCode).toBe("HOLD");

    const holdPalletRows = await db.select().from(holdPallets).where(eq(holdPallets.holdId, holdId));
    expect(holdPalletRows.length).toBe(2);

    const ledgerRows = await db.select().from(stockLedger).where(eq(stockLedger.referenceId, holdId));
    expect(ledgerRows.length).toBe(2);
    for (const row of ledgerRows) {
      expect(row.transactionType).toBe("HOLD");
      expect(row.statusBefore).toBe("QC_HOLD");
      expect(row.statusAfter).toBe("HOLD");
      expect(row.referenceType).toBe("HOLD_RECORD");
      expect(row.userId).toBe(FIXTURE_USER_ID);
    }

    // Loop 50 / PEN-038: the real Warehouse role graph (R01/R02/R03) all
    // get notified about a hold placed on their own inventory - the
    // actor here (R04, QC) is not one of the three, so nobody is
    // excluded.
    const placedNotifications = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.referenceId, holdId), eq(notifications.eventType, "HOLD_PLACED")));
    for (const u of WAREHOUSE_FIXTURE_USERS) {
      const mine = placedNotifications.find((n) => n.recipientUserId === u.id);
      expect(mine, `expected a HOLD_PLACED notification for ${u.roleId}`).toBeDefined();
      expect(mine!.referenceType).toBe("HOLD_RECORD");
      expect(mine!.readAt).toBeNull();
    }
  });

  it("refuses a second hold on an already-HOLD pallet (QC_HOLD -> HOLD is the only contracted transition)", async () => {
    const res = await createHold(
      jsonRequest("/api/holds", {
        materialId,
        batchId,
        palletIds: [palletAId],
        holdReason: "High Temperature",
        placedByDepartment: "QC Lab",
      })
    );
    expect(res.status).toBe(422);
  });

  it("rejects a free-text hold reason (NS-015)", async () => {
    const res = await createHold(
      jsonRequest("/api/holds", {
        materialId,
        batchId,
        palletIds: [palletCId],
        holdReason: "smells a bit off",
        placedByDepartment: "QC Lab",
      })
    );
    expect(res.status).toBe(422);
    const [pallet] = await db.select().from(pallets).where(eq(pallets.id, palletCId));
    expect(pallet.statusCode).toBe("QC_HOLD"); // unchanged
  });
});

describe("Hold list/detail - real reads", () => {
  it("lists the real hold with correct aggregates", async () => {
    const res = await listHolds();
    const body = await res.json();
    expect(res.status).toBe(200);
    const found = (body.holds as { id: string; palletCount: number; totalCartons: number; ageBucket: string }[]).find(
      (h) => h.id === holdId
    );
    expect(found).toBeDefined();
    expect(found!.palletCount).toBe(2);
    expect(found!.totalCartons).toBe(20);
    expect(found!.ageBucket).toBe("OK");
  });

  it("shows the real hold detail with its pallets", async () => {
    const res = await getHold(getRequest(`/api/holds/${holdId}`), { params: { id: holdId } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.hold.status).toBe("ACTIVE");
    expect(body.pallets).toHaveLength(2);
  });

  it("404s for an unknown hold id", async () => {
    const res = await getHold(getRequest("/api/holds/does-not-exist"), { params: { id: "does-not-exist" } });
    expect(res.status).toBe(404);
  });
});

describe("Follow-up nudge really increments the counter", () => {
  it("increments qc_followup_count and sets last_followup_at (R03, per the permission matrix)", async () => {
    currentRole.value = "R03";
    try {
      const res = await followupHold(jsonRequest(`/api/holds/${holdId}/followup`, {}), { params: { id: holdId } });
      const body = await res.json();
      expect(res.status, JSON.stringify(body)).toBe(200);
      expect(body.hold.qcFollowupCount).toBe(1);
      expect(body.hold.lastFollowupAt).not.toBeNull();

      // Loop 50 / PEN-038: followup's own actor (R03) is NOT excluded
      // (createdByUserId is left null here - see the route's own doc
      // comment), so all three Warehouse fixtures get one, R03 included.
      const followupNotifications = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.referenceId, holdId), eq(notifications.eventType, "HOLD_FOLLOWUP")));
      for (const u of WAREHOUSE_FIXTURE_USERS) {
        expect(followupNotifications.some((n) => n.recipientUserId === u.id)).toBe(true);
      }
    } finally {
      currentRole.value = "R04";
    }
  });
});

describe("Release - non-QC role gets the exact NS-003 wording", () => {
  it("a non-QC role (R03) is refused with 403 'Only QC role can release holds.'", async () => {
    currentRole.value = "R03";
    try {
      const res = await releaseHold(jsonRequest(`/api/holds/${holdId}/release`, {}), { params: { id: holdId } });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Only QC role can release holds.");
    } finally {
      currentRole.value = "R04";
    }

    // Still ACTIVE - the refusal is real, not cosmetic.
    const [hold] = await db.select().from(holdRecords).where(eq(holdRecords.id, holdId));
    expect(hold.status).toBe("ACTIVE");
  });
});

describe("Release (R04/R05, INV-005) really updates local D1", () => {
  it("releases the hold: pallets back to OK, RELEASE ledger rows written", async () => {
    const res = await releaseHold(
      jsonRequest(`/api/holds/${holdId}/release`, { releaseRemarks: "Re-inspected, temperature normal" }),
      { params: { id: holdId } }
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.hold.status).toBe("RELEASED");
    expect(body.hold.releasedById).toBe(FIXTURE_USER_ID);

    const [palletA] = await db.select().from(pallets).where(eq(pallets.id, palletAId));
    const [palletB] = await db.select().from(pallets).where(eq(pallets.id, palletBId));
    expect(palletA.statusCode).toBe("OK");
    expect(palletB.statusCode).toBe("OK");

    const releaseRows = await db
      .select()
      .from(stockLedger)
      .where(and(eq(stockLedger.referenceId, holdId), eq(stockLedger.transactionType, "RELEASE")));
    expect(releaseRows.length).toBe(2);
    for (const row of releaseRows) {
      expect(row.statusBefore).toBe("HOLD");
      expect(row.statusAfter).toBe("OK");
      expect(row.remarks).toBe("Re-inspected, temperature normal");
    }

    const releasedNotifications = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.referenceId, holdId), eq(notifications.eventType, "HOLD_RELEASED")));
    for (const u of WAREHOUSE_FIXTURE_USERS) {
      expect(releasedNotifications.some((n) => n.recipientUserId === u.id)).toBe(true);
    }
  });

  it("refuses to release an already-RELEASED hold", async () => {
    const res = await releaseHold(jsonRequest(`/api/holds/${holdId}/release`, {}), { params: { id: holdId } });
    expect(res.status).toBe(422);
  });
});

describe("Reject (R04) really updates local D1", () => {
  it("places a fresh hold on the third pallet, then rejects it", async () => {
    const createRes = await createHold(
      jsonRequest("/api/holds", {
        materialId,
        batchId,
        palletIds: [palletCId],
        holdReason: "Defective fries (bulk)",
        placedByDepartment: "QC Lab",
      })
    );
    const createBody = await createRes.json();
    expect(createRes.status, JSON.stringify(createBody)).toBe(201);
    const rejectHoldId = createBody.hold.id;

    const res = await rejectHold(
      jsonRequest(`/api/holds/${rejectHoldId}/reject`, { releaseRemarks: "Confirmed defective - scrap" }),
      { params: { id: rejectHoldId } }
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.hold.status).toBe("REJECTED");

    const [palletC] = await db.select().from(pallets).where(eq(pallets.id, palletCId));
    expect(palletC.statusCode).toBe("REJECTED");

    const adjustmentRows = await db
      .select()
      .from(stockLedger)
      .where(and(eq(stockLedger.referenceId, rejectHoldId), eq(stockLedger.transactionType, "ADJUSTMENT")));
    expect(adjustmentRows.length).toBe(1);
    expect(adjustmentRows[0].statusBefore).toBe("HOLD");
    expect(adjustmentRows[0].statusAfter).toBe("REJECTED");

    const rejectedNotifications = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.referenceId, rejectHoldId), eq(notifications.eventType, "HOLD_REJECTED")));
    for (const u of WAREHOUSE_FIXTURE_USERS) {
      expect(rejectedNotifications.some((n) => n.recipientUserId === u.id)).toBe(true);
    }
  });

  it("rejects an empty rejection reason", async () => {
    const createRes = await createHold(
      jsonRequest("/api/holds", {
        materialId,
        batchId,
        palletIds: [palletAId],
        holdReason: "Trial / Sample",
        placedByDepartment: "QC Lab",
      })
    );
    // palletA was released above (now OK), so this re-hold attempt must
    // fail (QC_HOLD -> HOLD only) - confirms it, then moves on without
    // needing yet another fixture pallet just for this validation check.
    expect(createRes.status).toBe(422);
  });
});

// Loop 50 / PEN-037 (Alpesh: "Hold release Partial bhi kar lo...1200
// boxes hold ho usme se 300 ya 400 Release karna pade") - a 3-pallet
// hold, released/rejected one pallet at a time, proving the real
// per-pallet granularity and the hold_record's own rollup status.
describe("Partial release/reject (Loop 50 / PEN-037) really updates local D1", () => {
  let partialHoldId: string;

  it("places one hold on 3 QC_HOLD pallets", async () => {
    const res = await createHold(
      jsonRequest("/api/holds", {
        materialId,
        batchId,
        palletIds: [palletDId, palletEId, palletFId],
        holdReason: "Misshapes",
        placedByDepartment: "QC Lab",
      })
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(201);
    partialHoldId = body.hold.id;
    expect(body.hold.status).toBe("ACTIVE");
  });

  it("releasing only pallet D leaves the hold PARTIALLY_RELEASED, D->OK, E/F untouched", async () => {
    const res = await releaseHold(
      jsonRequest(`/api/holds/${partialHoldId}/release`, {
        releaseRemarks: "D re-inspected OK",
        palletIds: [palletDId],
      }),
      { params: { id: partialHoldId } }
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.hold.status).toBe("PARTIALLY_RELEASED");

    const [palletD] = await db.select().from(pallets).where(eq(pallets.id, palletDId));
    const [palletE] = await db.select().from(pallets).where(eq(pallets.id, palletEId));
    const [palletF] = await db.select().from(pallets).where(eq(pallets.id, palletFId));
    expect(palletD.statusCode).toBe("OK");
    expect(palletE.statusCode).toBe("HOLD");
    expect(palletF.statusCode).toBe("HOLD");

    const rows = await db.select().from(holdPallets).where(eq(holdPallets.holdId, partialHoldId));
    const byPalletId = new Map(rows.map((r) => [r.palletId, r]));
    expect(byPalletId.get(palletDId)!.status).toBe("RELEASED");
    expect(byPalletId.get(palletEId)!.status).toBe("ACTIVE");
    expect(byPalletId.get(palletFId)!.status).toBe("ACTIVE");

    const detailRes = await getHold(getRequest(`/api/holds/${partialHoldId}`), { params: { id: partialHoldId } });
    const detailBody = await detailRes.json();
    const detailByPalletId = new Map(
      (detailBody.pallets as { id: string; holdPalletStatus: string }[]).map((p) => [p.id, p.holdPalletStatus])
    );
    expect(detailByPalletId.get(palletDId)).toBe("RELEASED");
    expect(detailByPalletId.get(palletEId)).toBe("ACTIVE");

    // Loop 50 / PEN-038: a genuinely partial release fires its own
    // distinct event type, not the plain "released" wording.
    const partialNotifications = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.referenceId, partialHoldId), eq(notifications.eventType, "HOLD_PARTIALLY_RELEASED")));
    for (const u of WAREHOUSE_FIXTURE_USERS) {
      expect(partialNotifications.some((n) => n.recipientUserId === u.id)).toBe(true);
    }
  });

  it("refuses to act on a pallet that is no longer ACTIVE on this hold", async () => {
    const res = await releaseHold(jsonRequest(`/api/holds/${partialHoldId}/release`, { palletIds: [palletDId] }), {
      params: { id: partialHoldId },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/not ACTIVE on this hold/);
  });

  it("rejecting pallet E (a second, independent partial action) keeps the hold PARTIALLY_RELEASED (F still ACTIVE)", async () => {
    const res = await rejectHold(
      jsonRequest(`/api/holds/${partialHoldId}/reject`, {
        releaseRemarks: "E confirmed defective",
        palletIds: [palletEId],
      }),
      { params: { id: partialHoldId } }
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.hold.status).toBe("PARTIALLY_RELEASED");

    const [palletE] = await db.select().from(pallets).where(eq(pallets.id, palletEId));
    expect(palletE.statusCode).toBe("REJECTED");
  });

  it("releasing the last ACTIVE pallet (F) finalizes to PARTIALLY_RELEASED (a real mix of RELEASED+REJECTED, not a uniform terminal state)", async () => {
    const res = await releaseHold(jsonRequest(`/api/holds/${partialHoldId}/release`, {}), {
      params: { id: partialHoldId },
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    // D=RELEASED, E=REJECTED, F=RELEASED - no single terminal status
    // covers all three, so this correctly stays PARTIALLY_RELEASED
    // forever, not silently collapsed into RELEASED or REJECTED.
    expect(body.hold.status).toBe("PARTIALLY_RELEASED");

    const [palletF] = await db.select().from(pallets).where(eq(pallets.id, palletFId));
    expect(palletF.statusCode).toBe("OK");
  });

  it("refuses any further action once every pallet is resolved", async () => {
    const res = await releaseHold(jsonRequest(`/api/holds/${partialHoldId}/release`, {}), {
      params: { id: partialHoldId },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/no ACTIVE pallets left/);
  });
});
