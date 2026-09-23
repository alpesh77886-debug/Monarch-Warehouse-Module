/**
 * Prints the same master-data seed that `run.ts` applies to local D1, as
 * plain idempotent SQL (`INSERT OR IGNORE`, keyed by each table's own
 * unique column) - for the remote/production D1, which `run.ts` cannot
 * reach. Usage (from the repo root, where wrangler is authenticated):
 *
 *   npx tsx drizzle/seed/export-sql.ts > /tmp/prod-seed.sql
 *   npx wrangler d1 execute DB --remote --file=/tmp/prod-seed.sql
 *
 * Re-running is safe: existing statuses/SAP codes/warehouses/locations/
 * materials are left untouched (never overwrites an admin's edits or a
 * location's real occupancy), exactly like run.ts's own insert-if-missing
 * behavior for locations and materials.
 */
import { getTableColumns, type Table } from "drizzle-orm";
import { join } from "node:path";
import { statuses, sapCodes, warehouses, locations, materials } from "../schema";
import { STATUS_SEED_ROWS } from "./statuses";
import { SAP_CODE_SEED_ROWS } from "./sap-codes";
import { WAREHOUSE_SEED_ROWS } from "./warehouses";
import { buildLimbasiGrid } from "./limbasi-grid";
import { loadMaterialSeedRows } from "./materials";

const WAREHOUSE_ID_PLACEHOLDER = "__LIMBASI_WAREHOUSE_ID__";
const BATCH_SIZE = 200;

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v === WAREHOUSE_ID_PLACEHOLDER) return "(SELECT id FROM warehouses WHERE code = 'LIMBASI-FG')";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function inserts(table: Table, tableName: string, rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  const columns = getTableColumns(table);
  const keys = Object.keys(rows[0]);
  const colNames = keys.map((k) => {
    const col = (columns as Record<string, { name: string }>)[k];
    if (!col) throw new Error(`Unknown column "${k}" on ${tableName}`);
    return `\`${col.name}\``;
  });
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const values = rows
      .slice(i, i + BATCH_SIZE)
      .map((r) => `(${keys.map((k) => sqlValue(r[k])).join(", ")})`)
      .join(",\n");
    out.push(`INSERT OR IGNORE INTO \`${tableName}\` (${colNames.join(", ")}) VALUES\n${values};`);
  }
  return out;
}

function main() {
  const now = new Date().toISOString();
  const statements: string[] = [];

  statements.push(...inserts(statuses, "statuses", STATUS_SEED_ROWS as unknown as Record<string, unknown>[]));
  statements.push(...inserts(sapCodes, "sap_codes", SAP_CODE_SEED_ROWS as unknown as Record<string, unknown>[]));
  statements.push(
    ...inserts(
      warehouses,
      "warehouses",
      WAREHOUSE_SEED_ROWS.map((row) => ({ id: crypto.randomUUID(), ...row, active: 1, createdAt: now }))
    )
  );
  statements.push(
    ...inserts(
      locations,
      "locations",
      buildLimbasiGrid(WAREHOUSE_ID_PLACEHOLDER).map((row) => ({
        id: crypto.randomUUID(),
        warehouseId: row.warehouseId,
        coldRoom: row.coldRoom,
        block: row.block,
        position: row.position,
        floor: row.floor,
        fullCode: row.fullCode,
        capacityPallets: row.capacityPallets,
        status: "EMPTY",
        createdAt: now,
      }))
    )
  );
  statements.push(
    ...inserts(
      materials,
      "materials",
      loadMaterialSeedRows(join(__dirname, "data", "materials.json")).map((row) => ({
        id: crypto.randomUUID(),
        ...row,
        active: 1,
        createdAt: now,
        updatedAt: now,
      }))
    )
  );

  process.stdout.write(statements.join("\n\n") + "\n");
}

main();
