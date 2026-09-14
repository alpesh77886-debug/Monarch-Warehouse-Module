import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, count } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { stockLedger, materials } from "../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { UnauthorizedError, ForbiddenError, AuthNotConfiguredError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const TRANSACTION_TYPES = [
  "INWARD",
  "MOVE",
  "HOLD",
  "RELEASE",
  "DISPATCH",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "ADJUSTMENT",
  "BULK_SEND",
  "BULK_RECEIVE",
] as const;

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
 * Stock Ledger list, paginated and filterable by transaction_type
 * (TASK-011's own "list (paginated, filterable)" scope - the Excel
 * export, In-Out Summary, and FIFO Aging Report are separate TASK-011
 * bullets not built this loop).
 *
 * Gated by "stock.view_ledger", unlike the masters/pallets read
 * routes (PEN-022): the architecture blueprint's own Action
 * Permission Matrix explicitly lists "View Stock Ledger" as
 * role-restricted (R01/R03/R04/R09/R12 only) - a real, locked rule
 * the other read routes never had, so this one is not treated the
 * same way.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission("stock.view_ledger");

    const { searchParams } = new URL(request.url);
    const pageParam = Number(searchParams.get("page") ?? "1");
    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
    const transactionType = searchParams.get("transactionType");
    const typeFilter =
      transactionType && (TRANSACTION_TYPES as readonly string[]).includes(transactionType)
        ? (transactionType as (typeof TRANSACTION_TYPES)[number])
        : null;

    const db = getDb();
    const whereClause = typeFilter ? eq(stockLedger.transactionType, typeFilter) : undefined;

    const [{ total }] = await db
      .select({ total: count() })
      .from(stockLedger)
      .where(whereClause);

    const rows = await db
      .select({
        id: stockLedger.id,
        date: stockLedger.date,
        shift: stockLedger.shift,
        transactionType: stockLedger.transactionType,
        materialCode: materials.code,
        qtyChange: stockLedger.qtyChange,
        qtyAfter: stockLedger.qtyAfter,
        weightChangeKg: stockLedger.weightChangeKg,
        weightAfterKg: stockLedger.weightAfterKg,
        statusBefore: stockLedger.statusBefore,
        statusAfter: stockLedger.statusAfter,
        referenceType: stockLedger.referenceType,
        referenceId: stockLedger.referenceId,
        remarks: stockLedger.remarks,
        createdAt: stockLedger.createdAt,
      })
      .from(stockLedger)
      .innerJoin(materials, eq(stockLedger.materialId, materials.id))
      .where(whereClause)
      .orderBy(desc(stockLedger.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    return NextResponse.json({
      entries: rows,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
