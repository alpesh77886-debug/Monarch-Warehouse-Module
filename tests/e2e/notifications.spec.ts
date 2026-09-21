import { test, expect } from "@playwright/test";

/**
 * Loop 50 / PEN-038: browser-level verification of the in-app
 * notification bell. Notifications are inherently per-user data (never
 * a PEN-022-style public read), so in Clerk stub mode the honest,
 * correct behavior is the bell rendering NOTHING - not a fake badge, not
 * a crash - since there is no real session to know whose inbox to show.
 * The real fan-out/read/unread logic is proven against real local D1 in
 * tests/unit/hold-live.test.ts and tests/unit/notifications-live.test.ts,
 * which bypass only the permission check the same way every other
 * *-live.test.ts file in this repository does.
 */
test.describe("Notification bell - honest absence in Clerk stub mode", () => {
  test("renders no bell, no badge, and does not error the page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const response = await page.goto("/dashboard");
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("button", { name: "Notifications" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("stays absent on a second, data-heavy screen too (Hold Management)", async ({ page }) => {
    await page.goto("/holds");
    await expect(page.getByRole("button", { name: "Notifications" })).toHaveCount(0);
  });
});
