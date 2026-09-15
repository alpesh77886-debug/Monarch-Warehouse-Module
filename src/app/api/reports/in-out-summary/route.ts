import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { stockLedger, materials } from "../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { aggregateInOut } from "@/lib/business-rules/in-out-summary";
import { UnauthorizedError, ForbiddenError, AuthNotConfiguredError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(err: unknown) {
  if (
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError ||
    err instanceof AuthNotConfiguredError
  ) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

/**
 * In-Out Summary (TASK-011, PEN-031 - Alpesh-approved simple
 * aggregation). Gated on "stock.view_summary", same as the Stock
 * Ledger list - R01/R03/R04/R09/R12 (not a PEN-022 public read).
 */
export async function GET() {
  try {
    await requirePermission("stock.view_summary");

    const db = getDb();
    const rows = await db
      .select({
        date: stockLedger.date,
        shift: stockLedger.shift,
        materialCode: materials.code,
        materialDescription: materials.description,
        transactionType: stockLedger.transactionType,
        qtyChange: stockLedger.qtyChange,
      })
      .from(stockLedger)
      .innerJoin(materials, eq(stockLedger.materialId, materials.id));

    return NextResponse.json({ summary: aggregateInOut(rows) });
  } catch (err) {
    return errorResponse(err);
  }
}
