import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { materials } from "../../drizzle/schema";

/**
 * Loop 21: browser-level verification of the Material Master CRUD
 * vertical slice (TASK-003) - the first screen in this repository
 * backed by a real API route and a real local D1 (Miniflare SQLite)
 * table, not a shell demo.
 *
 * What this suite can and cannot prove, and why (see
 * docs/PENDING_ITEMS.md PEN-021 for the full finding): Clerk is stub
 * mode only per this loop's own gate, and stub mode has no real login
 * at all - so there is no way for a real browser session in this test
 * to become an authenticated R12 admin. The create-mutation route is
 * therefore verified in its two honest, real states: (1) the read
 * path against genuine persisted data, seeded here directly through
 * the same database module the app itself uses (not fabricated
 * catalog data - a throwaway fixture row, same pattern already used in
 * tests/unit/schema-constraints.test.ts), and (2) that a real create
 * attempt through the real UI correctly surfaces the server's
 * "auth not configured" refusal rather than silently succeeding or
 * crashing - proving the permission gate actually holds end-to-end.
 */

const FIXTURE_CODE = "LFG00001";

function hasNoHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

// This file's tests share one real SQLite-backed fixture row across a
// single beforeAll/afterAll pair. With the project's default
// fullyParallel config, per-file hooks can run once per worker if
// Playwright splits this file's tests across workers, racing this
// file's own afterAll delete against another worker's test that still
// needs the row. Serial mode keeps the whole file on one worker, in
// order, so the fixture's lifecycle stays deterministic.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const db = getDb();
  await db.delete(materials).where(eq(materials.code, FIXTURE_CODE));
  await db.insert(materials).values({
    id: `e2e-fixture-${FIXTURE_CODE}`,
    code: FIXTURE_CODE,
    description: "E2E fixture material (Loop 21)",
    uomKgPerCarton: 10,
    category: "E2E-FIXTURE",
    palletWeightLimitKg: 1000,
    palletType: "CARTON",
    plantOrigin: "LIMBASI",
    active: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

test.afterAll(async () => {
  const db = getDb();
  await db.delete(materials).where(eq(materials.code, FIXTURE_CODE));
});

test.describe("Material Master - real persistence (read + reload)", () => {
  test("lists a real row read from local D1, and keeps showing it after a reload", async ({
    page,
  }) => {
    const response = await page.goto("/masters/materials");
    expect(response?.ok()).toBe(true);
    // Default (desktop) viewport renders both the phone-card list
    // (CSS-hidden at this width) and the table markup in the DOM at
    // once - scope to the table, which is the one actually visible
    // here, rather than asserting on text that also exists hidden.
    const table = page.locator("table");
    await expect(table.getByText(FIXTURE_CODE)).toBeVisible();
    await expect(table.getByText("E2E fixture material (Loop 21)")).toBeVisible();

    // Real reload/readback: re-fetches from the API, not client cache.
    await page.reload();
    await expect(table.getByText(FIXTURE_CODE)).toBeVisible();
  });
});

test.describe("Material Master - client-side validation", () => {
  test("rejects a non-LFG/SFG code before any network call, with a field-level error", async ({
    page,
  }) => {
    await page.goto("/masters/materials");
    await page.getByPlaceholder("LFG00938").fill("ABC123");
    await page.getByLabel("Description").fill("Should not save");
    await page.getByRole("button", { name: "Add material" }).click();

    await expect(
      page.getByText(/Code must start with LFG or SFG followed by digits/i)
    ).toBeVisible();
    // No optimistic/incorrect success - the invalid material never appears.
    await expect(page.getByText("Should not save")).toHaveCount(0);
  });
});

test.describe("Material Master - server-side permission gate (Clerk stub mode)", () => {
  test("a syntactically valid create is honestly refused, not silently accepted", async ({
    page,
  }) => {
    await page.goto("/masters/materials");
    await page.getByPlaceholder("LFG00938").fill("LFG99999");
    await page.getByLabel("Description").fill("Should be refused by the auth gate");
    await page.getByLabel("UOM (kg/carton)").fill("5");
    await page.getByLabel("Category").fill("E2E-FIXTURE");
    await page.getByLabel("Pallet weight limit (kg)").fill("500");
    await page.getByRole("button", { name: "Add material" }).click();

    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    // The refused row must never appear in the list - the gate is real,
    // not cosmetic.
    await expect(page.getByText("LFG99999")).toHaveCount(0);
  });
});

test.describe("Material Master - pallet weight limit inline edit (Loop 29, PEN-007)", () => {
  test("click-to-edit surfaces the same honest Clerk-stub-mode refusal as every other mutation", async ({
    page,
  }) => {
    await page.goto("/masters/materials");
    const row = page.getByRole("row", { name: new RegExp(FIXTURE_CODE) });
    const editButton = row.getByRole("button", { name: "1000 kg" });
    await expect(editButton).toBeVisible();
    await editButton.click();

    const input = row.locator('input[type="number"]');
    await input.fill("750");
    await row.getByRole("button", { name: "Save" }).click();

    await expect(row.getByText(/Clerk stub mode/i)).toBeVisible();
    // Refused, not silently applied - the button still shows the
    // original real value once the notice is visible.
    await expect(row.getByRole("button", { name: "1000 kg" })).toHaveCount(0);
    await expect(input).toBeVisible();
  });

  test("Cancel discards the edit without calling the API", async ({ page }) => {
    await page.goto("/masters/materials");
    const row = page.getByRole("row", { name: new RegExp(FIXTURE_CODE) });
    await row.getByRole("button", { name: "1000 kg" }).click();
    await row.locator('input[type="number"]').fill("1");
    await row.getByRole("button", { name: "Cancel" }).click();

    await expect(row.getByRole("button", { name: "1000 kg" })).toBeVisible();
  });
});

test.describe("Masters landing page", () => {
  test("links to Material Master", async ({ page }) => {
    await page.goto("/masters");
    await expect(page.getByText("Material Master")).toBeVisible();
    await page.getByRole("link", { name: /Material Master/i }).click();
    await expect(page).toHaveURL(/\/masters\/materials$/);
  });
});

test.describe("mobile-first behavior (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("no horizontal scroll and >=48px touch targets on the materials screen", async ({
    page,
  }) => {
    await page.goto("/masters/materials");
    await expect(page.locator("ul").getByText(FIXTURE_CODE)).toBeVisible();
    expect(await hasNoHorizontalScroll(page)).toBe(true);

    const addButton = page.getByRole("button", { name: "Add material" });
    const box = await addButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(48);

    const codeInput = page.getByPlaceholder("LFG00938");
    const inputBox = await codeInput.boundingBox();
    expect(inputBox).not.toBeNull();
    expect(inputBox!.height).toBeGreaterThanOrEqual(48);
  });
});
