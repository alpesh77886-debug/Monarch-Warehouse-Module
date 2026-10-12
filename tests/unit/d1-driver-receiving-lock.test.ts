import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { planReceivingSheetLock } from "../../src/lib/receiving-sheet-lock";
import { runAtomicBatch, type getDb } from "../../src/lib/db";

// Every other live test runs on the local better-sqlite3 driver, whose
// queries return synchronously. Production runs on Cloudflare D1, whose
// queries return Promises. This test runs the lock planner on a real D1
// binding (Miniflare) so a missing `await` cannot pass locally and fail live.
const MIGRATIONS_DIR = join(__dirname, "../../drizzle/migrations");

let mf: Miniflare;
let db: ReturnType<typeof drizzleD1<typeof schema>>;

beforeAll(async () => {
  // Miniflare talks to its local workerd over 127.0.0.1; an HTTP(S)_PROXY in
  // the environment must not intercept that.
  for (const key of ["NO_PROXY", "no_proxy"]) {
    process.env[key] = [process.env[key], "localhost", "127.0.0.1"].filter(Boolean).join(",");
  }
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: ["DB"],
    })
  );
  const d1 = await mf.getD1Database("DB");
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const statements = readFileSync(join(MIGRATIONS_DIR, file), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);
    for (const statement of statements) {
      await d1.prepare(statement).run();
    }
  }
  db = drizzleD1(d1, { schema });

  await db.insert(schema.users).values({
    id: "d1-user",
    clerkUserId: "d1-clerk",
    name: "D1 Test",
    email: "d1@test.local",
    roleId: "R01",
    department: "WAREHOUSE",
    plant: "LIMBASI",
  });
  await db.insert(schema.warehouses).values({
    id: "d1-wh",
    code: "D1-WH",
    name: "D1 Warehouse",
    type: "OWN",
    plant: "LIMBASI",
    sapCode: "SKFG",
    locationStructure: "RACK",
  });
  await db.insert(schema.materials).values({
    id: "d1-mat",
    code: "LFGD1TEST",
    description: "D1 driver test material",
    uomKgPerCarton: 10,
    category: "TEST",
    palletWeightLimitKg: 1000,
    palletType: "CARTON",
    plantOrigin: "LIMBASI",
  });
  await db.insert(schema.receivingSheets).values({
    id: "d1-sheet",
    sheetNumber: "RS-2026-1012-901",
    date: "2026-10-12",
    shift: "A",
    line: "FF",
    materialId: "d1-mat",
    batchNumber: "L26J120901",
    defaultPalletStatus: "QC_HOLD",
    status: "PENDING_WAREHOUSE",
  });
  await db.insert(schema.receivingSheetPallets).values({
    id: "d1-row-1",
    receivingSheetId: "d1-sheet",
    srNo: 1,
    palletNumber: "D1-P-1",
    qty: 40,
    receivingTime: "10:00",
    cartonCondition: "OK",
  });
}, 60_000);

afterAll(async () => {
  await mf?.dispose();
});

describe("receiving sheet lock on the real Cloudflare D1 driver", () => {
  it("plans and applies the lock: one pallet, one batch, one INWARD ledger row", async () => {
    const asDb = db as unknown as ReturnType<typeof getDb>;
    const plan = await planReceivingSheetLock(asDb, "d1-sheet", "d1-user");
    expect(plan.totalQty).toBe(40);
    expect(plan.totalWeightKg).toBe(400);
    await runAtomicBatch(asDb, [plan.statements[0], ...plan.statements.slice(1)]);

    const created = await db.select().from(schema.pallets).where(eq(schema.pallets.palletNumber, "D1-P-1"));
    expect(created).toHaveLength(1);
    expect(created[0].totalCartons).toBe(40);
    expect(created[0].statusCode).toBe("QC_HOLD");
    const ledger = await db.select().from(schema.stockLedger).where(eq(schema.stockLedger.palletId, created[0].id));
    expect(ledger).toHaveLength(1);
    expect(ledger[0].qtyChange).toBe(40);
  });
});
