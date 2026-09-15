import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { materials, warehouses, batches, pallets, palletBatches, receivingSheets } from "../../drizzle/schema";

/**
 * Loop 42: browser-level verification of the Bulk Management screen
 * (SCREEN-008, TASK-007). Same real-persistence + honest-auth-refusal
 * pattern as Loading Sheet/Receiving Sheet - the list read is ungated
 * (PEN-022 precedent, see the route's own comment), so real seeded data
 * must be visible with no session; the repack mutation is gated
 * (requireRole(["R01","R06"])) and must be honestly refused in Clerk
 * stub mode. The real transaction logic (transition + ledger + linked
 * sheet) is proven separately in tests/unit/bulk-live.test.ts, which
 * mocks only the permission check.
 */

const FIXTURE_MATERIAL_CODE = "LFG00042";
const FIXTURE_WAREHOUSE_CODE = "TEST-BULK-E2E-WH";
const FIXTURE_BATCH_NUMBER = "L26I042010";
const FIXTURE_PALLET_NUMBER = "TEST-BULK-E2E-PALLET";
const FIXTURE_SHEET_ID = "e2e-bulk-fixture-sheet";

let fixtureMaterialId: string;
let fixtureWarehouseId: string;
let fixtureBatchId: string;
let fixturePalletId: string;

function hasNoHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.describe.configure({ mode: "serial" });

async function cleanup() {
  const db = getDb();
  await db.delete(receivingSheets).where(eq(receivingSheets.id, FIXTURE_SHEET_ID));
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
          description: "E2E bulk fixture material (Loop 42)",
          uomKgPerCarton: 10,
          category: "E2E-FIXTURE",
          palletWeightLimitKg: 1000,
          palletType: "CARTON",
          plantOrigin: "LIMBASI",
        });
        return id;
      })();

  const [existingWarehouse] = await db.select().from(warehouses).where(eq(warehouses.code, FIXTURE_WAREHOUSE_CODE));
  fixtureWarehouseId = existingWarehouse
    ? existingWarehouse.id
    : await (async () => {
        const id = crypto.randomUUID();
        await db.insert(warehouses).values({
          id,
          code: FIXTURE_WAREHOUSE_CODE,
          name: "E2E bulk fixture warehouse",
          type: "OWN",
          plant: "LIMBASI",
          sapCode: "LMFGA",
          locationStructure: "RACK",
        });
        return id;
      })();

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
    await db.update(pallets).set({ statusCode: "BULK" }).where(eq(pallets.id, fixturePalletId));
  } else {
    fixturePalletId = crypto.randomUUID();
    await db.insert(pallets).values({
      id: fixturePalletId,
      palletNumber: FIXTURE_PALLET_NUMBER,
      palletType: "PLASTIC",
      materialId: fixtureMaterialId,
      statusCode: "BULK",
      totalWeightKg: 100,
      totalCartons: 10,
      currentWarehouseId: fixtureWarehouseId,
    });
  }
  const [existingBatchLink] = await db.select().from(palletBatches).where(eq(palletBatches.palletId, fixturePalletId));
  if (!existingBatchLink) {
    await db.insert(palletBatches).values({
      id: crypto.randomUUID(),
      palletId: fixturePalletId,
      batchId: fixtureBatchId,
      cartonQty: 10,
      weightKg: 100,
    });
  }

  // The BULK receiving sheet this pallet "came from" - real row, read
  // by the bulk-pallets route to display the pallet's own bulk_reason
  // (see that route's own comment on the material+batch_number join).
  await db.insert(receivingSheets).values({
    id: FIXTURE_SHEET_ID,
    sheetNumber: "RS-2026-0915-BULKE2E",
    date: "2026-09-15",
    shift: "A",
    line: "FF",
    materialId: fixtureMaterialId,
    batchNumber: FIXTURE_BATCH_NUMBER,
    status: "LOCKED",
    defaultPalletStatus: "BULK",
    bulkReason: "Over-production (bulk)",
  });
});

test.afterAll(async () => {
  await cleanup();
});

test.describe("Sidebar/bottom nav reaches Bulk Management", () => {
  test("the operations nav includes a working Bulk Management link", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Bulk Management/i }).click();
    await expect(page).toHaveURL(/\/bulk$/);
  });
});

test.describe("Bulk Management - real persistence (read, ungated per PEN-022)", () => {
  test("lists the real fixture BULK pallet with its reason, readable with no session", async ({ page }) => {
    await page.goto("/bulk");
    const row = page.getByText(FIXTURE_PALLET_NUMBER).locator("xpath=ancestor::tr");
    await expect(row).toBeVisible();
    await expect(row.getByText("Over-production (bulk)")).toBeVisible();
  });
});

test.describe("Bulk Management - server-side permission gate (Clerk stub mode)", () => {
  test("a syntactically valid repack request is honestly refused, not silently accepted", async ({ page }) => {
    await page.goto("/bulk");
    const row = page.getByText(FIXTURE_PALLET_NUMBER).locator("xpath=ancestor::tr");
    await row.getByRole("button", { name: "Repack Receipt" }).click();

    await page.getByLabel("New batch number").fill("L26I042099");
    await page.getByRole("button", { name: "Create repack receipt" }).click();

    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    // The pallet must still show as pending repack - the refusal is
    // real, not cosmetic.
    await expect(page.getByText(FIXTURE_PALLET_NUMBER)).toBeVisible();
  });
});

test.describe("mobile-first behavior (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("no horizontal scroll on Bulk Management", async ({ page }) => {
    await page.goto("/bulk");
    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });
});
