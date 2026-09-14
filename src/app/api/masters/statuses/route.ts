import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { statuses } from "../../../../../drizzle/schema";

export const runtime = "nodejs";
// Without this, Next.js statically pre-renders this GET handler at
// build time (it has no request-specific API call to force dynamic
// rendering on its own) and would keep serving that one build-time
// snapshot of the local D1 table forever, never a live read - a real
// bug caught by inspecting the build output's route table (this route
// showed up "○ Static" instead of "ƒ Dynamic").
export const dynamic = "force-dynamic";

// Read-only: Status Master is a fixed, seeded vocabulary (the same 10
// values the materials/pallets/stock_ledger CHECK constraints already
// enforce) - there is no create/edit route because the implementation
// spec itself describes this entity as "read-only, seeded" for TASK-003.
export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select().from(statuses).orderBy(asc(statuses.code));
    return NextResponse.json({ statuses: rows });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
