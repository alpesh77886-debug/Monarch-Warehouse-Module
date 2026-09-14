import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { getDb } from "@/lib/db";
import { stockLedger, materials, pallets, batches, locations } from "../../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
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
 * Stock Ledger Excel export (TASK-011, DEC-006 "matching DSR format").
 * Gated by "stock.export" - the architecture blueprint's own Action
 * Permission Matrix restricts "Export Reports" to R03/R09/R12, unlike
 * "View Stock Ledger" itself (R01/R03/R04/R09/R12 - see the ledger
 * list route).
 *
 * Column headers/order below are transcribed exactly from the real
 * DSR SEPT-2026 sheet Alpesh provided (row 1: DATE, SHIFT, FG CODE,
 * Product, PALLET NO., BATCH NO, QTY, LOCATION, REMARK, DISPATCH
 * DATE, DISPATCH QTY, BALANCE, VEHICLE NO, LOCATION, WMS IN, WMS IN
 * PERSON) - not guessed, and this is what closes the gap this project
 * called "the same class of gap as PEN-007" before that file existed.
 *
 * What is NOT included, and why: DISPATCH DATE, DISPATCH QTY,
 * BALANCE, VEHICLE NO, WMS IN, WMS IN PERSON. The real DSR sheet is
 * one mutable row per pallet, updated later with dispatch details -
 * this system's stock_ledger is append-only (INV-009) and explicitly
 * replaces that sheet with one immutable row per transaction instead,
 * so there is no single row to read those fields from, and the
 * schema itself does not track vehicle number or WMS-entry fields at
 * all yet (those belong to the still-uncontracted Loading
 * Sheet/Gate Pass entities - PEN-014). Exporting fabricated blank
 * columns for these would look complete without being complete;
 * omitting them is the honest choice, not a shortcut.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission("stock.export");

    const { searchParams } = new URL(request.url);
    const transactionType = searchParams.get("transactionType");

    const db = getDb();
    const whereClause = transactionType ? eq(stockLedger.transactionType, transactionType) : undefined;

    const rows = await db
      .select({
        date: stockLedger.date,
        shift: stockLedger.shift,
        materialCode: materials.code,
        materialDescription: materials.description,
        palletNumber: pallets.palletNumber,
        batchNumber: batches.batchNumber,
        qtyChange: stockLedger.qtyChange,
        locationCode: locations.fullCode,
        remarks: stockLedger.remarks,
      })
      .from(stockLedger)
      .innerJoin(materials, eq(stockLedger.materialId, materials.id))
      .innerJoin(pallets, eq(stockLedger.palletId, pallets.id))
      .innerJoin(batches, eq(stockLedger.batchId, batches.id))
      .leftJoin(locations, eq(stockLedger.locationId, locations.id))
      .where(whereClause)
      .orderBy(desc(stockLedger.createdAt));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("SEPT-2026");
    sheet.columns = [
      { header: "DATE", key: "date", width: 12 },
      { header: "SHIFT", key: "shift", width: 8 },
      { header: "FG CODE", key: "fgCode", width: 14 },
      { header: "Product", key: "product", width: 40 },
      { header: "PALLET NO.", key: "palletNo", width: 12 },
      { header: "BATCH NO", key: "batchNo", width: 16 },
      { header: "QTY", key: "qty", width: 10 },
      { header: "LOCATION", key: "location", width: 16 },
      { header: "REMARK", key: "remark", width: 24 },
    ];
    sheet.getRow(1).font = { name: "Arial", bold: true };
    sheet.eachColumnKey?.((col) => (col.font = { name: "Arial" }));

    for (const row of rows) {
      sheet.addRow({
        date: row.date,
        shift: row.shift,
        fgCode: row.materialCode,
        product: row.materialDescription,
        palletNo: row.palletNumber,
        batchNo: row.batchNumber,
        qty: row.qtyChange,
        location: row.locationCode ?? "",
        remark: row.remarks ?? "",
      });
    }
    for (let i = 2; i <= rows.length + 1; i++) {
      sheet.getRow(i).font = { name: "Arial" };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="stock-ledger-export.xlsx"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
