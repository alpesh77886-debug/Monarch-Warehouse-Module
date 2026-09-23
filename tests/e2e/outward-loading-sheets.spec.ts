import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { materials, batches, pallets, palletBatches, warehouses, loadingSheets, loadingSheetPallets } from "../../drizzle/schema";

/**
 * Loop 41: browser-level verification of the Loading Sheet screens
 * (SCREEN-005, TASK-008). Same real-persistence + honest-auth-refusal
 * pattern as Receiving Sheet (tests/e2e/inward-receiving-sheets.spec.ts)
 * and Hold Management - list/detail reads are ungated (PEN-022
 * precedent, applied to loading_sheet the same way), so real seeded
 * data must be visible with no session; every mutation (pick, load,
 * verify, gate-pass, dispatch, qc-approve) is gated and must be
 * honestly refused in Clerk stub mode, not silently accepted. The
 * real transaction logic for all of those is proven separately in
 * tests/unit/loading-sheet-live.test.ts, which mocks only the
 * permission check.
 */

const FIXTURE_MATERIAL_CODE = "LFG00040";
const FIXTURE_WAREHOUSE_CODE = "TEST-LS-E2E-WH";
const FIXTURE_SHEET_ID = "e2e-outward-fixture-sheet";
const FIXTURE_PALLET_NUMBER = "TEST-LS-E2E-PALLET";

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
  await db.delete(loadingSheetPallets).where(eq(loadingSheetPallets.loadingSheetId, FIXTURE_SHEET_ID));
  await db.delete(loadingSheets).where(eq(loadingSheets.id, FIXTURE_SHEET_ID));
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
          description: "E2E loading-sheet fixture material (Loop 41)",
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
          name: "E2E loading-sheet fixture warehouse",
          type: "OWN",
          plant: "LIMBASI",
          sapCode: "LMFGA",
          locationStructure: "RACK",
        });
        return id;
      })();

  const FIXTURE_BATCH_NUMBER = "L26I040010";
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
    await db.update(pallets).set({ statusCode: "OK" }).where(eq(pallets.id, fixturePalletId));
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

  // A real DRAFT sheet with a real picked pallet row, inserted directly
  // (not through the gated create/pick routes) - same technique the
  // Receiving Sheet and Hold Management E2E specs use to get real,
  // viewable data in front of a real browser session without needing a
  // real Clerk login to exist.
  await db.insert(loadingSheets).values({
    id: FIXTURE_SHEET_ID,
    loadingSheetNumber: "LS-2026-0915-E2E",
    date: "2026-09-15",
    vehicleNumber: "GJ-05-XX-1234",
    driverName: "E2E Test Driver",
    transporter: "E2E Test Transporter",
    partyName: "E2E Test Party",
    destination: "E2E Test Destination",
    exportDomestic: "DOMESTIC",
    temperatureC: -18,
    status: "STAGING",
  });
  await db.insert(loadingSheetPallets).values({
    id: crypto.randomUUID(),
    loadingSheetId: FIXTURE_SHEET_ID,
    palletId: fixturePalletId,
    materialId: fixtureMaterialId,
    batchId: fixtureBatchId,
    cartonQty: 10,
    weightKg: 100,
    loadingSequence: 1,
  });
});

test.afterAll(async () => {
  await cleanup();
});

test.describe("Outward landing page", () => {
  test("links to Loading Sheets and shows Inter-Warehouse Transfers as not built", async ({ page }) => {
    await page.goto("/outward");
    await expect(page.getByText("Loading Sheets", { exact: true })).toBeVisible();
    // TASK-009 (Transfers) is built, so this is now a real link, not a placeholder.
    await expect(page.getByRole("link", { name: /Inter-Warehouse Transfers/ })).toHaveAttribute("href", "/transfers");
    await page.getByRole("link", { name: /Loading Sheets/i }).click();
    await expect(page).toHaveURL(/\/outward\/loading-sheets$/);
  });
});

test.describe("Loading Sheets - server-side permission gate (Clerk stub mode)", () => {
  test("a syntactically valid create is honestly refused, not silently accepted", async ({ page }) => {
    await page.goto("/outward/loading-sheets");
    await page.getByLabel("Vehicle number").fill("GJ-05-YY-9999");
    await page.getByLabel("Driver name").fill("Refused Driver");
    await page.getByLabel("Party name").fill("Refused Party");
    await page.getByLabel("Destination").fill("Refused Destination");
    await page.getByRole("button", { name: "Create draft loading sheet" }).click();

    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    // The refused sheet must never appear in the list - the gate is
    // real, not cosmetic.
    await expect(page.getByText("GJ-05-YY-9999")).toHaveCount(0);
  });
});

test.describe("Loading Sheets list - real persistence (read, ungated per PEN-022)", () => {
  test("lists the real fixture sheet, readable with no session (list read is public)", async ({ page }) => {
    await page.goto("/outward/loading-sheets");
    const row = page.getByRole("link", { name: /LS-2026-0915-E2E/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Staging")).toBeVisible();
    await expect(row.getByText(/GJ-05-XX-1234/)).toBeVisible();
  });
});

test.describe("Loading Sheet detail - real persistence (read, ungated per PEN-022)", () => {
  test("shows an honest error for an unknown sheet id", async ({ page }) => {
    await page.goto("/outward/loading-sheets/does-not-exist");
    await expect(page.getByText(/Loading sheet .* not found/i)).toBeVisible();
  });

  test("shows the real STAGING sheet with its real picked pallet and a pick form", async ({ page }) => {
    await page.goto(`/outward/loading-sheets/${FIXTURE_SHEET_ID}`);
    await expect(page.getByText("LS-2026-0915-E2E")).toBeVisible();
    await expect(page.getByText("Staging")).toBeVisible();
    const table = page.getByRole("table");
    await expect(table.getByText(FIXTURE_PALLET_NUMBER)).toBeVisible();
    await expect(table.getByText(FIXTURE_MATERIAL_CODE)).toBeVisible();
    // STAGING still allows picking - the "Mark Loaded" action button is
    // also present (canLoad === true at STAGING).
    await expect(page.getByRole("button", { name: "Pick pallet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark Loaded" })).toBeVisible();
  });

  test("mutating (Mark Loaded) is honestly refused in Clerk stub mode, not silently accepted", async ({ page }) => {
    await page.goto(`/outward/loading-sheets/${FIXTURE_SHEET_ID}`);
    await page.getByRole("button", { name: "Mark Loaded" }).click();
    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    // Still Staging - the refusal is real, not cosmetic.
    await expect(page.getByText("Staging")).toBeVisible();
  });
});

test.describe("mobile-first behavior (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("no horizontal scroll on Outward, Loading Sheets, or a sheet's own detail page", async ({ page }) => {
    await page.goto("/outward");
    expect(await hasNoHorizontalScroll(page)).toBe(true);

    await page.goto("/outward/loading-sheets");
    expect(await hasNoHorizontalScroll(page)).toBe(true);

    const button = page.getByRole("button", { name: "Create draft loading sheet" });
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(48);

    await page.goto(`/outward/loading-sheets/${FIXTURE_SHEET_ID}`);
    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });
});
