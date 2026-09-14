import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { warehouses, materials, locations, pallets } from "../../drizzle/schema";

/**
 * Loop 25: browser-level verification of the Rack Map (SCREEN-003,
 * read-only - no mutation to prove/refuse here, unlike every other
 * storage screen). Colors are asserted through the same data the page
 * itself computes from - see src/lib/rack-map.ts for the pure logic
 * this exercises end to end in a real browser.
 */

const FIXTURE_WAREHOUSE_CODE = "E2E-RACKMAP-WH";
const FIXTURE_MATERIAL_CODE = "LFG00004";
const EMPTY_CODE = "E2E-RACKMAP-EMPTY";
const OK_CODE = "E2E-RACKMAP-OK";
const HOLD_CODE = "E2E-RACKMAP-HOLD";
const BLOCKED_CODE = "E2E-RACKMAP-BLOCKED";

function hasNoHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.describe.configure({ mode: "serial" });

let warehouseId: string;
let materialId: string;

async function cleanup() {
  const db = getDb();
  await db.delete(pallets).where(eq(pallets.palletNumber, "E2E-RACKMAP-PALLET-OK"));
  await db.delete(pallets).where(eq(pallets.palletNumber, "E2E-RACKMAP-PALLET-HOLD"));
  for (const code of [EMPTY_CODE, OK_CODE, HOLD_CODE, BLOCKED_CODE]) {
    await db.delete(locations).where(eq(locations.fullCode, code));
  }
  await db.delete(materials).where(eq(materials.code, FIXTURE_MATERIAL_CODE));
  await db.delete(warehouses).where(eq(warehouses.code, FIXTURE_WAREHOUSE_CODE));
}

test.beforeAll(async () => {
  await cleanup();
  const db = getDb();
  warehouseId = crypto.randomUUID();
  await db.insert(warehouses).values({
    id: warehouseId,
    code: FIXTURE_WAREHOUSE_CODE,
    name: "E2E rack map fixture warehouse",
    type: "OWN",
    plant: "LIMBASI",
    sapCode: "LMFGA",
    locationStructure: "RACK",
    active: 1,
    createdAt: new Date().toISOString(),
  });
  materialId = crypto.randomUUID();
  await db.insert(materials).values({
    id: materialId,
    code: FIXTURE_MATERIAL_CODE,
    description: "E2E rack map fixture material",
    uomKgPerCarton: 10,
    category: "E2E-FIXTURE",
    palletWeightLimitKg: 1000,
    palletType: "CARTON",
    plantOrigin: "LIMBASI",
    active: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // EMPTY and BLOCKED locations need no pallet.
  await db.insert(locations).values([
    {
      id: crypto.randomUUID(),
      warehouseId,
      coldRoom: "CR1",
      block: "E2E",
      position: "E",
      floor: 1,
      fullCode: EMPTY_CODE,
      capacityPallets: 1,
      status: "EMPTY",
      createdAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      warehouseId,
      coldRoom: "CR1",
      block: "E2E",
      position: "X",
      floor: 1,
      fullCode: BLOCKED_CODE,
      capacityPallets: 1,
      status: "BLOCKED",
      createdAt: new Date().toISOString(),
    },
  ]);

  // OCCUPIED (OK) and OCCUPIED (HOLD) locations each need a pallet
  // pointing back at them (FK order: location first, then pallet,
  // then update the location's current_pallet_id).
  const okLocationId = crypto.randomUUID();
  await db.insert(locations).values({
    id: okLocationId,
    warehouseId,
    coldRoom: "CR1",
    block: "E2E",
    position: "O",
    floor: 1,
    fullCode: OK_CODE,
    capacityPallets: 1,
    status: "OCCUPIED",
    createdAt: new Date().toISOString(),
  });
  const okPalletId = crypto.randomUUID();
  await db.insert(pallets).values({
    id: okPalletId,
    palletNumber: "E2E-RACKMAP-PALLET-OK",
    palletType: "PLASTIC",
    materialId,
    currentLocationId: okLocationId,
    statusCode: "OK",
    totalWeightKg: 300,
    totalCartons: 30,
    currentWarehouseId: warehouseId,
  });
  await db.update(locations).set({ currentPalletId: okPalletId }).where(eq(locations.id, okLocationId));

  const holdLocationId = crypto.randomUUID();
  await db.insert(locations).values({
    id: holdLocationId,
    warehouseId,
    coldRoom: "CR1",
    block: "E2E",
    position: "H",
    floor: 1,
    fullCode: HOLD_CODE,
    capacityPallets: 1,
    status: "OCCUPIED",
    createdAt: new Date().toISOString(),
  });
  const holdPalletId = crypto.randomUUID();
  await db.insert(pallets).values({
    id: holdPalletId,
    palletNumber: "E2E-RACKMAP-PALLET-HOLD",
    palletType: "PLASTIC",
    materialId,
    currentLocationId: holdLocationId,
    statusCode: "HOLD",
    totalWeightKg: 200,
    totalCartons: 20,
    currentWarehouseId: warehouseId,
  });
  await db.update(locations).set({ currentPalletId: holdPalletId }).where(eq(locations.id, holdLocationId));
});

test.afterAll(async () => {
  await cleanup();
});

test.describe("Rack Map - real color-coded occupancy from local D1", () => {
  test("renders EMPTY, OCCUPIED/OK, OCCUPIED/HOLD, and BLOCKED with the correct legend color", async ({
    page,
  }) => {
    await page.goto("/storage/rack-map");

    await expect(page.getByRole("button", { name: new RegExp(`^${EMPTY_CODE} - Empty$`) })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`^${OK_CODE} - Full`) })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`^${HOLD_CODE} - Hold`) })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`^${BLOCKED_CODE} - Blocked$`) })).toBeVisible();
  });

  test("clicking a cell opens the real pallet detail popup", async ({ page }) => {
    await page.goto("/storage/rack-map");
    await page.getByRole("button", { name: new RegExp(`^${HOLD_CODE} - Hold`) }).click();

    await expect(page.getByText(HOLD_CODE)).toBeVisible();
    await expect(page.getByText("E2E-RACKMAP-PALLET-HOLD")).toBeVisible();
    await expect(page.getByText(FIXTURE_MATERIAL_CODE)).toBeVisible();
    await expect(page.getByText("Pallet status: HOLD")).toBeVisible();
  });

  test("search highlights only the locations whose occupant matches", async ({ page }) => {
    await page.goto("/storage/rack-map");
    await page.getByPlaceholder("Search material, batch, or pallet number...").fill(FIXTURE_MATERIAL_CODE);

    const okCell = page.getByRole("button", { name: new RegExp(`^${OK_CODE} - Full`) });
    const emptyCell = page.getByRole("button", { name: new RegExp(`^${EMPTY_CODE} - Empty$`) });
    await expect(okCell).toHaveClass(/ring-2/);
    await expect(emptyCell).not.toHaveClass(/ring-2/);
  });
});

test.describe("mobile-first behavior (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("no horizontal scroll on the rack map", async ({ page }) => {
    await page.goto("/storage/rack-map");
    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });
});
