import { and, eq, inArray } from "drizzle-orm";
import type { getDb } from "./db";
import { loadingSheets, loadingSheetPallets, transferOrders, transferOrderPallets } from "../../drizzle/schema";

// A pallet picked onto a loading sheet or transfer order stays booked to it
// until that document finishes: a DISPATCHED sheet has shipped it, a
// RECEIVED/COMPLETED transfer has delivered it.
export const OPEN_LOADING_SHEET_STATUSES = ["DRAFT", "STAGING", "LOADED", "VERIFIED", "GATE_PASSED"] as const;
export const OPEN_TRANSFER_ORDER_STATUSES = ["DRAFT", "PICKED", "LOADED", "IN_TRANSIT"] as const;

export type PalletCommitment = {
  palletId: string;
  kind: "LOADING_SHEET" | "TRANSFER_ORDER";
  documentId: string;
  documentNumber: string;
  documentStatus: string;
};

export async function findPalletCommitments(
  db: ReturnType<typeof getDb>,
  palletIds?: string[]
): Promise<PalletCommitment[]> {
  if (palletIds && palletIds.length === 0) return [];
  const sheetRows = await db
    .select({
      palletId: loadingSheetPallets.palletId,
      documentId: loadingSheets.id,
      documentNumber: loadingSheets.loadingSheetNumber,
      documentStatus: loadingSheets.status,
    })
    .from(loadingSheetPallets)
    .innerJoin(loadingSheets, eq(loadingSheetPallets.loadingSheetId, loadingSheets.id))
    .where(
      and(
        inArray(loadingSheets.status, [...OPEN_LOADING_SHEET_STATUSES]),
        palletIds ? inArray(loadingSheetPallets.palletId, palletIds) : undefined
      )
    );
  const transferRows = await db
    .select({
      palletId: transferOrderPallets.palletId,
      documentId: transferOrders.id,
      documentNumber: transferOrders.transferNumber,
      documentStatus: transferOrders.status,
    })
    .from(transferOrderPallets)
    .innerJoin(transferOrders, eq(transferOrderPallets.transferOrderId, transferOrders.id))
    .where(
      and(
        inArray(transferOrders.status, [...OPEN_TRANSFER_ORDER_STATUSES]),
        palletIds ? inArray(transferOrderPallets.palletId, palletIds) : undefined
      )
    );
  return [
    ...sheetRows.map((r) => ({ ...r, kind: "LOADING_SHEET" as const })),
    ...transferRows.map((r) => ({ ...r, kind: "TRANSFER_ORDER" as const })),
  ];
}

export function describeCommitment(palletNumber: string, c: PalletCommitment): string {
  const doc = c.kind === "LOADING_SHEET" ? "loading sheet" : "transfer order";
  return `Pallet ${palletNumber} is already booked on ${doc} ${c.documentNumber} (${c.documentStatus}).`;
}
