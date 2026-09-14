/**
 * Seed runner (Loop 22) - the missing `npm run db:seed` the
 * implementation spec's TASK-001 acceptance test already names, never
 * actually wired until now. Applies the already-verified Status
 * Master (10 rows) and SAP Warehouse Master (45 FG-relevant rows) seed
 * data to the real local D1 file, the same one every other command in
 * this repository (`npx wrangler d1 migrations apply DB --local`,
 * this app's own API routes) reads and writes. Upserts by primary key
 * so running it again is safe, not a fresh-insert-only script.
 *
 * Material Master is intentionally NOT seeded here - see
 * drizzle/seed/materials.ts and PEN-007: no verified source data
 * exists yet, and this script must not fabricate any.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { statuses, sapCodes } from "../schema";
import { STATUS_SEED_ROWS } from "./statuses";
import { SAP_CODE_SEED_ROWS } from "./sap-codes";

async function main() {
  const db = getDb();

  for (const row of STATUS_SEED_ROWS) {
    const [existing] = await db.select().from(statuses).where(eq(statuses.code, row.code));
    if (existing) {
      await db.update(statuses).set(row).where(eq(statuses.code, row.code));
    } else {
      await db.insert(statuses).values(row);
    }
  }

  for (const row of SAP_CODE_SEED_ROWS) {
    const [existing] = await db.select().from(sapCodes).where(eq(sapCodes.sapCode, row.sapCode));
    if (existing) {
      await db.update(sapCodes).set(row).where(eq(sapCodes.sapCode, row.sapCode));
    } else {
      await db.insert(sapCodes).values(row);
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${STATUS_SEED_ROWS.length} statuses and ${SAP_CODE_SEED_ROWS.length} SAP codes into local D1.`
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
