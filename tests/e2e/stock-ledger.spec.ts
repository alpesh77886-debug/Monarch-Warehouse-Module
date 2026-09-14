import { test, expect, type Page } from "@playwright/test";

/**
 * Loop 26: browser-level verification of the Stock Ledger list
 * screen. Unlike every masters/storage screen so far, this one has no
 * "real persistence" test to write against a real logged-in session -
 * the architecture blueprint's own Action Permission Matrix gates
 * *reading* the ledger to R01/R03/R04/R09/R12 only (unlike the public
 * masters/pallets reads - see PEN-022), so in Clerk stub mode the
 * honest, correct behavior for every visitor is the same
 * permission-denied state tested here. The real query logic (join,
 * pagination, filter) is proven separately in
 * tests/unit/stock-ledger-read.test.ts, which bypasses only the
 * permission check the way every other mutation test in this repo
 * already does.
 */

function hasNoHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.describe("Stock landing page", () => {
  test("links to Stock Ledger", async ({ page }) => {
    await page.goto("/stock");
    await expect(page.getByText("Stock Ledger", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: /Stock Ledger/i }).click();
    await expect(page).toHaveURL(/\/stock\/ledger$/);
  });
});

test.describe("Stock Ledger - honest permission-denied state (Clerk stub mode)", () => {
  test("shows the real auth-not-configured message, not a silent empty table", async ({ page }) => {
    const response = await page.goto("/stock/ledger");
    expect(response?.ok()).toBe(true);
    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    // No fabricated data ever appears.
    await expect(page.locator("table")).toHaveCount(0);
  });

  test("the transaction-type filter is present even while access is denied", async ({ page }) => {
    await page.goto("/stock/ledger");
    await expect(page.getByRole("combobox")).toBeVisible();
  });
});

test.describe("mobile-first behavior (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("no horizontal scroll on Stock or Stock Ledger", async ({ page }) => {
    await page.goto("/stock");
    expect(await hasNoHorizontalScroll(page)).toBe(true);

    await page.goto("/stock/ledger");
    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });
});
