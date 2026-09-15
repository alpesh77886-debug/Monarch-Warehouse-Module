import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { holdRecords, holdPallets, pallets, stockLedger } from "../../../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { holdRejectSchema } from "@/lib/validations/hold";
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
 * Reject a hold (workflows.yaml's qc_reject action: HOLD -> REJECTED,
 * R04 only). No contract-mandated exact error wording exists for this
 * one (unlike release/NS-003), so requirePermission's own message is
 * used as-is.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = await requirePermission("holds.reject");
    const currentUserId = await requireCurrentUserId();

    const body = await request.json();
    const parsed = holdRejectSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [hold] = await db.select().from(holdRecords).where(eq(holdRecords.id, params.id));
    if (!hold) {
      throw new NotFoundError(`Hold "${params.id}" not found.`);
    }
    if (hold.status !== "ACTIVE") {
      throw new ValidationError(`Only an ACTIVE hold can be rejected - this hold is ${hold.status}.`);
    }

    const heldPallets = await db
      .select({ pallet: pallets })
      .from(holdPallets)
      .innerJoin(pallets, eq(holdPallets.palletId, pallets.id))
      .where(eq(holdPallets.holdId, params.id));

    const transitions = heldPallets.map(({ pallet }) => ({
      pallet,
      transition: validatePalletStatusTransition(pallet.statusCode as PalletStatus, "REJECTED", role),
    }));

    const now = new Date().toISOString();
    db.transaction((tx) => {
      tx.update(holdRecords)
        .set({
          status: "REJECTED",
          releasedById: currentUserId,
          releasedAt: now,
          releaseRemarks: parsed.data.releaseRemarks,
        })
        .where(eq(holdRecords.id, params.id))
        .run();

      for (const { pallet, transition } of transitions) {
        tx.update(pallets).set({ statusCode: "REJECTED" }).where(eq(pallets.id, pallet.id)).run();

        const ledgerEntry = describeLedgerEntry(transition);
        tx.insert(stockLedger)
          .values({
            id: crypto.randomUUID(),
            date: now.slice(0, 10),
            shift: "NA",
            transactionType: ledgerEntry.transactionType,
            materialId: hold.materialId,
            batchId: hold.batchId,
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
            referenceId: hold.id,
            userId: currentUserId,
            remarks: parsed.data.releaseRemarks,
          })
          .run();
      }
    });

    const [updated] = await db.select().from(holdRecords).where(eq(holdRecords.id, params.id));
    return NextResponse.json({ hold: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
