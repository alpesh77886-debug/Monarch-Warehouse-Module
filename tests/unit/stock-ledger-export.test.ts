import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";

/**
 * Loop 28: proves the real DSR-format Excel export actually produces
 * a valid workbook with the real DSR SEPT-2026 column headers, against
 * real local D1 data - same requirePermission-bypass technique as
 * every other mutation/gated-read test in this repo.
 */
vi.mock("@/lib/auth", () => ({
  requirePermission: vi.fn().mockResolvedValue("R12"),
}));

const { GET: exportLedger } = await import("@/app/api/stock/ledger/export/route");

function getRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

describe("GET /api/stock/ledger/export - real DSR-format Excel export", () => {
  it("returns a real .xlsx file with the exact real DSR column headers", async () => {
    const res = await exportLedger(getRequest("/api/stock/ledger/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    const arrayBuffer = await res.arrayBuffer();
    expect(arrayBuffer.byteLength).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const sheet = workbook.getWorksheet("SEPT-2026");
    expect(sheet).toBeDefined();

    const headerRow = sheet!.getRow(1).values as unknown[];
    // exceljs 1-indexes row.values with a leading empty slot.
    const headers = headerRow.slice(1);
    expect(headers).toEqual([
      "DATE",
      "SHIFT",
      "FG CODE",
      "Product",
      "PALLET NO.",
      "BATCH NO",
      "QTY",
      "LOCATION",
      "REMARK",
    ]);

    // Fixture rows from tests/unit/stock-ledger-read.test.ts persist in
    // the shared local D1 file (stock_ledger is append-only - PEN-026),
    // so the export should contain at least those real rows.
    expect(sheet!.rowCount).toBeGreaterThan(1);
  });
});
