import { test, expect, type Page } from "@playwright/test";

/**
 * Loop 39: browser-level verification of the In-Out Summary report
 * (TASK-011, PEN-031). Gated on "stock.view_summary" like Stock Ledger
 * itself (Loop 26) - not a PEN-022 public read - so the honest,
 * correct behavior for every visitor in Clerk stub mode is the same
 * permission-denied state tested here. The real aggregation logic is
 * proven separately in tests/unit/in-out-summary.test.ts (pure) - this
 * repository has no way to seed real INWARD-vs-DISPATCH ledger data and
 * view it through a real logged-in session in this sandbox (PEN-030).
 */

function hasNoHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.describe("Stock landing page", () => {
  test("links to In-Out Summary", async ({ page }) => {
    await page.goto("/stock");
    await expect(page.getByText("In-Out Summary", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: /In-Out Summary/i }).click();
    await expect(page).toHaveURL(/\/stock\/in-out-summary$/);
  });
});

test.describe("In-Out Summary - honest permission-denied state (Clerk stub mode)", () => {
  test("shows the real auth-not-configured message, not a silent empty table", async ({ page }) => {
    const response = await page.goto("/stock/in-out-summary");
    expect(response?.ok()).toBe(true);
    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    await expect(page.locator("table")).toHaveCount(0);
  });

  test("the export link is present even while access is denied", async ({ page }) => {
    await page.goto("/stock/in-out-summary");
    await expect(page.getByRole("link", { name: /Export/i })).toBeVisible();
  });
});

test.describe("mobile-first behavior (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("no horizontal scroll on In-Out Summary", async ({ page }) => {
    await page.goto("/stock/in-out-summary");
    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });
});
