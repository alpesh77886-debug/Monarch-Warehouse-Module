import { NextRequest, NextResponse } from "next/server";
import { eq, desc, count, sum } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { holdRecords, holdPallets, materials, batches, pallets, stockLedger } from "../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { holdCreateSchema } from "@/lib/validations/hold";
import { validateHoldReason, holdAgeDays, holdAgeBucket, holdNumberPrefix } from "@/lib/business-rules/hold";
import { validatePalletStatusTransition, describeLedgerEntry, type PalletStatus } from "@/lib/workflows/pallet-status";
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
 * Hold Record list (SCREEN-004, TASK-006). Gated on "holds.view" - unlike
 * Receiving Sheet/Material/Warehouse/Location reads (PEN-022), the
 * locked permission matrix explicitly names which roles get a "view"
 * grant for holds (R03/R04/R05/R08 only, not every role), the same real
 * rule that already made GET /api/stock/ledger gated too - so there is
 * no PEN-022-style usability argument for leaving this one open.
 */
export async function GET() {
  try {
    await requirePermission("holds.view");

    const db = getDb();
    const rows = await db
      .select({
        id: holdRecords.id,
        holdNumber: holdRecords.holdNumber,
        materialId: holdRecords.materialId,
        materialCode: materials.code,
        materialDescription: materials.description,
        batchId: holdRecords.batchId,
        batchNumber: batches.batchNumber,
        holdReason: holdRecords.holdReason,
        customReason: holdRecords.customReason,
        placedByDepartment: holdRecords.placedByDepartment,
        placedAt: holdRecords.placedAt,
        status: holdRecords.status,
        qcFollowupCount: holdRecords.qcFollowupCount,
        lastFollowupAt: holdRecords.lastFollowupAt,
        createdAt: holdRecords.createdAt,
      })
      .from(holdRecords)
      .innerJoin(materials, eq(holdRecords.materialId, materials.id))
      .innerJoin(batches, eq(holdRecords.batchId, batches.id))
      .orderBy(desc(holdRecords.createdAt));

    const palletAggregates = await db
      .select({
        holdId: holdPallets.holdId,
        palletCount: count(),
        totalCartons: sum(pallets.totalCartons),
        totalWeightKg: sum(pallets.totalWeightKg),
      })
      .from(holdPallets)
      .innerJoin(pallets, eq(holdPallets.palletId, pallets.id))
      .groupBy(holdPallets.holdId);
    const aggregateByHoldId = new Map(palletAggregates.map((r) => [r.holdId, r]));

    const palletNumberRows = await db
      .select({ holdId: holdPallets.holdId, palletNumber: pallets.palletNumber })
      .from(holdPallets)
      .innerJoin(pallets, eq(holdPallets.palletId, pallets.id));
    const palletNumbersByHoldId = new Map<string, string[]>();
    for (const r of palletNumberRows) {
      const list = palletNumbersByHoldId.get(r.holdId) ?? [];
      list.push(r.palletNumber);
      palletNumbersByHoldId.set(r.holdId, list);
    }

    const now = new Date();
    const holds = rows.map((r) => {
      const ageDays = holdAgeDays(r.placedAt, now);
      const aggregate = aggregateByHoldId.get(r.id);
      return {
        ...r,
        palletCount: aggregate?.palletCount ?? 0,
        totalCartons: Number(aggregate?.totalCartons ?? 0),
        totalWeightKg: Number(aggregate?.totalWeightKg ?? 0),
        palletNumbers: palletNumbersByHoldId.get(r.id) ?? [],
        ageDays,
        ageBucket: r.status === "ACTIVE" ? holdAgeBucket(ageDays) : null,
      };
    });

    return NextResponse.json({ holds });
  } catch (err) {
    return errorResponse(err);
  }
}

