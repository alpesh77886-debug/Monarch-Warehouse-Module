import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { receivingSheets, receivingSheetPallets } from "../../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { receivingSheetPalletCreateSchema } from "@/lib/validations/receiving-sheet";
import { assertCanAddPalletRow, validateCartonCondition } from "@/lib/business-rules/receiving-sheet";
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

/** Flow 1 Step 2 ("Add Pallet Row") - DRAFT-only, NS-019 max 35, GS-008 dispute-prevention fields. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("receiving_sheet.create");

    const body = await request.json();
    const parsed = receivingSheetPalletCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }
    validateCartonCondition(parsed.data.cartonCondition, parsed.data.remarks);

    const db = getDb();
    const [sheet] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, params.id));
    if (!sheet) {
      throw new NotFoundError(`Receiving sheet "${params.id}" not found.`);
    }
    if (sheet.status !== "DRAFT") {
      throw new ValidationError(`Only a DRAFT sheet accepts new pallet rows - this sheet is ${sheet.status}.`);
    }

    const existingRows = await db
      .select()
      .from(receivingSheetPallets)
      .where(eq(receivingSheetPallets.receivingSheetId, params.id));
    assertCanAddPalletRow(existingRows.length);

    const id = crypto.randomUUID();
    const srNo = existingRows.length + 1;
    await db.insert(receivingSheetPallets).values({
      id,
      receivingSheetId: params.id,
      srNo,
      palletNumber: parsed.data.palletNumber,
      qty: parsed.data.qty,
      receivingTime: parsed.data.receivingTime,
      cartonCondition: parsed.data.cartonCondition,
      temperatureC: parsed.data.temperatureC ?? null,
      remarks: parsed.data.remarks ?? null,
    });

    // Auto-calculate total_qty/total_boxes (Flow 1 Step 2's own "running
    // total" note) on every row add, not only at lock - the DRAFT header
    // should already show a live total while entry is in progress.
    const newTotalQty = existingRows.reduce((sum, r) => sum + r.qty, 0) + parsed.data.qty;
    await db
      .update(receivingSheets)
      .set({ totalQty: newTotalQty, totalBoxes: srNo })
      .where(eq(receivingSheets.id, params.id));

    const [created] = await db.select().from(receivingSheetPallets).where(eq(receivingSheetPallets.id, id));
    return NextResponse.json({ pallet: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
