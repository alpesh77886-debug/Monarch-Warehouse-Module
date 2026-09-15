import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { holdRecords, holdPallets, materials, batches, pallets } from "../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { holdAgeDays, holdAgeBucket } from "@/lib/business-rules/hold";
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

// Gated on "holds.view" - see the list route's own comment (this is one
// of the roles-explicitly-named reads, not a PEN-022 public read).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("holds.view");

    const db = getDb();
    const [hold] = await db
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
        placedById: holdRecords.placedById,
        placedByDepartment: holdRecords.placedByDepartment,
        placedAt: holdRecords.placedAt,
        releasedById: holdRecords.releasedById,
        releasedAt: holdRecords.releasedAt,
        releaseRemarks: holdRecords.releaseRemarks,
        status: holdRecords.status,
        qcFollowupCount: holdRecords.qcFollowupCount,
        lastFollowupAt: holdRecords.lastFollowupAt,
        createdAt: holdRecords.createdAt,
      })
      .from(holdRecords)
      .innerJoin(materials, eq(holdRecords.materialId, materials.id))
      .innerJoin(batches, eq(holdRecords.batchId, batches.id))
      .where(eq(holdRecords.id, params.id));
    if (!hold) {
      throw new NotFoundError(`Hold "${params.id}" not found.`);
    }

    const heldPallets = await db
      .select({
        id: pallets.id,
        palletNumber: pallets.palletNumber,
        statusCode: pallets.statusCode,
        totalCartons: pallets.totalCartons,
        totalWeightKg: pallets.totalWeightKg,
        currentLocationId: pallets.currentLocationId,
      })
      .from(holdPallets)
      .innerJoin(pallets, eq(holdPallets.palletId, pallets.id))
      .where(eq(holdPallets.holdId, params.id));

    const ageDays = holdAgeDays(hold.placedAt);
    return NextResponse.json({
      hold: { ...hold, ageDays, ageBucket: hold.status === "ACTIVE" ? holdAgeBucket(ageDays) : null },
      pallets: heldPallets,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
