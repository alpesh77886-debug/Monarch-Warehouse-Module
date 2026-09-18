import { test, expect, type Page } from "@playwright/test";

/**
 * Loop 19 (Browser/E2E verification, resequenced from the original
 * Loop 18 plan slot). Scope is bounded to what actually exists today:
 * the homepage, the mobile-first App Shell demo page (/dashboard), the
 * stub-mode sign-in/sign-up pages, and Next.js's own 404 handling.
 *
 * Nav items whose href points at a not-yet-built screen (/inward,
 * /storage, /holds, /bulk, /outward, /transfers, /maintenance, /stock,
 * /masters, /reports) are intentionally NOT navigated to here - at this
 * scaffold stage they are placeholder links only (see src/lib/nav-items.ts),
 * and following them would 404 for "not built yet", not for an actual
 * error-state defect. The dedicated 404 case below uses an unambiguous
 * fake route instead, so that result cannot be confused with unfinished
 * scope.
 */

async function hasNoHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.describe("homepage", () => {
  test("loads and shows the scaffold-stage heading", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { name: "IBF FG Warehouse Module" })).toBeVisible();
    await expect(page.getByText("Scaffold stage")).toBeVisible();
  });
});

test.describe("dashboard shell page", () => {
  test("loads and shows the page header", async ({ page }) => {
    const response = await page.goto("/dashboard");
    expect(response?.ok()).toBe(true);
    await expect(page.getByText("Home / Dashboard")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Warehouse Overview" })).toBeVisible();
    await expect(page.getByRole("link", { name: "+ New Receiving Sheet" })).toBeVisible();
  });
});

test.describe("mobile-first behavior (375x667, below md breakpoint)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("shows the bottom nav, hides the sidebar, and has no horizontal scroll", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    const bottomNav = page.getByRole("navigation").filter({ hasText: "Dashboard" }).last();
    await expect(bottomNav).toBeVisible();

    const sidebarHeading = page.getByText("FG Warehouse");
    await expect(sidebarHeading).toBeHidden();

    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });

  test("bottom nav links are all >=48px tall touch targets", async ({ page }) => {
    await page.goto("/dashboard");
    const links = page.locator("nav.fixed a");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await links.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(48);
    }
  });

  test("only the 5 primary sections appear in the bottom nav", async ({ page }) => {
    await page.goto("/dashboard");
    const links = page.locator("nav.fixed a");
    await expect(links).toHaveCount(5);
  });
});

test.describe("desktop behavior (1280x800, at lg breakpoint)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("shows the full sidebar with labels and hides the bottom nav", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByText("FG Warehouse")).toBeVisible();
    await expect(page.getByText("Limbasi Plant")).toBeVisible();
    await expect(page.getByRole("link", { name: "Hold Management" })).toBeVisible();

    const bottomNavLink = page.locator("nav.fixed a").first();
    await expect(bottomNavLink).toBeHidden();

    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });
});

test.describe("auth boundary (Clerk stub mode - no real keys configured)", () => {
  test("sign-in shows the stub-mode message, not a live Clerk widget", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
  });

  test("sign-up shows the stub-mode message, not a live Clerk widget", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
  });
});

test.describe("error state", () => {
  test("an unknown route renders Next.js's 404 page", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist-e2e-check");
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/this page could not be found/i)).toBeVisible();
  });
});
