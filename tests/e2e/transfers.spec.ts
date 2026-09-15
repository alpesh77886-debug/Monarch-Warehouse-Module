import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { materials, warehouses, batches, pallets, palletBatches, transferOrders, transferOrderPallets } from "../../drizzle/schema";

/**
 * Loop 43: browser-level verification of the Inter-Warehouse Transfers
 * screens (SCREEN-007, TASK-009). Same real-persistence + honest-auth-
 * refusal pattern as Loading Sheet/Bulk Management - list/detail reads
 * are ungated (PEN-022 precedent), every mutation (create/pick/load/
 * dispatch/receive/complete) is gated and must be honestly refused in
 * Clerk stub mode. The real transaction logic (including the HOLD_TAG/
 * BULK_TAG status-preservation behavior) is proven separately in
 * tests/unit/transfer-order-live.test.ts, which mocks only the
 * permission check.
 */

const FIXTURE_MATERIAL_CODE = "LFG00045";
const FIXTURE_SOURCE_WH_CODE = "TEST-TO-E2E-SRC-WH";
const FIXTURE_DEST_WH_CODE = "TEST-TO-E2E-DEST-WH";
const FIXTURE_BATCH_NUMBER = "L26I045010";
const FIXTURE_PALLET_NUMBER = "TEST-TO-E2E-PALLET";
const FIXTURE_ORDER_ID = "e2e-transfer-fixture-order";

let fixtureMaterialId: string;
let fixtureSourceWarehouseId: string;
let fixtureDestWarehouseId: string;
let fixtureBatchId: string;
let fixturePalletId: string;

function hasNoHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.describe.configure({ mode: "serial" });

async function cleanup() {
  const db = getDb();
  await db.delete(transferOrderPallets).where(eq(transferOrderPallets.transferOrderId, FIXTURE_ORDER_ID));
  await db.delete(transferOrders).where(eq(transferOrders.id, FIXTURE_ORDER_ID));
}

test.beforeAll(async () => {
  await cleanup();
  const db = getDb();

  const [existingMaterial] = await db.select().from(materials).where(eq(materials.code, FIXTURE_MATERIAL_CODE));
  fixtureMaterialId = existingMaterial
    ? existingMaterial.id
    : await (async () => {
        const id = crypto.randomUUID();
        await db.insert(materials).values({
          id,
          code: FIXTURE_MATERIAL_CODE,
          description: "E2E transfer fixture material (Loop 43)",
          uomKgPerCarton: 10,
          category: "E2E-FIXTURE",
          palletWeightLimitKg: 1000,
          palletType: "CARTON",
          plantOrigin: "LIMBASI",
        });
        return id;
      })();

  async function findOrCreateWarehouse(code: string): Promise<string> {
    const [existing] = await db.select().from(warehouses).where(eq(warehouses.code, code));
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    await db.insert(warehouses).values({
      id,
      code,
      name: `E2E transfer fixture warehouse ${code}`,
      type: "OWN",
      plant: "LIMBASI",
      sapCode: "LMFGA",
      locationStructure: "RACK",
    });
    return id;
  }
  fixtureSourceWarehouseId = await findOrCreateWarehouse(FIXTURE_SOURCE_WH_CODE);
  fixtureDestWarehouseId = await findOrCreateWarehouse(FIXTURE_DEST_WH_CODE);

  const [existingBatch] = await db.select().from(batches).where(eq(batches.batchNumber, FIXTURE_BATCH_NUMBER));
  fixtureBatchId = existingBatch
    ? existingBatch.id
    : await (async () => {
        const id = crypto.randomUUID();
        await db.insert(batches).values({
          id,
          batchNumber: FIXTURE_BATCH_NUMBER,
          materialId: fixtureMaterialId,
          productionDate: "2026-01-10",
          productionLine: "FF",
          shift: "A",
        });
        return id;
      })();

  const [existingPallet] = await db.select().from(pallets).where(eq(pallets.palletNumber, FIXTURE_PALLET_NUMBER));
  if (existingPallet) {
    fixturePalletId = existingPallet.id;
    await db.update(pallets).set({ statusCode: "OK", currentWarehouseId: fixtureSourceWarehouseId }).where(eq(pallets.id, fixturePalletId));
  } else {
    fixturePalletId = crypto.randomUUID();
    await db.insert(pallets).values({
      id: fixturePalletId,
      palletNumber: FIXTURE_PALLET_NUMBER,
      palletType: "PLASTIC",
      materialId: fixtureMaterialId,
      statusCode: "OK",
      totalWeightKg: 100,
      totalCartons: 10,
      currentWarehouseId: fixtureSourceWarehouseId,
    });
  }
  const [existingBatchLink] = await db.select().from(palletBatches).where(eq(palletBatches.palletId, fixturePalletId));
  if (!existingBatchLink) {
    await db.insert(palletBatches).values({ id: crypto.randomUUID(), palletId: fixturePalletId, batchId: fixtureBatchId, cartonQty: 10, weightKg: 100 });
  }

  await db.insert(transferOrders).values({
    id: FIXTURE_ORDER_ID,
    transferNumber: "TO-2026-0915-E2E",
    sourceWarehouseId: fixtureSourceWarehouseId,
    destinationWarehouseId: fixtureDestWarehouseId,
    transferType: "NORMAL",
    status: "PICKED",
  });
  await db.insert(transferOrderPallets).values({
    id: crypto.randomUUID(),
    transferOrderId: FIXTURE_ORDER_ID,
    palletId: fixturePalletId,
    materialId: fixtureMaterialId,
    batchId: fixtureBatchId,
    cartonQty: 10,
    weightKg: 100,
  });
});

