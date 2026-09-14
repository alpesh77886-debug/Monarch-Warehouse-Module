import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { warehouses, materials, locations, pallets } from "../../drizzle/schema";

/**
 * Loop 24: browser-level verification of the Location CRUD screen and
 * the putaway/move business logic (TASK-005, the scope actually
 * grounded in the canonical flow document - see PEN-023 in
 * docs/PENDING_ITEMS.md for what is deliberately NOT covered).
 *
 * Same real-persistence + honest-auth-refusal pattern as every other
 * mutation screen in this repository: the create-mutation paths
 * (Location create, Assign, Move) can only be proven "correctly
 * refused in Clerk stub mode" through a real browser session, since
 * there is no way to be a real authenticated R12/R02/R03 user yet
 * (PEN-010/PEN-021). tests/unit/mutations-live.test.ts is what proves
 * the actual insert/update/transaction logic behind those refusals is
 * correct, by mocking only the permission check.
 */

const FIXTURE_WAREHOUSE_CODE = "E2E-STORAGE-WH";
const FIXTURE_MATERIAL_CODE = "LFG00003";
const FIXTURE_LOCATION_CODE = "E2E-STORAGE-LOC";
const FIXTURE_PALLET_NUMBER = "E2E-STORAGE-PALLET";

function hasNoHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.describe.configure({ mode: "serial" });

let warehouseId: string;
let materialId: string;

async function cleanup() {
  const db = getDb();
  await db.delete(pallets).where(eq(pallets.palletNumber, FIXTURE_PALLET_NUMBER));
  await db.delete(locations).where(eq(locations.fullCode, FIXTURE_LOCATION_CODE));
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
    name: "E2E fixture warehouse (Loop 24)",
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
    description: "E2E fixture material (Loop 24)",
    uomKgPerCarton: 10,
    category: "E2E-FIXTURE",
    palletWeightLimitKg: 1000,
    palletType: "CARTON",
    plantOrigin: "LIMBASI",
    active: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await db.insert(pallets).values({
    id: crypto.randomUUID(),
    palletNumber: FIXTURE_PALLET_NUMBER,
    palletType: "PLASTIC",
    materialId,
    statusCode: "OK",
    totalWeightKg: 500,
    totalCartons: 50,
    currentWarehouseId: warehouseId,
  });
});

test.afterAll(async () => {
  await cleanup();
});

test.describe("Storage landing page", () => {
  test("links to Locations and Putaway & Move", async ({ page }) => {
    await page.goto("/storage");
    await expect(page.getByText("Locations", { exact: true })).toBeVisible();
    await expect(page.getByText("Putaway & Move", { exact: true })).toBeVisible();
  });
});

test.describe("Locations - server-side permission gate (Clerk stub mode)", () => {
  test("a syntactically valid create is honestly refused, not silently accepted", async ({
    page,
  }) => {
    await page.goto("/storage/locations");
    await page.getByPlaceholder("paste a Warehouse Master id").fill(warehouseId);
    await page.getByPlaceholder("CR1-01-A-4").fill(FIXTURE_LOCATION_CODE);
    await page.getByRole("button", { name: "Add location" }).click();

    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    await expect(page.getByText(FIXTURE_LOCATION_CODE)).toHaveCount(0);
  });
});

test.describe("Putaway - real pallet read from local D1", () => {
  test("shows the fixture pallet as awaiting putaway", async ({ page }) => {
    await page.goto("/storage/putaway");
    await expect(page.getByText(`Pallet ${FIXTURE_PALLET_NUMBER} · ${FIXTURE_MATERIAL_CODE}`)).toBeVisible();
    await expect(page.getByText("Awaiting putaway (1)")).toBeVisible();
  });

  test("an assign attempt is honestly refused in Clerk stub mode, not silently accepted", async ({
    page,
  }) => {
    // Seed a real EMPTY location directly so the picker has something
    // to select (Location create itself is proven refused above).
    const db = getDb();
    await db.insert(locations).values({
      id: crypto.randomUUID(),
      warehouseId,
      coldRoom: "CR1",
      fullCode: FIXTURE_LOCATION_CODE,
      capacityPallets: 1,
      status: "EMPTY",
      createdAt: new Date().toISOString(),
    });

    await page.goto("/storage/putaway");
    const row = page.locator("li", { hasText: FIXTURE_PALLET_NUMBER });
    await row.getByRole("combobox").selectOption({ label: `${FIXTURE_LOCATION_CODE} (EMPTY)` });
    await row.getByRole("button", { name: "Assign" }).click();

    await expect(row.getByText(/Clerk stub mode/i)).toBeVisible();
    // Still awaiting putaway - the refusal is real, not cosmetic.
    await expect(page.getByText("Awaiting putaway (1)")).toBeVisible();
  });
});

test.describe("mobile-first behavior (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("no horizontal scroll on Storage, Locations, or Putaway & Move", async ({ page }) => {
    await page.goto("/storage");
    expect(await hasNoHorizontalScroll(page)).toBe(true);

    await page.goto("/storage/locations");
    expect(await hasNoHorizontalScroll(page)).toBe(true);

    await page.goto("/storage/putaway");
    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });
});
