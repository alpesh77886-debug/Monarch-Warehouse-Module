/**
 * In-Out Summary (Loop 39 / TASK-011, PEN-031 - Alpesh-approved scope).
 *
 * The real DSR "IN-OUT" sheet turned out to be four unrelated
 * print-layout sub-reports stacked side by side with no row-level
 * correspondence between them (see PEN-031's own finding) - a literal
 * match was never going to be a faithful reading of it. Alpesh decided
 * (Loop 39): build the simpler, real reading instead - a genuine IN vs
 * OUT quantity aggregation by material/shift/day, computed from
 * stock_ledger's own transaction_type field, "hum baad me sochenge" for
 * anything closer to the literal sheet.
 *
 * IN = a transaction_type that represents material physically arriving
 * at a warehouse; OUT = physically leaving one. The status-only
 * transitions this project already has real ledger rows for (HOLD,
 * RELEASE, MOVE, ADJUSTMENT) are neither - a hold/release doesn't change
 * how much material exists, so they are deliberately excluded from both
 * buckets rather than double-counted or guessed into one.
 */

export const IN_TRANSACTION_TYPES = ["INWARD", "TRANSFER_IN", "BULK_RECEIVE"] as const;
export const OUT_TRANSACTION_TYPES = ["DISPATCH", "TRANSFER_OUT", "BULK_SEND"] as const;

export type InOutDirection = "IN" | "OUT" | null;

export function directionForTransactionType(transactionType: string): InOutDirection {
  if ((IN_TRANSACTION_TYPES as readonly string[]).includes(transactionType)) return "IN";
  if ((OUT_TRANSACTION_TYPES as readonly string[]).includes(transactionType)) return "OUT";
  return null;
}

export type InOutLedgerRow = {
  date: string;
  shift: string;
  materialCode: string;
  materialDescription: string;
  transactionType: string;
  qtyChange: number;
};

export type InOutSummaryRow = {
  date: string;
  shift: string;
  materialCode: string;
  materialDescription: string;
  inQty: number;
  outQty: number;
  netQty: number;
};

/**
 * Groups real stock_ledger rows into one summary row per (date, shift,
 * material) - a pure function over already-loaded rows, so it is
 * testable without a database and reusable by both the report API and
 * its Excel export.
 */
export function aggregateInOut(rows: InOutLedgerRow[]): InOutSummaryRow[] {
  const byKey = new Map<string, InOutSummaryRow>();
  for (const row of rows) {
    const direction = directionForTransactionType(row.transactionType);
    if (!direction) continue;

    const key = `${row.date}|${row.shift}|${row.materialCode}`;
    let summary = byKey.get(key);
    if (!summary) {
      summary = {
        date: row.date,
        shift: row.shift,
        materialCode: row.materialCode,
        materialDescription: row.materialDescription,
        inQty: 0,
        outQty: 0,
        netQty: 0,
      };
      byKey.set(key, summary);
    }
    const qty = Math.abs(row.qtyChange);
    if (direction === "IN") summary.inQty += qty;
    else summary.outQty += qty;
    summary.netQty = summary.inQty - summary.outQty;
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.date === b.date
      ? a.shift === b.shift
        ? a.materialCode.localeCompare(b.materialCode)
        : a.shift.localeCompare(b.shift)
      : a.date.localeCompare(b.date)
  );
}
