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
 * Material Master (Loop 29 / PEN-007 resolved): Alpesh answered the
 * pallet_weight_limit_kg blocker directly - "1000kg rakho ya fir
 * pallet limit user khud set kar sake aisa rakho" (default to 1000kg
 * AND make it admin-editable). Both halves are now built: this seeds
 * 972 real, cleaned FG codes from the DSR "FG CODE" sheet at
 * palletWeightLimitKg=1000 (matching the canonical flow document's own
 * worked example, "Material LFG00938 has pallet limit = 1000 kg"), and
 * the PATCH /api/masters/materials/[id] route (see
 * src/app/api/masters/materials/[id]/route.ts) lets R12 change it
 * per-material afterwards. Only insert-if-missing, upsert never
 * overwrites `active`/`palletWeightLimitKg` on a material an admin has
 * already edited - see the loop below for why.
 *
 * Of 1022 raw data rows in the DSR "FG CODE" sheet: 18 excluded (not a
 * valid LFG/SFG material code - 13 are RM-prefixed raw materials,
 * out of FG-module scope, and 5 are sheet junk/subtotal labels: TOTAL,
 * EMPTY, RS, ES, SAMPLE), 9 excluded as duplicate codes (kept the
 * first occurrence), 23 excluded for missing/zero UOM with no
 * reliable value to backfill (checked: parsing the "(NN.Nkg)" weight
 * out of the description text looked promising but disagreed with the
 * real UOM column on 9 of 920 rows checked - an ~1% silent-corruption
 * rate - so this script never backfills, it only uses the sheet's own
 * UOM column). Net: 972 real rows seeded, not fabricated. See
 * drizzle/seed/data/materials.json (generated from the DSR file) and
 * PEN-007 in docs/PENDING_ITEMS.md for the full exclusion accounting,
 * including the 52 rows whose Category cell was blank (seeded as
 * "UNSPECIFIED" - a visible placeholder, not a guessed category - and
 * editable by R12 the same way).
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { statuses, sapCodes, warehouses, locations, materials } from "../schema";
import { STATUS_SEED_ROWS } from "./statuses";
import { SAP_CODE_SEED_ROWS } from "./sap-codes";
import { WAREHOUSE_SEED_ROWS } from "./warehouses";
import { buildLimbasiGrid } from "./limbasi-grid";
import { loadMaterialSeedRows } from "./materials";
import { join } from "node:path";

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

  const materialSourcePath = join(__dirname, "data", "materials.json");
  const materialRows = loadMaterialSeedRows(materialSourcePath);
  let materialsInserted = 0;
  for (const row of materialRows) {
    const [existing] = await db.select().from(materials).where(eq(materials.code, row.code));
    if (existing) {
      // Never overwrite a material an admin may have already edited
      // (active flag, palletWeightLimitKg via the Loop 29
      // PalletWeightEditor UI, category, etc.) - re-running the seed
      // must not silently undo a real admin decision.
      continue;
    }
    await db.insert(materials).values({
      id: crypto.randomUUID(),
      ...row,
      active: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    materialsInserted++;
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${STATUS_SEED_ROWS.length} statuses, ${SAP_CODE_SEED_ROWS.length} SAP codes, ` +
      `${WAREHOUSE_SEED_ROWS.length} warehouse(s), up to ${locationCount} real Limbasi CR1/CR2 locations, ` +
      `and ${materialsInserted} of ${materialRows.length} real FG materials (already-existing codes left untouched) into local D1.`
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