test.afterAll(async () => {
  await cleanup();
});

test.describe("Sidebar/bottom nav reaches Transfers", () => {
  test("the operations nav includes a working Transfers link", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Transfers/i }).click();
    await expect(page).toHaveURL(/\/transfers$/);
  });
});

test.describe("Transfers - server-side permission gate (Clerk stub mode)", () => {
  test("a syntactically valid create is honestly refused, not silently accepted", async ({ page }) => {
    await page.goto("/transfers");
    await page.getByLabel("Source warehouse").selectOption({ label: `${FIXTURE_SOURCE_WH_CODE} - E2E transfer fixture warehouse ${FIXTURE_SOURCE_WH_CODE}` });
    await page
      .getByLabel("Destination warehouse")
      .selectOption({ label: `${FIXTURE_DEST_WH_CODE} - E2E transfer fixture warehouse ${FIXTURE_DEST_WH_CODE} (OWN)` });
    await page.getByRole("button", { name: "Create draft transfer order" }).click();

    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
  });
});

test.describe("Transfers list - real persistence (read, ungated per PEN-022)", () => {
  test("lists the real fixture transfer order, readable with no session", async ({ page }) => {
    await page.goto("/transfers");
    const row = page.getByRole("link", { name: /TO-2026-0915-E2E/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Picked")).toBeVisible();
  });
});

test.describe("Transfer detail - real persistence (read, ungated per PEN-022)", () => {
  test("shows an honest error for an unknown transfer id", async ({ page }) => {
    await page.goto("/transfers/does-not-exist");
    await expect(page.getByText(/Transfer order .* not found/i)).toBeVisible();
  });

  test("shows the real PICKED order with its real picked pallet and a load form", async ({ page }) => {
    await page.goto(`/transfers/${FIXTURE_ORDER_ID}`);
    await expect(page.getByText("TO-2026-0915-E2E")).toBeVisible();
    const table = page.getByRole("table");
    await expect(table.getByText(FIXTURE_PALLET_NUMBER)).toBeVisible();
    await expect(table.getByText(FIXTURE_MATERIAL_CODE)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm loading" })).toBeVisible();
  });

  test("mutating (Confirm loading) is honestly refused in Clerk stub mode, not silently accepted", async ({ page }) => {
    await page.goto(`/transfers/${FIXTURE_ORDER_ID}`);
    await page.getByLabel("Vehicle number").fill("GJ01AB1234");
    await page.getByLabel("Driver name").fill("E2E Test Driver");
    await page.getByRole("button", { name: "Confirm loading" }).click();
    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    // Still Picked - the refusal is real, not cosmetic.
    await expect(page.getByText("Picked · NORMAL")).toBeVisible();
  });
});

test.describe("mobile-first behavior (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("no horizontal scroll on Transfers or a transfer order's own detail page", async ({ page }) => {
    await page.goto("/transfers");
    expect(await hasNoHorizontalScroll(page)).toBe(true);

    const button = page.getByRole("button", { name: "Create draft transfer order" });
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(48);

    await page.goto(`/transfers/${FIXTURE_ORDER_ID}`);
    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });
});
