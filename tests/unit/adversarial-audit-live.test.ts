import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

/**
 * Adversarial audit (Window 26): negative and arithmetic checks across
 * Inward, Storage, Holds, Outward, Transfers and the Dashboard, run against
 * the real route handlers and the real local D1 file. Same faithful
 * requirePermission/requireRole mock as the other *-live tests, driven by a
 * mutable role. Every fixture is unique per run so results do not depend on
 * rows left behind by earlier runs.
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
  requireCurrentUserId: vi.fn().mockResolvedValue("audit-fixture-user"),
  getCurrentUser: vi.fn(async () => ({ role: currentRole.value, userId: "audit-fixture-user" })),
}));

const { getDb } = await import("@/lib/db");
const schema = await import("../../drizzle/schema");
const { users, materials, warehouses, batches, pallets, palletBatches, locations, stockLedger, receivingSheets, holdRecords } =
  schema;

const { POST: createReceivingSheet } = await import("@/app/api/receiving-sheets/route");
const { PATCH: patchReceivingSheet } = await import("@/app/api/receiving-sheets/[id]/route");
const { POST: addReceivingRow } = await import("@/app/api/receiving-sheets/[id]/pallets/route");
const { POST: confirmWarehouse } = await import("@/app/api/receiving-sheets/[id]/confirm-warehouse/route");
const { POST: confirmPacking } = await import("@/app/api/receiving-sheets/[id]/confirm-packing/route");
const { POST: putaway } = await import("@/app/api/storage/putaway/route");
const { POST: createLoadingSheet } = await import("@/app/api/loading-sheets/route");
const { POST: pickLoading } = await import("@/app/api/loading-sheets/[id]/pallets/route");
const { POST: createTransfer } = await import("@/app/api/transfer-orders/route");
const { POST: pickTransfer } = await import("@/app/api/transfer-orders/[id]/pallets/route");
const { POST: loadTransfer } = await import("@/app/api/transfer-orders/[id]/load/route");
const { POST: dispatchTransfer } = await import("@/app/api/transfer-orders/[id]/dispatch/route");
const { POST: receiveTransfer } = await import("@/app/api/transfer-orders/[id]/receive/route");
const { POST: createHold } = await import("@/app/api/holds/route");
const { POST: releaseHold } = await import("@/app/api/holds/[id]/release/route");
const { GET: getDashboard } = await import("@/app/api/dashboard/route");

const db = getDb();
const RUN = Date.now().toString(36).toUpperCase();
const USER_ID = "audit-fixture-user";

function post(url: string, body: unknown) {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function patch(url: string, body: unknown) {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function call(as: string, res: Promise<Response> | (() => Promise<Response>)) {
  currentRole.value = as;
  const response = await (typeof res === "function" ? res() : res);
  return { status: response.status, body: await response.json() };
}

let seq = 0;
const uniq = (prefix: string) => `${prefix}-${RUN}-${++seq}`;
// 4-digit batch sequence, unique within this run.
const batchSeq = () => String(1000 + ((Date.now() + ++seq * 37) % 9000)).slice(-4);

async function ensureMaterial(code: string, kgPerCarton = 10, limitKg = 1000): Promise<string> {
  const [existing] = await db.select().from(materials).where(eq(materials.code, code));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(materials).values({
    id,
    code,
    description: `Audit fixture ${code}`,
    uomKgPerCarton: kgPerCarton,
    category: "TEST",
    palletWeightLimitKg: limitKg,
    palletType: "CARTON",
    plantOrigin: "LIMBASI",
  });
  return id;
}

async function ensureWarehouse(code: string): Promise<string> {
  const [existing] = await db.select().from(warehouses).where(eq(warehouses.code, code));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(warehouses).values({
    id,
    code,
    name: `Audit fixture ${code}`,
    type: "OWN",
    plant: "LIMBASI",
    sapCode: "LMFGA",
    locationStructure: "RACK",
  });
  return id;
}

async function makeBatch(materialId: string, productionDate: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(batches).values({
    id,
    batchNumber: `L26A01${RUN}${++seq}`,
    materialId,
    productionDate,
    productionLine: "FF",
    shift: "A",
  });
  return id;
}

async function makePallet(opts: {
  materialId: string;
  batchId: string;
  status: string;
  warehouseId: string;
  cartons?: number;
}): Promise<string> {
  const id = crypto.randomUUID();
  const cartons = opts.cartons ?? 10;
  await db.insert(pallets).values({
    id,
    palletNumber: uniq("AUD-P"),
    palletType: "PLASTIC",
    materialId: opts.materialId,
    statusCode: opts.status,
    totalWeightKg: cartons * 10,
    totalCartons: cartons,
    currentWarehouseId: opts.warehouseId,
  });
  await db.insert(palletBatches).values({
    id: crypto.randomUUID(),
    palletId: id,
    batchId: opts.batchId,
    cartonQty: cartons,
    weightKg: cartons * 10,
  });
  return id;
}

async function makeLocation(warehouseId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(locations).values({
    id,
    warehouseId,
    coldRoom: "CR1",
    block: "Z",
    position: "9",
    floor: 1,
    fullCode: uniq("AUD-LOC"),
    capacityPallets: 1,
    status: "EMPTY",
  });
  return id;
}

async function newLoadingSheet() {
  const res = await call(
    "R01",
    createLoadingSheet(
      post("/api/loading-sheets", {
        date: "2026-10-12",
        vehicleNumber: uniq("GJ"),
        driverName: "Audit Driver",
        partyName: "Audit Party",
        destination: "Audit City",
        exportDomestic: "DOMESTIC",
        temperatureC: -18,
      })
    )
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.loadingSheet.id as string;
}

async function pick(sheetId: string, palletId: string, overrideReason?: string) {
  return call("R02", () =>
    pickLoading(post(`/api/loading-sheets/${sheetId}/pallets`, { palletId, overrideReason }), { params: { id: sheetId } })
  );
}

async function newTransfer(sourceWarehouseId: string, destinationWarehouseId: string) {
  const res = await call(
    "R03",
    createTransfer(
      post("/api/transfer-orders", { date: "2026-10-12", sourceWarehouseId, destinationWarehouseId, transferType: "NORMAL" })
    )
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.transferOrder.id as string;
}

async function newReceivingSheet(materialId: string, batchNumber: string, extra: Record<string, unknown> = {}) {
  return call(
    "R01",
    createReceivingSheet(
      post("/api/receiving-sheets", { date: "2026-10-12", shift: "A", line: "FF", materialId, batchNumber, ...extra })
    )
  );
}

async function addRow(sheetId: string, palletNumber: string, qty: number, extra: Record<string, unknown> = {}) {
  return call("R01", () =>
    addReceivingRow(post(`/api/receiving-sheets/${sheetId}/pallets`, { palletNumber, qty, receivingTime: "10:00", ...extra }), {
      params: { id: sheetId },
    })
  );
}

async function lock(sheetId: string) {
  const first = await call("R01", () =>
    confirmWarehouse(post(`/api/receiving-sheets/${sheetId}/confirm-warehouse`, {}), { params: { id: sheetId } })
  );
  expect(first.status, JSON.stringify(first.body)).toBe(200);
  return call("R06", () =>
    confirmPacking(post(`/api/receiving-sheets/${sheetId}/confirm-packing`, {}), { params: { id: sheetId } })
  );
}

let whA: string;
let whB: string;
let matMain: string;
let batchMain: string;

beforeAll(async () => {
  const [existingUser] = await db.select().from(users).where(eq(users.id, USER_ID));
  if (!existingUser) {
    await db.insert(users).values({
      id: USER_ID,
      clerkUserId: "audit-fixture-clerk",
      name: "Audit Fixture User",
      email: "audit-fixture@example.test",
      roleId: "R01",
      department: "Warehouse",
      plant: "LIMBASI",
    });
  }
  whA = await ensureWarehouse("AUD-WH-A");
  whB = await ensureWarehouse("AUD-WH-B");
  matMain = await ensureMaterial("LFGAUD001");
  batchMain = await makeBatch(matMain, "2026-01-10");
});

describe("Negative checks that must already hold", () => {
  it("a pallet that does not exist cannot be loaded", async () => {
    const sheet = await newLoadingSheet();
    const res = await pick(sheet, "no-such-pallet");
    expect(res.status).toBe(404);
  });

  it.each(["QC_HOLD", "HOLD", "BULK", "REJECTED"])("a %s pallet cannot be loaded", async (status) => {
    const sheet = await newLoadingSheet();
    const palletId = await makePallet({ materialId: matMain, batchId: batchMain, status, warehouseId: whA });
    const res = await pick(sheet, palletId);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe(`Cannot include ${status} material.`);
  });

  it("a non-QC role cannot release a hold", async () => {
    const res = await call("R01", () => releaseHold(post("/api/holds/x/release", {}), { params: { id: "x" } }));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Only QC role can release holds.");
  });

  it("a receiving sheet for a material that does not exist is refused", async () => {
    const res = await newReceivingSheet("no-such-material", `L26J12${batchSeq()}`);
    expect(res.status).toBe(404);
  });

  it.each([0, -5, 2.5])("a pallet row with quantity %s is refused", async (qty) => {
    const created = await newReceivingSheet(matMain, `L26J12${batchSeq()}`);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const res = await addRow(created.body.receivingSheet.id, uniq("AUD-RP"), qty);
    expect(res.status).toBe(422);
  });

  it("a damaged-carton row without a remark is refused", async () => {
    const created = await newReceivingSheet(matMain, `L26J12${batchSeq()}`);
    const res = await addRow(created.body.receivingSheet.id, uniq("AUD-RP"), 10, { cartonCondition: "DAMAGED" });
    expect(res.status).toBe(422);
  });

  it("an over-weight pallet stops the lock and creates no stock", async () => {
    const created = await newReceivingSheet(matMain, `L26J12${batchSeq()}`);
    const sheetId = created.body.receivingSheet.id;
    const palletNumber = uniq("AUD-RP");
    await addRow(sheetId, palletNumber, 120); // 120 x 10kg = 1200kg > 1000kg
    const res = await lock(sheetId);
    expect(res.status).toBe(422);
    const [sheet] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, sheetId));
    expect(sheet.status).toBe("PENDING_PACKING");
    expect(await db.select().from(pallets).where(eq(pallets.palletNumber, palletNumber))).toHaveLength(0);
  });
});

describe("Inward bugs found in the audit", () => {
  it.each([
    ["L26I350901", "day 35"],
    ["L26B300901", "30 February"],
    ["L26A000901", "day 00"],
  ])("batch %s (%s) is refused - it has no real production date", async (batchNumber) => {
    const res = await newReceivingSheet(matMain, batchNumber);
    expect(res.status).toBe(422);
  });

  it.each(["abc", "2026-02-30", "12-10-2026"])("sheet date %s is refused", async (date) => {
    const res = await newReceivingSheet(matMain, `L26J12${batchSeq()}`, { date });
    expect(res.status).toBe(422);
  });

  it("editing a DRAFT sheet to BULK without a bulk reason is refused", async () => {
    const created = await newReceivingSheet(matMain, `L26J12${batchSeq()}`);
    const id = created.body.receivingSheet.id;
    const res = await call("R01", () =>
      patchReceivingSheet(patch(`/api/receiving-sheets/${id}`, { defaultPalletStatus: "BULK" }), { params: { id } })
    );
    expect(res.status).toBe(422);
    const [sheet] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, id));
    expect(sheet.defaultPalletStatus).toBe("QC_HOLD");
  });

  it("two rows naming the same new pallet cannot jointly exceed the weight limit", async () => {
    const created = await newReceivingSheet(matMain, `L26J12${batchSeq()}`);
    const sheetId = created.body.receivingSheet.id;
    const palletNumber = uniq("AUD-RP");
    await addRow(sheetId, palletNumber, 60);
    await addRow(sheetId, palletNumber, 60); // 1200kg on one physical pallet
    const res = await lock(sheetId);
    expect(res.status).toBe(422);
    expect(await db.select().from(pallets).where(eq(pallets.palletNumber, palletNumber))).toHaveLength(0);
  });

  it("two rows naming the same new pallet become one pallet with a running ledger balance", async () => {
    const created = await newReceivingSheet(matMain, `L26J12${batchSeq()}`);
    const sheetId = created.body.receivingSheet.id;
    const palletNumber = uniq("AUD-RP");
    await addRow(sheetId, palletNumber, 40);
    await addRow(sheetId, palletNumber, 40);
    const res = await lock(sheetId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.receivingSheet.totalQty).toBe(80);

    const rows = await db.select().from(pallets).where(eq(pallets.palletNumber, palletNumber));
    expect(rows).toHaveLength(1);
    expect(rows[0].totalCartons).toBe(80);
    expect(rows[0].totalWeightKg).toBe(800);
    const pb = await db.select().from(palletBatches).where(eq(palletBatches.palletId, rows[0].id));
    expect(pb.map((r) => r.cartonQty)).toEqual([80]);
    const ledger = await db
      .select()
      .from(stockLedger)
      .where(and(eq(stockLedger.palletId, rows[0].id), eq(stockLedger.transactionType, "INWARD")));
    expect(ledger.map((r) => r.qtyAfter).sort((a, b) => a - b)).toEqual([40, 80]);
    expect(ledger.reduce((s, r) => s + r.qtyChange, 0)).toBe(80);
  });
});

describe("Storage bugs found in the audit", () => {
  it("a DISPATCHED pallet cannot be put back into a rack", async () => {
    const palletId = await makePallet({ materialId: matMain, batchId: batchMain, status: "DISPATCHED", warehouseId: whA });
    const locationId = await makeLocation(whA);
    const res = await call("R02", () => putaway(post("/api/storage/putaway", { palletId, locationId })));
    expect(res.status).toBe(422);
    const [loc] = await db.select().from(locations).where(eq(locations.id, locationId));
    expect(loc.status).toBe("EMPTY");
  });

  it("a pallet cannot be put away into another warehouse's rack", async () => {
    const palletId = await makePallet({ materialId: matMain, batchId: batchMain, status: "OK", warehouseId: whA });
    const locationId = await makeLocation(whB);
    const res = await call("R02", () => putaway(post("/api/storage/putaway", { palletId, locationId })));
    expect(res.status).toBe(422);
    const [p] = await db.select().from(pallets).where(eq(pallets.id, palletId));
    expect(p.currentWarehouseId).toBe(whA);
  });

  it("a pallet in its own warehouse can still be put away", async () => {
    const palletId = await makePallet({ materialId: matMain, batchId: batchMain, status: "OK", warehouseId: whA });
    const locationId = await makeLocation(whA);
    const res = await call("R02", () => putaway(post("/api/storage/putaway", { palletId, locationId })));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe("Outward / transfer double-booking found in the audit", () => {
  it("one pallet cannot be picked onto two open loading sheets", async () => {
    const palletId = await makePallet({ materialId: matMain, batchId: batchMain, status: "OK", warehouseId: whA });
    const first = await pick(await newLoadingSheet(), palletId, "audit");
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const second = await pick(await newLoadingSheet(), palletId, "audit");
    expect(second.status).toBe(409);
  });

  it("picking the same pallet twice onto one sheet is a clean 409, not a server error", async () => {
    const palletId = await makePallet({ materialId: matMain, batchId: batchMain, status: "OK", warehouseId: whA });
    const sheet = await newLoadingSheet();
    expect((await pick(sheet, palletId, "audit")).status).toBe(201);
    expect((await pick(sheet, palletId, "audit")).status).toBe(409);
  });

  it("a pallet on an open transfer cannot be loaded for dispatch, and vice versa", async () => {
    const onTransfer = await makePallet({ materialId: matMain, batchId: batchMain, status: "OK", warehouseId: whA });
    const transferId = await newTransfer(whA, whB);
    const picked = await call("R03", () =>
      pickTransfer(post(`/api/transfer-orders/${transferId}/pallets`, { palletId: onTransfer }), { params: { id: transferId } })
    );
    expect(picked.status, JSON.stringify(picked.body)).toBe(201);
    expect((await pick(await newLoadingSheet(), onTransfer, "audit")).status).toBe(409);

    const onSheet = await makePallet({ materialId: matMain, batchId: batchMain, status: "OK", warehouseId: whA });
    expect((await pick(await newLoadingSheet(), onSheet, "audit")).status).toBe(201);
    const second = await call("R03", () =>
      pickTransfer(post(`/api/transfer-orders/${transferId}/pallets`, { palletId: onSheet }), { params: { id: transferId } })
    );
    expect(second.status).toBe(409);
  });
});

describe("FIFO arithmetic found in the audit", () => {
  it("older pallets already picked onto a sheet do not count as 'older stock still available'", async () => {
    const material = await ensureMaterial(`LFGAUDF${RUN}`);
    const oldBatch = await makeBatch(material, "2026-01-01");
    const newBatch = await makeBatch(material, "2026-03-01");
    const old1 = await makePallet({ materialId: material, batchId: oldBatch, status: "OK", warehouseId: whA });
    const old2 = await makePallet({ materialId: material, batchId: oldBatch, status: "OK", warehouseId: whA });
    const old3 = await makePallet({ materialId: material, batchId: oldBatch, status: "OK", warehouseId: whA });
    const newer = await makePallet({ materialId: material, batchId: newBatch, status: "OK", warehouseId: whA });

    const sheet = await newLoadingSheet();
    expect((await pick(sheet, old1)).status).toBe(201);
    expect((await pick(sheet, old2)).status).toBe(201);
    // old3 is still unpicked and older - a real FIFO violation.
    const blocked = await pick(sheet, newer);
    expect(blocked.status).toBe(422);
    expect(blocked.body.error).toBe("FIFO violation - override requires reason.");
    expect((await pick(sheet, old3)).status).toBe(201);
    // Every older pallet is now on this truck - nothing older is left.
    const ok = await pick(sheet, newer);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.pallet.fifoOverrideReason).toBeNull();
  });
});

describe("Transfer ledger arithmetic found in the audit", () => {
  it("a NORMAL transfer moves the cartons out of the source and into the destination", async () => {
    const palletId = await makePallet({ materialId: matMain, batchId: batchMain, status: "OK", warehouseId: whA, cartons: 25 });
    const transferId = await newTransfer(whA, whB);
    const ctx = { params: { id: transferId } };
    expect((await call("R03", () => pickTransfer(post("/x", { palletId }), ctx))).status).toBe(201);
    expect(
      (await call("R03", () => loadTransfer(post("/x", { vehicleNumber: "GJ01", driverName: "Audit" }), ctx))).status
    ).toBe(200);
    expect((await call("R03", () => dispatchTransfer(post("/x", {}), ctx))).status).toBe(200);
    expect((await call("R03", () => receiveTransfer(post("/x", {}), ctx))).status).toBe(200);

    const ledger = await db.select().from(stockLedger).where(eq(stockLedger.referenceId, transferId));
    const out = ledger.find((r) => r.transactionType === "TRANSFER_OUT")!;
    const inn = ledger.find((r) => r.transactionType === "TRANSFER_IN")!;
    expect(out).toMatchObject({ warehouseId: whA, qtyChange: -25, qtyAfter: 0, weightChangeKg: -250, weightAfterKg: 0 });
    expect(inn).toMatchObject({ warehouseId: whB, qtyChange: 25, qtyAfter: 25, weightChangeKg: 250, weightAfterKg: 250 });

    const [moved] = await db.select().from(pallets).where(eq(pallets.id, palletId));
    expect(moved).toMatchObject({ currentWarehouseId: whB, statusCode: "OK", totalCartons: 25 });
  });
});

describe("Hold bugs found in the audit", () => {
  it("a hold cannot list a pallet that does not carry the hold's batch", async () => {
    const otherBatch = await makeBatch(matMain, "2026-02-02");
    const palletId = await makePallet({ materialId: matMain, batchId: otherBatch, status: "QC_HOLD", warehouseId: whA });
    const res = await call(
      "R04",
      createHold(
        post("/api/holds", {
          materialId: matMain,
          batchId: batchMain,
          palletIds: [palletId],
          holdReason: "High Temperature",
          placedByDepartment: "QC",
        })
      )
    );
    expect(res.status).toBe(422);
    const [p] = await db.select().from(pallets).where(eq(pallets.id, palletId));
    expect(p.statusCode).toBe("QC_HOLD");
  });

  it("a partly released hold stays on the dashboard, counting only the pallets still on hold", async () => {
    const batch = await makeBatch(matMain, "2026-02-03");
    const p1 = await makePallet({ materialId: matMain, batchId: batch, status: "QC_HOLD", warehouseId: whA, cartons: 30 });
    const p2 = await makePallet({ materialId: matMain, batchId: batch, status: "QC_HOLD", warehouseId: whA, cartons: 70 });
    const created = await call(
      "R04",
      createHold(
        post("/api/holds", {
          materialId: matMain,
          batchId: batch,
          palletIds: [p1, p2],
          holdReason: "High Temperature",
          placedByDepartment: "QC",
        })
      )
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const holdId = created.body.hold.id as string;

    const before = (await call("R03", () => getDashboard())).body.holdTracking;
    const released = await call("R04", () =>
      releaseHold(post(`/api/holds/${holdId}/release`, { palletIds: [p1] }), { params: { id: holdId } })
    );
    expect(released.status, JSON.stringify(released.body)).toBe(200);
    const [hold] = await db.select().from(holdRecords).where(eq(holdRecords.id, holdId));
    expect(hold.status).toBe("PARTIALLY_RELEASED");

    const after = (await call("R03", () => getDashboard())).body.holdTracking;
    expect(after.activeCount).toBe(before.activeCount);
    expect(before.totalCartons - after.totalCartons).toBe(30);
  });
});
