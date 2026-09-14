import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { warehouses } from "../../drizzle/schema";

/**
 * Loop 22: browser-level verification of Warehouse Master CRUD (same
 * real-persistence + honest-auth-refusal pattern as Material Master in
 * Loop 21 - see tests/e2e/masters-materials.spec.ts for the full
 * rationale on why the create-mutation path can only be proven as
 * "correctly refused in Clerk stub mode", not "succeeds", until a real
 * Clerk application exists) plus the two read-only reference masters
 * (Status Master, SAP Warehouse Master) seeded by
 * `npm run db:seed` this loop.
 */

const FIXTURE_CODE = "E2E-FIXTURE-WH";

function hasNoHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const db = getDb();
  await db.delete(warehouses).where(eq(warehouses.code, FIXTURE_CODE));
  await db.insert(warehouses).values({
    id: `e2e-fixture-${FIXTURE_CODE}`,
    code: FIXTURE_CODE,
    name: "E2E fixture warehouse (Loop 22)",
    type: "OWN",
    plant: "LIMBASI",
    sapCode: "LMFGA",
    locationStructure: "RACK",
    active: 1,
    createdAt: new Date().toISOString(),
  });
});

test.afterAll(async () => {
  const db = getDb();
  await db.delete(warehouses).where(eq(warehouses.code, FIXTURE_CODE));
});

test.describe("Warehouse Master - real persistence (read + reload)", () => {
  test("lists a real row read from local D1, and keeps showing it after a reload", async ({
    page,
  }) => {
    const response = await page.goto("/masters/warehouses");
    expect(response?.ok()).toBe(true);
    const table = page.locator("table");
    await expect(table.getByText(FIXTURE_CODE)).toBeVisible();
    await expect(table.getByText("E2E fixture warehouse (Loop 22)")).toBeVisible();

    await page.reload();
    await expect(table.getByText(FIXTURE_CODE)).toBeVisible();
  });
});

test.describe("Warehouse Master - server-side permission gate (Clerk stub mode)", () => {
  test("a syntactically valid create is honestly refused, not silently accepted", async ({
    page,
  }) => {
    await page.goto("/masters/warehouses");
    await page.getByPlaceholder("LIMBASI-CR1").fill("E2E-SHOULD-NOT-SAVE");
    await page.getByLabel("Name").fill("Should be refused by the auth gate");
    await page.getByPlaceholder("LMFGA").fill("LMFGA");
    await page.getByRole("button", { name: "Add warehouse" }).click();

    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    await expect(page.getByText("E2E-SHOULD-NOT-SAVE")).toHaveCount(0);
  });
});

test.describe("Status Master (read-only, seeded)", () => {
  test("shows all 10 locked status values", async ({ page }) => {
    await page.goto("/masters/statuses");
    await expect(page.getByText("QC_HOLD")).toBeVisible();
    await expect(page.getByText("OK / Available")).toBeVisible();
    // 10 <li> rows, one per locked status value.
    await expect(page.locator("li")).toHaveCount(10);
  });
});

test.describe("SAP Warehouse Master (read-only, seeded)", () => {
  test("shows the 45 seeded FG-relevant SAP codes", async ({ page }) => {
    await page.goto("/masters/sap-codes");
    await expect(page.getByText("45 FG-relevant SAP codes seeded.")).toBeVisible();
    const table = page.locator("table");
    await expect(table.getByText("LMFGA", { exact: true })).toBeVisible();
  });
});

test.describe("mobile-first behavior (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("no horizontal scroll on Warehouse Master, Status Master, or SAP Warehouse Master", async ({
    page,
  }) => {
    await page.goto("/masters/warehouses");
    expect(await hasNoHorizontalScroll(page)).toBe(true);

    await page.goto("/masters/statuses");
    expect(await hasNoHorizontalScroll(page)).toBe(true);

    await page.goto("/masters/sap-codes");
    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });
});