async function nextHoldNumber(db: ReturnType<typeof getDb>, date: string): Promise<string> {
  const prefix = holdNumberPrefix(date);
  const existing = await db.select({ holdNumber: holdRecords.holdNumber }).from(holdRecords);
  const todayCount = existing.filter((r) => r.holdNumber.startsWith(prefix)).length;
  const seq = String(todayCount + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

/**
 * Place a hold (Flow 3's "QC places hold" step, workflows.yaml's
 * qc_place_hold action: QC_HOLD -> HOLD). One hold record can cover
 * multiple pallets (the entity's own pallet_ids array, translated to the
 * hold_pallets junction table - see drizzle/schema.ts). Every pallet
 * listed must currently be QC_HOLD - the workflow contract defines no
 * OK -> HOLD transition, so an already-released pallet cannot be placed
 * on hold through this route (that would need a different, uncontracted
 * workflow this loop was not asked to invent).
 */
export async function POST(request: NextRequest) {
  try {
    const role = await requirePermission("holds.create");
    const currentUserId = await requireCurrentUserId();

    const body = await request.json();
    const parsed = holdCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }
    validateHoldReason(parsed.data.holdReason, parsed.data.customReason);

    const db = getDb();
    const [material] = await db.select().from(materials).where(eq(materials.id, parsed.data.materialId));
    if (!material) {
      throw new NotFoundError(`Material "${parsed.data.materialId}" not found.`);
    }
    const [batch] = await db.select().from(batches).where(eq(batches.id, parsed.data.batchId));
    if (!batch) {
      throw new NotFoundError(`Batch "${parsed.data.batchId}" not found.`);
    }
    if (batch.materialId !== material.id) {
      throw new ValidationError(`Batch "${batch.batchNumber}" does not belong to material "${material.code}".`);
    }

    const uniquePalletIds = Array.from(new Set(parsed.data.palletIds));
    const holdPalletRows: {
      pallet: typeof pallets.$inferSelect;
      transition: ReturnType<typeof validatePalletStatusTransition>;
    }[] = [];
    for (const palletId of uniquePalletIds) {
      const [pallet] = await db.select().from(pallets).where(eq(pallets.id, palletId));
      if (!pallet) {
        throw new NotFoundError(`Pallet "${palletId}" not found.`);
      }
      if (pallet.materialId !== material.id) {
        throw new ValidationError(`Pallet ${pallet.palletNumber} is not material "${material.code}".`);
      }
      const transition = validatePalletStatusTransition(pallet.statusCode as PalletStatus, "HOLD", role);
      holdPalletRows.push({ pallet, transition });
    }

    const now = new Date().toISOString();
    const holdId = crypto.randomUUID();
    const holdNumber = await nextHoldNumber(db, now.slice(0, 10));

    db.transaction((tx) => {
      tx.insert(holdRecords)
        .values({
          id: holdId,
          holdNumber,
          materialId: material.id,
          batchId: batch.id,
          holdReason: parsed.data.holdReason,
          customReason: parsed.data.customReason ?? null,
          placedById: currentUserId,
          placedByDepartment: parsed.data.placedByDepartment,
          placedAt: now,
          status: "ACTIVE",
        })
        .run();

      for (const { pallet, transition } of holdPalletRows) {
        tx.insert(holdPallets)
          .values({ id: crypto.randomUUID(), holdId, palletId: pallet.id })
          .run();
        tx.update(pallets).set({ statusCode: "HOLD" }).where(eq(pallets.id, pallet.id)).run();

        // No quantity change on a status-only transition - see the
        // putaway/move routes' own stock_ledger writes for the same
        // qty/weight-unchanged reasoning.
        const ledgerEntry = describeLedgerEntry(transition);
        tx.insert(stockLedger)
          .values({
            id: crypto.randomUUID(),
            date: now.slice(0, 10),
            shift: "NA",
            transactionType: ledgerEntry.transactionType,
            materialId: material.id,
            batchId: batch.id,
            palletId: pallet.id,
            locationId: pallet.currentLocationId,
            warehouseId: pallet.currentWarehouseId,
            qtyChange: 0,
            qtyAfter: pallet.totalCartons,
            weightChangeKg: 0,
            weightAfterKg: pallet.totalWeightKg,
            statusBefore: ledgerEntry.statusBefore,
            statusAfter: ledgerEntry.statusAfter,
            referenceType: ledgerEntry.referenceType,
            referenceId: holdId,
            userId: currentUserId,
          })
          .run();
      }
    });

    const [created] = await db.select().from(holdRecords).where(eq(holdRecords.id, holdId));
    return NextResponse.json({ hold: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
