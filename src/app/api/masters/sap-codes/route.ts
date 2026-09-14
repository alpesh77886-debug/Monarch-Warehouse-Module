import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sapCodes } from "../../../../../drizzle/schema";

export const runtime = "nodejs";
// See the matching comment in src/app/api/masters/statuses/route.ts -
// without this, Next.js would statically pre-render this GET handler
// at build time and never read the live local D1 table again.
export const dynamic = "force-dynamic";

// Read-only after seed, per the implementation spec's own TASK-003
// scope ("SAP Warehouse Master (read-only after seed, R12 edit)") -
// R12 edit is not built this loop; only the read path is.
export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select().from(sapCodes).orderBy(asc(sapCodes.sapCode));
    return NextResponse.json({ sapCodes: rows });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
