import { NextResponse } from "next/server";
import { eq, desc, count, sum, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  pallets,
  holdRecords,
  holdPallets,
  materials,
  batches,
  locations,
  loadingSheets,
  transferOrders,
  maintenanceTickets,
  stockLedger,
} from "../../../../drizzle/schema";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { holdAgeDays, holdAgeBucket } from "@/lib/business-rules/hold";
import { bulkAgeDays } from "@/lib/business-rules/bulk";
import { buildStockSnapshot, buildRackMiniSummary } from "@/lib/business-rules/dashboard";
import { aggregateInOut, type InOutLedgerRow } from "@/lib/business-rules/in-out-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Main Dashboard (SCREEN-001, TASK-012) - "single screen to see
 * everything", so this endpoint itself is not gated (same PEN-022
 * reasoning already applied to Bulk/Transfers/Maintenance/Locations:
 * no role has an explicit "view dashboard" grant anywhere in the real
 * permission matrix). Two of its ten panels DO surface data the matrix
 * explicitly restricts elsewhere though (Hold Tracking via `holds.view`,
 * Stock Ledger recent + In-Out Summary via `stock.view_ledger`/
 * `stock.view_summary`) - those panels are individually soft-checked
 * against the caller's own real role and returned as `{ restricted:
 * true }` instead of data when the viewer's role lacks that permission
 * (or there is no session at all), rather than either leaking gated
 * data through an aggregation endpoint or hard-blocking the whole
 * screen for roles that are entitled to see the other eight panels.
 * This is the real, contracted meaning given to "Role-based dashboard
 * variants" (an explicit acceptance test) - not an invented per-role
 * panel-visibility scheme.
 */
export async function GET() {
  try {
    const db = getDb();
    const { role } = await getCurrentUser();
    const canViewHolds = hasPermission(role, "holds.view");
    const canViewLedger = hasPermission(role, "stock.view_ledger");
    const canViewSummary = hasPermission(role, "stock.view_summary");

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();

    // D-01 Stock Snapshot
    const palletRows = await db
      .select({ statusCode: pallets.statusCode, totalCartons: pallets.totalCartons, createdAt: pallets.createdAt })
      .from(pallets);
    const stockSnapshot = buildStockSnapshot(palletRows, now);

    // D-02 Hold Tracking (restricted to holds.view)
    let holdTracking:
      | { restricted: true }
      | { restricted: false; activeCount: number; totalCartons: number; red: number; amber: number; ok: number };
    if (!canViewHolds) {
      holdTracking = { restricted: true };
    } else {
      const activeHolds = await db
        .select({ id: holdRecords.id, placedAt: holdRecords.placedAt })
        .from(holdRecords)
        .where(eq(holdRecords.status, "ACTIVE"));
      const cartonAggregates =
        activeHolds.length === 0
          ? []
          : await db
              .select({ holdId: holdPallets.holdId, totalCartons: sum(pallets.totalCartons) })
              .from(holdPallets)
              .innerJoin(pallets, eq(holdPallets.palletId, pallets.id))
              .where(
                inArray(
                  holdPallets.holdId,
                  activeHolds.map((h) => h.id)
                )
              )
              .groupBy(holdPallets.holdId);
      const cartonsByHoldId = new Map(cartonAggregates.map((r) => [r.holdId, Number(r.totalCartons ?? 0)]));

      let totalCartons = 0;
      let red = 0;
      let amber = 0;
      let ok = 0;
      for (const hold of activeHolds) {
        totalCartons += cartonsByHoldId.get(hold.id) ?? 0;
        const bucket = holdAgeBucket(holdAgeDays(hold.placedAt, now));
        if (bucket === "RED") red += 1;
        else if (bucket === "AMBER") amber += 1;
        else ok += 1;
      }
      holdTracking = { restricted: false, activeCount: activeHolds.length, totalCartons, red, amber, ok };
    }

    // D-03 Bulk Tracking
    const bulkRows = await db
      .select({ totalCartons: pallets.totalCartons, createdAt: pallets.createdAt })
      .from(pallets)
      .where(eq(pallets.statusCode, "BULK"));
    const bulkTracking = {
      count: bulkRows.length,
      pendingCartons: bulkRows.reduce((sum, r) => sum + r.totalCartons, 0),
      oldestDays: bulkRows.length === 0 ? 0 : Math.max(...bulkRows.map((r) => bulkAgeDays(r.createdAt, now))),
    };

    // D-04 QC Pending Queue - pallets currently QC_HOLD (the real status
    // a pallet holds while "awaiting inspection", per pallet-status.ts's
    // own qc_release/qc_place_hold transitions out of it). No numeric
    // SLA exists anywhere in the source material ("SLA timer starts
    // (configurable - e.g. inspection within X hours)" - Flow 1 Step 3,
    // literally an unfilled placeholder) - elapsed time is shown plainly
    // per the flow document's own "SLA timers - visible, not blocking",
    // not colored against an invented threshold.
    const qcHoldRows = await db
      .select({ createdAt: pallets.createdAt })
      .from(pallets)
      .where(eq(pallets.statusCode, "QC_HOLD"));
    const qcPendingQueue = {
      count: qcHoldRows.length,
      oldestHours:
        qcHoldRows.length === 0
          ? 0
          : Math.max(
              ...qcHoldRows.map((r) => Math.round((now.getTime() - new Date(r.createdAt).getTime()) / 3_600_000))
            ),
    };

    // D-05 Dispatch Status. FIFO suggestions are TASK-013's own separate
    // bounded scope (not yet built) - omitted here rather than guessed.
    const [dispatchedTodayRow] = await db
      .select({ n: count() })
      .from(loadingSheets)
      .where(eq(loadingSheets.status, "DISPATCHED"));
    const pendingLoadingSheets = await db
      .select({ status: loadingSheets.status })
      .from(loadingSheets)
      .where(inArray(loadingSheets.status, ["DRAFT", "STAGING", "LOADED", "VERIFIED", "GATE_PASSED"]));
    const dispatchStatus = {
      dispatchedTotal: dispatchedTodayRow?.n ?? 0,
      pendingCount: pendingLoadingSheets.length,
    };

    // D-06 Transfers - IN_TRANSIT is the one real state between dispatch
    // and receipt (transfer_order_status has no separate "awaiting
    // receipt confirmation but not technically in transit" state), so
    // "In-Transit" and "Pending Receipt" read the same real count here.
    const [inTransitRow] = await db
      .select({ n: count() })
      .from(transferOrders)
      .where(eq(transferOrders.status, "IN_TRANSIT"));
    const transfers = { inTransitCount: inTransitRow?.n ?? 0, pendingReceiptCount: inTransitRow?.n ?? 0 };

    // D-07 Maintenance - open by severity (OPEN/ACKNOWLEDGED/IN_PROGRESS/
    // REOPENED are all "still open" per maintenance_ticket_status).
    const openTickets = await db
      .select({ severity: maintenanceTickets.severity })
      .from(maintenanceTickets)
      .where(inArray(maintenanceTickets.status, ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "REOPENED"]));
    const bySeverity = new Map<string, number>();
    for (const t of openTickets) bySeverity.set(t.severity, (bySeverity.get(t.severity) ?? 0) + 1);
    const maintenance = {
      openCount: openTickets.length,
      criticalCount: bySeverity.get("CRITICAL") ?? 0,
      bySeverity: Array.from(bySeverity.entries()).map(([severity, n]) => ({ severity, count: n })),
    };

    // D-08 Rack Map (mini)
    const locationRows = await db.select({ coldRoom: locations.coldRoom, status: locations.status }).from(locations);
    const rackMapMini = buildRackMiniSummary(locationRows);

    // D-09 Stock Ledger (recent 10) - restricted to stock.view_ledger
    let stockLedgerRecent: { restricted: true } | { restricted: false; rows: unknown[] };
    if (!canViewLedger) {
      stockLedgerRecent = { restricted: true };
    } else {
      const recentRows = await db
        .select({
          id: stockLedger.id,
          date: stockLedger.date,
          transactionType: stockLedger.transactionType,
          materialCode: materials.code,
          batchNumber: batches.batchNumber,
          qtyChange: stockLedger.qtyChange,
          createdAt: stockLedger.createdAt,
        })
        .from(stockLedger)
        .innerJoin(materials, eq(stockLedger.materialId, materials.id))
        .innerJoin(batches, eq(stockLedger.batchId, batches.id))
        .orderBy(desc(stockLedger.createdAt))
        .limit(10);
      stockLedgerRecent = { restricted: false, rows: recentRows };
    }

    // D-10 In-Out Summary (today, by shift) - restricted to stock.view_summary
    let inOutSummary: { restricted: true } | { restricted: false; today: ReturnType<typeof aggregateInOut> };
    if (!canViewSummary) {
      inOutSummary = { restricted: true };
    } else {
      const todaysLedgerRows: InOutLedgerRow[] = await db
        .select({
          date: stockLedger.date,
          shift: stockLedger.shift,
          materialCode: materials.code,
          materialDescription: materials.description,
          transactionType: stockLedger.transactionType,
          qtyChange: stockLedger.qtyChange,
        })
        .from(stockLedger)
        .innerJoin(materials, eq(stockLedger.materialId, materials.id))
        .where(eq(stockLedger.date, today));
      inOutSummary = { restricted: false, today: aggregateInOut(todaysLedgerRows) };
    }

    return NextResponse.json({
      stockSnapshot,
      holdTracking,
      bulkTracking,
      qcPendingQueue,
      dispatchStatus,
      transfers,
      maintenance,
      rackMapMini,
      stockLedgerRecent,
      inOutSummary,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
