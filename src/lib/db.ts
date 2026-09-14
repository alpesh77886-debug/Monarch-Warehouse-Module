import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "../../drizzle/schema";

/**
 * LOCAL-ONLY database connection (Loop 21).
 *
 * Cloudflare D1's real wire protocol only exists inside a Workers/Pages
 * runtime (an `env.DB` binding), which this Next.js dev/test process
 * does not run inside - there is no `@cloudflare/next-on-pages` (or
 * equivalent) adapter in this repository yet, and wiring one is an
 * infrastructure decision outside this loop's bounded scope (masters
 * CRUD), not something to guess here. See docs/PENDING_ITEMS.md PEN-020.
 *
 * What this file does instead, and why it is still genuinely "D1 local,
 * not a second source of truth": `npx wrangler d1 migrations apply DB
 * --local` (the same command every prior loop used) drives Miniflare's
 * real D1 simulator, which stores its data as an ordinary SQLite file
 * under `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`.
 * This module opens that exact file with better-sqlite3 and wraps it
 * with the same `drizzle/schema.ts` used everywhere else in this repo
 * (sqlite-core table defs are dialect-agnostic between the D1 driver and
 * the better-sqlite3 driver). No schema, table, or row is created here
 * that the checked-in migrations did not already create - if the file
 * or the expected tables are missing, this throws rather than silently
 * creating a divergent schema.
 *
 * Production (a real deployed Cloudflare Pages/Workers runtime with a
 * genuine `env.DB` binding) is NOT wired by this file and must not be
 * assumed to work until that adapter exists and is verified against a
 * real remote D1 database - gate #10 in the loop-21 authorization.
 */

const STATE_DIR = join(process.cwd(), ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");

export class LocalD1NotProvisionedError extends Error {
  constructor(dir: string) {
    super(
      `No local D1 state found at "${dir}". Run ` +
        `\`npx wrangler d1 migrations apply DB --local\` first - this module ` +
        `never creates schema on its own, only connects to what the checked-in ` +
        `migrations already created.`
    );
    this.name = "LocalD1NotProvisionedError";
  }
}

function resolveLocalD1SqliteFile(): string {
  let entries: string[];
  try {
    entries = readdirSync(STATE_DIR);
  } catch {
    throw new LocalD1NotProvisionedError(STATE_DIR);
  }
  const dbFile = entries.find((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
  if (!dbFile) {
    throw new LocalD1NotProvisionedError(STATE_DIR);
  }
  return join(STATE_DIR, dbFile);
}

let sqlite: InstanceType<typeof Database> | undefined;

/** Returns a Drizzle instance bound to the real local D1 (Miniflare) SQLite file. */
export function getDb() {
  if (!sqlite) {
    // No connection-level SQLite setting is forced here on purpose:
    // none of the checked-in migrations set one either, and a real
    // Cloudflare D1 connection is not this better-sqlite3 object -
    // asserting a setting this local stand-in cannot promise the real
    // D1 runtime shares would not be actually verified. Referential
    // integrity for materials CRUD (this loop's scope) does not depend
    // on it: the materials table has no incoming/outgoing foreign key
    // in play for create/list/deactivate.
    sqlite = new Database(resolveLocalD1SqliteFile());
  }
  return drizzle(sqlite, { schema });
}
