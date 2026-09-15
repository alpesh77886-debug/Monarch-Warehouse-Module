import { NextRequest, NextResponse } from "next/server";
import { eq, and, ne, count } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { loadingSheets, loadingSheetPallets, pallets, palletBatches, batches } from "../../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { loadingSheetPickSchema } from "@/lib/validations/loading-sheet";
import {
  assertDispatchEligible,
  assertFifoOrderOrOverride,
  nextLoadingSheetStatus,
  type LoadingSheetStatus,
} from "@/lib/business-rules/loading-sheet";
import {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthNotConfiguredError,
} from "@/lib/errors";

export const runtime = "nodejs";

function errorResponse(err: unknown) {
  if (
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError ||
    err instanceof ValidationError ||
    err instanceof NotFoundError ||
    err instanceof ConflictError ||
    err instanceof AuthNotConfiguredError
  ) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

/**
 * Pick a pallet onto a loading sheet (Flow 5 Step 2 - "Warehouse
 * operator picks from locations... Each pick confirmed"), gated
 * "loading_sheet.load" (R02, the same role the entity's own
 * loaded_by_id attribute names). Enforces INV-001..004 (dispatch
 * eligibility) and INV-010 (FIFO order or a logged override) per pick.
 * The sheet auto-advances DRAFT -> STAGING on its first pick - no
 * separate "stage" button exists, since nothing in the flow document
 * describes staging as a distinct human action rather than a natural
 * consequence of picks starting.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("loading_sheet.load");

    const body = await request.json();
    const parsed = loadingSheetPickSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [sheet] = await db.select().from(loadingSheets).where(eq(loadingSheets.id, params.id));
    if (!sheet) {
      throw new NotFoundError(`Loading sheet "${params.id}" not found.`);
    }
    if (sheet.status !== "DRAFT" && sheet.status !== "STAGING") {
      throw new ValidationError(`Cannot pick pallets onto a loading sheet in status ${sheet.status}.`);
    }

    const [pallet] = await db.select().from(pallets).where(eq(pallets.id, parsed.data.palletId));
    if (!pallet) {
      throw new NotFoundError(`Pallet "${parsed.data.palletId}" not found.`);
    }
    assertDispatchEligible(pallet.statusCode);

    const palletBatchRows = await db.select().from(palletBatches).where(eq(palletBatches.palletId, pallet.id));
    if (palletBatchRows.length !== 1) {
      throw new ValidationError(
        palletBatchRows.length === 0
          ? `Pallet ${pallet.palletNumber} has no known batch - cannot be picked for dispatch.`
          : `Pallet ${pallet.palletNumber} carries more than one batch - pick a single-batch pallet instead.`
      );
    }
    const [batch] = await db.select().from(batches).where(eq(batches.id, palletBatchRows[0].batchId));
    if (!batch) {
      throw new NotFoundError(`Batch "${palletBatchRows[0].batchId}" not found.`);
    }

    // INV-010: compare against every OTHER currently-OK pallet of the
    // same material (real data, not a guess) - if any has an earlier
    // production date, this pick needs a logged override reason.
    const otherOkPallets = await db
      .select({ palletId: pallets.id })
      .from(pallets)
      .where(and(eq(pallets.materialId, pallet.materialId), eq(pallets.statusCode, "OK"), ne(pallets.id, pallet.id)));
    let otherProductionDates: string[] = [];
    if (otherOkPallets.length > 0) {
      const otherPalletIdSet = new Set(otherOkPallets.map((p) => p.palletId));
      const otherPalletBatchRows = await db
        .select({ palletId: palletBatches.palletId, productionDate: batches.productionDate })
        .from(palletBatches)
        .innerJoin(batches, eq(palletBatches.batchId, batches.id));
      otherProductionDates = otherPalletBatchRows
        .filter((r) => otherPalletIdSet.has(r.palletId))
        .map((r) => r.productionDate);
    }
    assertFifoOrderOrOverride(batch.productionDate, otherProductionDates, parsed.data.overrideReason);

    const [{ existingCount }] = await db
      .select({ existingCount: count() })
      .from(loadingSheetPallets)
      .where(eq(loadingSheetPallets.loadingSheetId, params.id));

    const nextStatus: LoadingSheetStatus = sheet.status === "DRAFT" ? nextLoadingSheetStatus("DRAFT", "stage") : (sheet.status as LoadingSheetStatus);

    const rowId = crypto.randomUUID();
    db.transaction((tx) => {
      if (sheet.status === "DRAFT") {
        tx.update(loadingSheets).set({ status: nextStatus }).where(eq(loadingSheets.id, params.id)).run();
      }
      tx.insert(loadingSheetPallets)
        .values({
          id: rowId,
          loadingSheetId: params.id,
          palletId: pallet.id,
          materialId: pallet.materialId,
          batchId: batch.id,
          cartonQty: pallet.totalCartons,
          weightKg: pallet.totalWeightKg,
          loadingSequence: existingCount + 1,
          fifoOverrideReason: parsed.data.overrideReason ?? null,
        })
        .run();
    });

    const [created] = await db.select().from(loadingSheetPallets).where(eq(loadingSheetPallets.id, rowId));
    return NextResponse.json({ pallet: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
