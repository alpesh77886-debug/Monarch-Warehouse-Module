import { test, expect, type Page } from "@playwright/test";

/**
 * Loop 38: browser-level verification of the Hold Management dashboard
 * (SCREEN-004, TASK-006). Like Stock Ledger (Loop 26), "holds.view" is
 * gated to R03/R04/R05/R08 only by the real permission matrix (not a
 * PEN-022 public read), so in Clerk stub mode the honest, correct
 * behavior for every visitor is the same permission-denied state
 * tested here - the real create/release/reject/follow-up logic is
 * proven separately in tests/unit/hold-live.test.ts, which bypasses
 * only the permission check.
 */

function hasNoHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.describe("Hold Management - honest permission-denied state (Clerk stub mode)", () => {
  test("shows the real auth-not-configured message, not a silent empty dashboard", async ({ page }) => {
    const response = await page.goto("/holds");
    expect(response?.ok()).toBe(true);
    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    // No fabricated data ever appears - the summary tiles, the create
    // form, and the holds table are all inside the same gated section.
    await expect(page.getByText("Hold Summary")).toHaveCount(0);
    await expect(page.getByText("Place a hold")).toHaveCount(0);
    await expect(page.locator("table")).toHaveCount(0);
  });
});

test.describe("Sidebar/bottom nav reaches Hold Management", () => {
  test("the operations nav includes a working Hold Management link", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Hold Management/i }).click();
    await expect(page).toHaveURL(/\/holds$/);
  });
});

test.describe("mobile-first behavior (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("no horizontal scroll on Hold Management", async ({ page }) => {
    await page.goto("/holds");
    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });
});
