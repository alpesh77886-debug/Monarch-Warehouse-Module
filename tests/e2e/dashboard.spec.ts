import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { materials, warehouses, pallets, maintenanceTickets, users } from "../../drizzle/schema";

/**
 * TASK-012 Dashboard (SCREEN-001) browser-level verification. The
 * app-shell smoke test (tests/e2e/app-shell.spec.ts) already covers the
 * generic shell scaffolding on this route (breadcrumb, heading, bottom
 * nav, no-scroll at the loading/skeleton state); this spec covers what
 * changed with real content: (1) the endpoint is ungated per-panel but
 * three panels are gated on real permissions, and with no Clerk session
 * (stub mode) that must show as an honest "restricted" notice, not
 * leaked or hidden data - same PEN-022-style honesty precedent as every
 * other real-persistence screen in this suite; (2) ungated panels must
 * reflect real, live DB rows, not placeholder zeros; (3) the "+ New
 * Receiving Sheet" action is now a real, working nav link (previously
 * decorative).
 */

const FIXTURE_MATERIAL_CODE = "LFG00099";
const FIXTURE_WAREHOUSE_CODE = "TEST-DASH-E2E-WH";
const FIXTURE_PALLET_NUMBER = "TEST-DASH-E2E-PALLET";
const FIXTURE_TICKET_NUMBER = "MT-DASH-E2E";
const FIXTURE_USER_ID = "e2e-dashboard-fixture-user";
const FIXTURE_BULK_CARTONS = 987;

let fixtureMaterialId: string;
let fixtureWarehouseId: string;
let fixturePalletId: string;
let fixtureTicketId: string;

function hasNoHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.describe.configure({ mode: "serial" });

async function cleanup() {
  const db = getDb();
  await db.delete(maintenanceTickets).where(eq(maintenanceTickets.ticketNumber, FIXTURE_TICKET_NUMBER));
  await db.delete(pallets).where(eq(pallets.palletNumber, FIXTURE_PALLET_NUMBER));
}

test.beforeAll(async () => {
  await cleanup();
  const db = getDb();

  const [existingMaterial] = await db.select().from(materials).where(eq(materials.code, FIXTURE_MATERIAL_CODE));
  fixtureMaterialId = existingMaterial
    ? existingMaterial.id
    : await (async () => {
        const id = crypto.randomUUID();
        await db.insert(materials).values({
          id,
          code: FIXTURE_MATERIAL_CODE,
          description: "E2E dashboard fixture material (TASK-012)",
          uomKgPerCarton: 10,
          category: "E2E-FIXTURE",
          palletWeightLimitKg: 1000,
          palletType: "CARTON",
          plantOrigin: "LIMBASI",
        });
        return id;
      })();

  const [existingWarehouse] = await db.select().from(warehouses).where(eq(warehouses.code, FIXTURE_WAREHOUSE_CODE));
  fixtureWarehouseId = existingWarehouse
    ? existingWarehouse.id
    : await (async () => {
        const id = crypto.randomUUID();
        await db.insert(warehouses).values({
          id,
          code: FIXTURE_WAREHOUSE_CODE,
          name: "E2E dashboard fixture warehouse",
          type: "OWN",
          plant: "LIMBASI",
          sapCode: "LMFGB",
          locationStructure: "RACK",
        });
        return id;
      })();

  fixturePalletId = crypto.randomUUID();
  await db.insert(pallets).values({
    id: fixturePalletId,
    palletNumber: FIXTURE_PALLET_NUMBER,
    palletType: "PLASTIC",
    materialId: fixtureMaterialId,
    statusCode: "BULK",
    totalWeightKg: FIXTURE_BULK_CARTONS * 10,
    totalCartons: FIXTURE_BULK_CARTONS,
    currentWarehouseId: fixtureWarehouseId,
  });

  const [existingUser] = await db.select().from(users).where(eq(users.id, FIXTURE_USER_ID));
  if (!existingUser) {
    await db.insert(users).values({
      id: FIXTURE_USER_ID,
      clerkUserId: "e2e-dashboard-fixture-clerk-user",
      name: "E2E Dashboard Fixture User",
      email: "e2e-dashboard-fixture@example.test",
      roleId: "R03",
      department: "Warehouse",
      plant: "LIMBASI",
    });
  }

  fixtureTicketId = crypto.randomUUID();
  await db.insert(maintenanceTickets).values({
    id: fixtureTicketId,
    ticketNumber: FIXTURE_TICKET_NUMBER,
    category: "FORKLIFT",
    location: "CR1",
    description: "E2E dashboard fixture ticket",
    severity: "CRITICAL",
    status: "OPEN",
    raisedById: FIXTURE_USER_ID,
  });
});

test.afterAll(async () => {
  await cleanup();
});

test.describe("Dashboard - ungated panels reflect real, live DB data", () => {
  test("Bulk Pending KPI includes the real fixture pallet's cartons", async ({ page }) => {
    await page.goto("/dashboard");
    // Loop 50 redesign: Bulk Pending is now a KPI card (label + big value
    // + sub text), not a "Bulk Tracking" section with a "N ctn" line.
    // Scoped to <main> - the sidebar nav also links to some of these
    // exact section names.
    const card = page.locator("main").getByText("Bulk Pending", { exact: true }).locator("xpath=..");
    await expect(card).toBeVisible();
    const cartons = Number((await card.innerText()).match(/[\d,]+/)?.[0].replace(/,/g, "") ?? "0");
    expect(cartons).toBeGreaterThanOrEqual(FIXTURE_BULK_CARTONS);
  });

  test("Maintenance KPI shows at least one real CRITICAL ticket", async ({ page }) => {
    await page.goto("/dashboard");
    const card = page.locator("main").getByText("Maintenance", { exact: true }).locator("xpath=..");
    await expect(card).toBeVisible();
    await expect(card.getByText(/CRITICAL/)).toBeVisible();
  });
});

test.describe("Dashboard - gated panels (no Clerk session, stub mode)", () => {
  test("Hold Tracking, Stock Ledger and In-Out Summary honestly show restricted, not leaked or hidden", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const notices = page.getByText("Your role does not have permission to view this panel.");
    await expect(notices).toHaveCount(3);
  });
});

test.describe("Dashboard - New Receiving Sheet action", () => {
  test("navigates to the real Receiving Sheets screen", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "+ New Receiving Sheet" }).click();
    await expect(page).toHaveURL(/\/inward\/receiving-sheets$/);
  });
});

test.describe("mobile-first behavior (375x667, real data loaded)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("no horizontal scroll once all 10 panels render real data", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Stock Ledger (recent)")).toBeVisible();
    expect(await hasNoHorizontalScroll(page)).toBe(true);
  });
});
