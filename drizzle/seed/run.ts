/**
 * Seed runner (Loop 22) - the missing `npm run db:seed` the
 * implementation spec's TASK-001 acceptance test already names, never
 * actually wired until now. Applies the already-verified Status
 * Master (10 rows), SAP Warehouse Master (45 FG-relevant rows), the
 * real Limbasi warehouse, and the real Limbasi CR1/CR2 location grid
 * (Loop 28 - see drizzle/seed/warehouses.ts and
 * drizzle/seed/limbasi-grid.ts) to the real local D1 file, the same
 * one every other command in this repository
 * (`npx wrangler d1 migrations apply DB --local`, this app's own API
 * routes) reads and writes. Upserts by natural key so running it
 * again is safe, not a fresh-insert-only script.
 *
 * Material Master is intentionally NOT seeded here yet - see
 * drizzle/seed/materials.ts and PEN-007: real source data now exists
 * (the same DSR Excel file), but one required field
 * (pallet_weight_limit_kg) has no source anywhere in it, and this
 * script must not fabricate a number for ~1000 different real
 * materials. See docs/PENDING_ITEMS.md for the exact question this is
 * waiting on.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { statuses, sapCodes, warehouses, locations } from "../schema";
import { STATUS_SEED_ROWS } from "./statuses";
import { SAP_CODE_SEED_ROWS } from "./sap-codes";
import { WAREHOUSE_SEED_ROWS } from "./warehouses";
import { buildLimbasiGrid } from "./limbasi-grid";

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

  const warehouseIdByCode: Record<string, string> = {};
  for (const row of WAREHOUSE_SEED_ROWS) {
    const [existing] = await db.select().from(warehouses).where(eq(warehouses.code, row.code));
    if (existing) {
      await db.update(warehouses).set(row).where(eq(warehouses.code, row.code));
      warehouseIdByCode[row.code] = existing.id;
    } else {
      const id = crypto.randomUUID();
      await db.insert(warehouses).values({ id, ...row, active: 1, createdAt: new Date().toISOString() });
      warehouseIdByCode[row.code] = id;
    }
  }

  let locationCount = 0;
  const limbasiWarehouseId = warehouseIdByCode["LIMBASI-FG"];
  if (limbasiWarehouseId) {
    const grid = buildLimbasiGrid(limbasiWarehouseId);
    locationCount = grid.length;
    for (const row of grid) {
      const [existing] = await db.select().from(locations).where(eq(locations.fullCode, row.fullCode));
      if (!existing) {
        // Never overwrite an existing location's occupancy fields
        // (status/current_pallet_id) on re-seed - only insert rows
        // that don't exist yet, so a real putaway/move done through
        // the app is never silently reset by running this script
        // again.
        await db.insert(locations).values({
          id: crypto.randomUUID(),
          warehouseId: row.warehouseId,
          coldRoom: row.coldRoom,
          block: row.block,
          position: row.position,
          floor: row.floor,
          fullCode: row.fullCode,
          capacityPallets: row.capacityPallets,
          status: "EMPTY",
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${STATUS_SEED_ROWS.length} statuses, ${SAP_CODE_SEED_ROWS.length} SAP codes, ` +
      `${WAREHOUSE_SEED_ROWS.length} warehouse(s), and up to ${locationCount} real Limbasi CR1/CR2 locations into local D1.`
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
