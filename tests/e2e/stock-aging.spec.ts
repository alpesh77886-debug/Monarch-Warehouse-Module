import { test, expect, type Page } from "@playwright/test";

/**
 * TASK-013 FIFO Aging Report (SCREEN-013) browser-level verification.
 * Gated on "stock.view_ledger" like Stock Ledger itself (no dedicated
 * "stock.aging" permission exists anywhere in the real matrix - see the
 * route's own comment) - so the honest, correct behavior for every
 * visitor in Clerk stub mode is the same permission-denied state tested
 * here, same as tests/e2e/stock-ledger.spec.ts and
 * tests/e2e/in-out-summary.spec.ts. The real aggregation logic is
 * proven separately in tests/unit/fifo.test.ts (pure) and
 * tests/unit/fifo-aging-live.test.ts (live DB).
 */

function hasNoHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.describe("Stock landing page", () => {
  test("links to Stock Aging (FIFO)", async ({ page }) => {
    await page.goto("/stock");
    await expect(page.getByText("Stock Aging (FIFO)", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: /Stock Aging/i }).click();
    await expect(page).toHaveURL(/\/stock\/aging$/);
  });
});

test.describe("Stock Aging - honest permission-denied state (Clerk stub mode)", () => {
  test("shows the real auth-not-configured message, not a silent empty report", async ({ page }) => {
    const response = await page.goto("/stock/aging");
    expect(response?.ok()).toBe(true);
    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    await expect(page.locator("table")).toHaveCount(0);
  });
});

test.describe("mobile-first behavior (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("no horizontal scroll on Stock Aging", async ({ page }) => {
    await page.goto("/stock/aging");
    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });
});
