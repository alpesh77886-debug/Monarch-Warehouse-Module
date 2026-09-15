import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { users, maintenanceTickets } from "../../drizzle/schema";

/**
 * Loop 44: browser-level verification of the Maintenance screens
 * (SCREEN-009, TASK-010). Same real-persistence + honest-auth-refusal
 * pattern as every other paperwork entity in this project - list/detail
 * reads are ungated (PEN-022 precedent), every mutation (create/
 * acknowledge/start-work/resolve/close/reopen) is gated and must be
 * honestly refused in Clerk stub mode. The real transaction logic is
 * proven separately in tests/unit/maintenance-live.test.ts, which mocks
 * only the permission check.
 */

const FIXTURE_USER_ID = "e2e-maintenance-fixture-user";
const FIXTURE_TICKET_ID = "e2e-maintenance-fixture-ticket";

test.describe.configure({ mode: "serial" });

async function cleanup() {
  const db = getDb();
  await db.delete(maintenanceTickets).where(eq(maintenanceTickets.id, FIXTURE_TICKET_ID));
}

test.beforeAll(async () => {
  await cleanup();
  const db = getDb();

  const [existingUser] = await db.select().from(users).where(eq(users.id, FIXTURE_USER_ID));
  if (!existingUser) {
    await db.insert(users).values({
      id: FIXTURE_USER_ID,
      clerkUserId: "e2e-maintenance-fixture-clerk-user",
      name: "E2E Maintenance Fixture User",
      email: "e2e-maintenance-fixture@example.test",
      roleId: "R03",
      department: "Warehouse",
      plant: "LIMBASI",
    });
  }

  await db.insert(maintenanceTickets).values({
    id: FIXTURE_TICKET_ID,
    ticketNumber: "MT-2026-0915-E2E",
    category: "REFRIGERATION",
    location: "CR1",
    description: "Temperature rising - E2E fixture",
    severity: "CRITICAL",
    status: "OPEN",
    raisedById: FIXTURE_USER_ID,
  });
});

test.afterAll(async () => {
  await cleanup();
});

function hasNoHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.describe("Sidebar/bottom nav reaches Maintenance", () => {
  test("the support nav includes a working Maintenance link", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Maintenance/i }).click();
    await expect(page).toHaveURL(/\/maintenance$/);
  });
});

test.describe("Maintenance - server-side permission gate (Clerk stub mode)", () => {
  test("a syntactically valid create is honestly refused, not silently accepted", async ({ page }) => {
    await page.goto("/maintenance");
    await page.getByLabel("Location (CR/block/area)").fill("CR2");
    await page.getByLabel("Description").fill("E2E refused ticket");
    await page.getByRole("button", { name: "Raise issue" }).click();

    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    await expect(page.getByText("E2E refused ticket")).toHaveCount(0);
  });
});

test.describe("Maintenance list - real persistence (read, ungated per PEN-022)", () => {
  test("lists the real fixture CRITICAL ticket, readable with no session", async ({ page }) => {
    await page.goto("/maintenance");
    const row = page.getByRole("link", { name: /MT-2026-0915-E2E/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("CRITICAL")).toBeVisible();
  });
});

test.describe("Maintenance detail - real persistence (read, ungated per PEN-022)", () => {
  test("shows an honest error for an unknown ticket id", async ({ page }) => {
    await page.goto("/maintenance/does-not-exist");
    await expect(page.getByText(/Maintenance ticket .* not found/i)).toBeVisible();
  });

  test("shows the real OPEN CRITICAL ticket with the escalation notice and an Acknowledge button", async ({ page }) => {
    await page.goto(`/maintenance/${FIXTURE_TICKET_ID}`);
    await expect(page.getByText("MT-2026-0915-E2E")).toBeVisible();
    await expect(page.getByText(/CRITICAL - escalated/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Acknowledge" })).toBeVisible();
  });

  test("mutating (Acknowledge) is honestly refused in Clerk stub mode, not silently accepted", async ({ page }) => {
    await page.goto(`/maintenance/${FIXTURE_TICKET_ID}`);
    await page.getByRole("button", { name: "Acknowledge" }).click();
    await expect(page.getByText(/Clerk stub mode/i)).toBeVisible();
    // Still shows the Acknowledge button (still OPEN) - the refusal is real.
    await expect(page.getByRole("button", { name: "Acknowledge" })).toBeVisible();
  });
});

test.describe("mobile-first behavior (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("no horizontal scroll on Maintenance or a ticket's own detail page", async ({ page }) => {
    await page.goto("/maintenance");
    expect(await hasNoHorizontalScroll(page)).toBe(true);

    const button = page.getByRole("button", { name: "Raise issue" });
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(48);

    await page.goto(`/maintenance/${FIXTURE_TICKET_ID}`);
    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });
});
