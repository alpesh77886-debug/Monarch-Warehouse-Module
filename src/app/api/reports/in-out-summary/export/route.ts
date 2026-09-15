import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import ExcelJS from "exceljs";
import { getDb } from "@/lib/db";
import { stockLedger, materials, pallets, batches } from "../../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { aggregateInOut, directionForTransactionType } from "@/lib/business-rules/in-out-summary";
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
 * In-Out Summary Excel export (TASK-011, PEN-031). Alpesh's own
 * instruction: "aisi jitni bhi details hai ye download me chahiye" -
 * the download is not just the aggregate numbers, it also carries
 * every real stock_ledger row that fed them, on a second sheet, so
 * the aggregate is always traceable back to real transactions rather
 * than trusted blind. Gated on "stock.export", same as the Stock
 * Ledger export (R03/R09/R12).
 */
export async function GET() {
  try {
    await requirePermission("stock.export");

    const db = getDb();
    const ledgerRows = await db
      .select({
        date: stockLedger.date,
        shift: stockLedger.shift,
        materialCode: materials.code,
        materialDescription: materials.description,
        transactionType: stockLedger.transactionType,
        qtyChange: stockLedger.qtyChange,
        palletNumber: pallets.palletNumber,
        batchNumber: batches.batchNumber,
        remarks: stockLedger.remarks,
      })
      .from(stockLedger)
      .innerJoin(materials, eq(stockLedger.materialId, materials.id))
      .innerJoin(pallets, eq(stockLedger.palletId, pallets.id))
      .innerJoin(batches, eq(stockLedger.batchId, batches.id))
      .orderBy(desc(stockLedger.createdAt));

    const summary = aggregateInOut(ledgerRows);

    const workbook = new ExcelJS.Workbook();

    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.columns = [
      { header: "DATE", key: "date", width: 12 },
      { header: "SHIFT", key: "shift", width: 8 },
      { header: "FG CODE", key: "fgCode", width: 14 },
      { header: "Product", key: "product", width: 40 },
      { header: "IN QTY", key: "inQty", width: 12 },
      { header: "OUT QTY", key: "outQty", width: 12 },
      { header: "NET QTY", key: "netQty", width: 12 },
    ];
    summarySheet.getRow(1).font = { name: "Arial", bold: true };
    for (const row of summary) {
      summarySheet.addRow({
        date: row.date,
        shift: row.shift,
        fgCode: row.materialCode,
        product: row.materialDescription,
        inQty: row.inQty,
        outQty: row.outQty,
        netQty: row.netQty,
      });
    }
    for (let i = 2; i <= summary.length + 1; i++) {
      summarySheet.getRow(i).font = { name: "Arial" };
    }

    // Full detail - every real ledger row that contributed to (or was
    // deliberately excluded from, as a status-only transition) the
    // summary above, so nothing on the Summary sheet is a number
    // without a traceable source.
    const detailSheet = workbook.addWorksheet("Detail");
    detailSheet.columns = [
      { header: "DATE", key: "date", width: 12 },
      { header: "SHIFT", key: "shift", width: 8 },
      { header: "FG CODE", key: "fgCode", width: 14 },
      { header: "Product", key: "product", width: 40 },
      { header: "TRANSACTION TYPE", key: "transactionType", width: 18 },
      { header: "DIRECTION", key: "direction", width: 12 },
      { header: "QTY CHANGE", key: "qtyChange", width: 12 },
      { header: "PALLET NO.", key: "palletNo", width: 12 },
      { header: "BATCH NO", key: "batchNo", width: 16 },
      { header: "REMARK", key: "remark", width: 24 },
    ];
    detailSheet.getRow(1).font = { name: "Arial", bold: true };
    for (const row of ledgerRows) {
      detailSheet.addRow({
        date: row.date,
        shift: row.shift,
        fgCode: row.materialCode,
        product: row.materialDescription,
        transactionType: row.transactionType,
        direction: directionForTransactionType(row.transactionType) ?? "-",
        qtyChange: row.qtyChange,
        palletNo: row.palletNumber,
        batchNo: row.batchNumber,
        remark: row.remarks ?? "",
      });
    }
    for (let i = 2; i <= ledgerRows.length + 1; i++) {
      detailSheet.getRow(i).font = { name: "Arial" };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="in-out-summary-export.xlsx"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
