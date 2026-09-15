import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { materials, receivingSheets, receivingSheetPallets } from "../../drizzle/schema";

/**
 * Loop 36: browser-level verification of the Receiving Sheet screens
 * (SCREEN-002, TASK-004). Same real-persistence + honest-auth-refusal
 * pattern as every other mutation screen in this repository - Clerk
 * stub mode means the create/confirm mutation paths can only be proven
 * "correctly refused" through a real browser session; the actual
 * insert/transaction/lock logic is proven separately by
 * tests/unit/receiving-sheet-live.test.ts, which mocks only the
 * permission check.
 */

const FIXTURE_MATERIAL_CODE = "LFG00008";
const FIXTURE_SHEET_ID = "e2e-inward-fixture-sheet";
let fixtureMaterialId: string;

function hasNoHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.describe.configure({ mode: "serial" });

async function cleanup() {
  const db = getDb();
  await db.delete(receivingSheetPallets).where(eq(receivingSheetPallets.receivingSheetId, FIXTURE_SHEET_ID));
  await db.delete(receivingSheets).where(eq(receivingSheets.id, FIXTURE_SHEET_ID));
  await db.delete(materials).where(eq(materials.code, FIXTURE_MATERIAL_CODE));
}

test.beforeAll(async () => {
  await cleanup();
  const db = getDb();
  fixtureMaterialId = crypto.randomUUID();
  await db.insert(materials).values({
    id: fixtureMaterialId,
    code: FIXTURE_MATERIAL_CODE,
    description: "E2E fixture material (Loop 36)",
    uomKgPerCarton: 10,
    category: "E2E-FIXTURE",
    palletWeightLimitKg: 1000,
    palletType: "CARTON",
    plantOrigin: "LIMBASI",
    active: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // A real DRAFT sheet with real pallet rows, inserted directly (not
  // through the gated create route) - same technique every other E2E
  // spec in this repository uses to get real, viewable data in front of
  // a real browser session without needing a real Clerk login to exist.
  await db.insert(receivingSheets).values({
    id: FIXTURE_SHEET_ID,
    sheetNumber: "RS-2026-0915-E2E",
    date: "2026-09-15",
    shift: "A",
    line: "FF",
    materialId: fixtureMaterialId,
    batchNumber: "L26I070008",
    totalQty: 120,
    totalBoxes: 2,
    status: "DRAFT",
    defaultPalletStatus: "QC_HOLD",
  });
  await db.insert(receivingSheetPallets).values([
    {
      id: crypto.randomUUID(),
      receivingSheetId: FIXTURE_SHEET_ID,
      srNo: 1,
      palletNumber: "30673",
      qty: 60,
      receivingTime: "09:40",
      cartonCondition: "OK",
      temperatureC: -18,
    },
    {
      id: crypto.randomUUID(),
      receivingSheetId: FIXTURE_SHEET_ID,
      srNo: 2,
      palletNumber: "30676",
      qty: 60,
      receivingTime: "10:10",
      cartonCondition: "BULGING",
      temperatureC: -12,
      remarks: "sides bulging",
    },
  ]);
});

test.afterAll(async () => {
  await cleanup();
});

test.describe("Inward landing page", () => {
  test("links to Receiving Sheets and shows 3PL Inward as not built", async ({ page }) => {
    await page.goto("/inward");
    await expect(page.getByText("Receiving Sheets", { exact: true })).toBeVisible();
    await expect(page.getByText("3PL Inward (Other Plant)")).toBeVisible();
    await expect(page.getByText("Not built yet.")).toBeVisible();
    await page.getByRole("link", { name: /Receiving Sheets/i }).click();
    await expect(page).toHaveURL(/\/inward\/receiving-sheets$/);
  });
});

test.describe("Receiving Sheets - server-side permission gate (Clerk stub mode)", () => {
  test("a syntactically valid create is honestly refused, not silently accepted", async ({ page }) => {
    await page.goto("/inward/receiving-sheets");
    await page.getByPlaceholder("Search LFG/SFG...").fill(FIXTURE_MATERIAL_CODE);
    await page.getByPlaceholder("L26I070938").fill("L26I070099");
    await page.getByRole("button", { name: "Create draft sheet" }).click();

    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    // The refused sheet must never appear in the list - the gate is
    // real, not cosmetic. (L26I070008 is a different, deliberately
    // seeded fixture sheet, not this refused attempt - see the "real
    // persistence" describe block below.)
    await expect(page.getByText("L26I070099")).toHaveCount(0);
  });

  test("client-side validation rejects an unknown material code before any network call", async ({ page }) => {
    await page.goto("/inward/receiving-sheets");
    await page.getByPlaceholder("Search LFG/SFG...").fill("NOT-A-REAL-CODE");
    await page.getByPlaceholder("L26I070938").fill("L26I070099");
    await page.getByRole("button", { name: "Create draft sheet" }).click();

    await expect(page.getByText(/Pick a real material code/i)).toBeVisible();
  });
});

test.describe("Receiving Sheets list - real persistence (read, ungated per PEN-022)", () => {
  test("lists the real fixture sheet, readable with no session (list read is public)", async ({ page }) => {
    await page.goto("/inward/receiving-sheets");
    await expect(page.getByText("RS-2026-0915-E2E")).toBeVisible();
    await expect(page.getByText(/L26I070008/)).toBeVisible();
  });
});

test.describe("Receiving Sheet detail - real persistence (read, ungated per PEN-022)", () => {
  test("shows an honest error for an unknown sheet id", async ({ page }) => {
    await page.goto("/inward/receiving-sheets/does-not-exist");
    await expect(page.getByText(/Receiving sheet .* not found/i)).toBeVisible();
  });

  test("shows the real DRAFT sheet with its real pallet rows and the temperature warning", async ({ page }) => {
    await page.goto(`/inward/receiving-sheets/${FIXTURE_SHEET_ID}`);
    await expect(page.getByText("RS-2026-0915-E2E")).toBeVisible();
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    const table = page.getByRole("table");
    await expect(table.getByText("30673")).toBeVisible();
    await expect(table.getByText("30676")).toBeVisible();
    await expect(table.getByText("BULGING", { exact: true })).toBeVisible();
    await expect(table.getByText("sides bulging")).toBeVisible();
    // -12C is above the -15C threshold (Flow 1 Step 2's own amber warning).
    await expect(table.getByText(/-12.*⚠/)).toBeVisible();
    // Both confirmation buttons are present (DRAFT, neither side confirmed yet).
    await expect(page.getByRole("button", { name: /Confirm \(Packing\)/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Confirm \(Warehouse\)/i })).toBeVisible();
    // PEN-033 (Loop 39): a DRAFT sheet also offers Cancel.
    await expect(page.getByRole("button", { name: "Cancel this draft" })).toBeVisible();
  });

  test("confirming is honestly refused in Clerk stub mode, not silently accepted", async ({ page }) => {
    await page.goto(`/inward/receiving-sheets/${FIXTURE_SHEET_ID}`);
    await page.getByRole("button", { name: /Confirm \(Packing\)/i }).click();
    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    // Still DRAFT - the refusal is real, not cosmetic.
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  });

  test("cancelling is honestly refused in Clerk stub mode, not silently accepted (PEN-033)", async ({ page }) => {
    await page.goto(`/inward/receiving-sheets/${FIXTURE_SHEET_ID}`);
    await page.getByRole("button", { name: "Cancel this draft" }).click();
    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    // Still DRAFT - the refusal is real, not cosmetic.
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  });
});

test.describe("mobile-first behavior (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("no horizontal scroll on Inward, Receiving Sheets, or a sheet's own detail page", async ({ page }) => {
    await page.goto("/inward");
    expect(await hasNoHorizontalScroll(page)).toBe(true);

    await page.goto("/inward/receiving-sheets");
    expect(await hasNoHorizontalScroll(page)).toBe(true);

    const button = page.getByRole("button", { name: "Create draft sheet" });
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(48);

    await page.goto(`/inward/receiving-sheets/${FIXTURE_SHEET_ID}`);
    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });
});
