import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { loadingSheets, loadingSheetPallets, pallets, materials, batches } from "../../../../../drizzle/schema";
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

// Not gated - see the list route's own comment (PEN-022 precedent).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb();
    const [sheet] = await db.select().from(loadingSheets).where(eq(loadingSheets.id, params.id));
    if (!sheet) {
      throw new NotFoundError(`Loading sheet "${params.id}" not found.`);
    }

    const pickedPallets = await db
      .select({
        id: loadingSheetPallets.id,
        palletId: loadingSheetPallets.palletId,
        palletNumber: pallets.palletNumber,
        materialCode: materials.code,
        materialDescription: materials.description,
        batchNumber: batches.batchNumber,
        cartonQty: loadingSheetPallets.cartonQty,
        weightKg: loadingSheetPallets.weightKg,
        loadingSequence: loadingSheetPallets.loadingSequence,
        fifoOverrideReason: loadingSheetPallets.fifoOverrideReason,
      })
      .from(loadingSheetPallets)
      .innerJoin(pallets, eq(loadingSheetPallets.palletId, pallets.id))
      .innerJoin(materials, eq(loadingSheetPallets.materialId, materials.id))
      .innerJoin(batches, eq(loadingSheetPallets.batchId, batches.id))
      .where(eq(loadingSheetPallets.loadingSheetId, params.id))
      .orderBy(loadingSheetPallets.loadingSequence);

    return NextResponse.json({ loadingSheet: sheet, pallets: pickedPallets });
  } catch (err) {
    return errorResponse(err);
  }
}
