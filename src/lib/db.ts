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

// Loop 27 finding: Miniflare names this file deterministically from
// the binding name + database_id in wrangler.toml, so changing
// database_id (e.g. switching a placeholder to a real one, as this
// loop did) leaves the OLD file behind alongside a freshly created
// one - two real candidates in the same directory at once. Silently
// picking "whichever readdirSync happens to return first" could
// connect the app to stale, orphaned local data without anyone
// noticing. Failing loudly here is safer than guessing.
export class AmbiguousLocalD1StateError extends Error {
  constructor(dir: string, candidates: string[]) {
    super(
      `Found ${candidates.length} candidate local D1 SQLite files in "${dir}": ` +
        `${candidates.join(", ")}. This usually means wrangler.toml's database_id ` +
        `changed and an old file was left behind - delete the stale one(s) and keep ` +
        `only the file matching the current database_id, rather than guessing which to use.`
    );
    this.name = "AmbiguousLocalD1StateError";
  }
}

function resolveLocalD1SqliteFile(): string {
  let entries: string[];
  try {
    entries = readdirSync(STATE_DIR);
  } catch {
    throw new LocalD1NotProvisionedError(STATE_DIR);
  }
  const dbFiles = entries.filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
  if (dbFiles.length === 0) {
    throw new LocalD1NotProvisionedError(STATE_DIR);
  }
  if (dbFiles.length > 1) {
    throw new AmbiguousLocalD1StateError(STATE_DIR, dbFiles);
  }
  return join(STATE_DIR, dbFiles[0]);
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
