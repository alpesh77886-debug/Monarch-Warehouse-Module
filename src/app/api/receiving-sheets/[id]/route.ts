import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { receivingSheets, receivingSheetPallets, materials } from "../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { receivingSheetUpdateSchema } from "@/lib/validations/receiving-sheet";
import { validateBatchNumberFormat } from "@/lib/business-rules/receiving-sheet";
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
    const [sheet] = await db
      .select({
        id: receivingSheets.id,
        sheetNumber: receivingSheets.sheetNumber,
        date: receivingSheets.date,
        shift: receivingSheets.shift,
        line: receivingSheets.line,
        materialId: receivingSheets.materialId,
        materialCode: materials.code,
        materialDescription: materials.description,
        batchNumber: receivingSheets.batchNumber,
        totalQty: receivingSheets.totalQty,
        totalBoxes: receivingSheets.totalBoxes,
        packingSupervisorId: receivingSheets.packingSupervisorId,
        packingOperatorId: receivingSheets.packingOperatorId,
        warehouseExecutiveId: receivingSheets.warehouseExecutiveId,
        warehouseOperatorId: receivingSheets.warehouseOperatorId,
        packingConfirmedAt: receivingSheets.packingConfirmedAt,
        warehouseConfirmedAt: receivingSheets.warehouseConfirmedAt,
        status: receivingSheets.status,
        defaultPalletStatus: receivingSheets.defaultPalletStatus,
        createdAt: receivingSheets.createdAt,
      })
      .from(receivingSheets)
      .innerJoin(materials, eq(receivingSheets.materialId, materials.id))
      .where(eq(receivingSheets.id, params.id));
    if (!sheet) {
      throw new NotFoundError(`Receiving sheet "${params.id}" not found.`);
    }
    const pallets = await db
      .select()
      .from(receivingSheetPallets)
      .where(eq(receivingSheetPallets.receivingSheetId, params.id))
      .orderBy(receivingSheetPallets.srNo);
    return NextResponse.json({ receivingSheet: sheet, pallets });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * DRAFT-only edit (TASK-004's own "update (DRAFT only)" scope). Once a
 * sheet has left DRAFT (either pending state, or LOCKED), header fields
 * are no longer editable - the flow document treats the moment either
 * side confirms as the start of the legal-document lifecycle, not just
 * the LOCKED moment itself.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("receiving_sheet.create");

    const body = await request.json();
    const parsed = receivingSheetUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }
    if (Object.keys(parsed.data).length === 0) {
      throw new ValidationError("Provide at least one field to update.");
    }
    if (parsed.data.batchNumber) {
      validateBatchNumberFormat(parsed.data.batchNumber);
    }

    const db = getDb();
    const [existing] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, params.id));
    if (!existing) {
      throw new NotFoundError(`Receiving sheet "${params.id}" not found.`);
    }
    if (existing.status === "LOCKED") {
      // NS-006: "Attempt to unlock LOCKED receiving sheet" -> 403, exact
      // wording, distinct from the plain state-validation case below
      // (also backstopped by the receiving_sheets_locked_immutable DB
      // trigger, INV-008 - this check exists for a clean 403, not
      // because the trigger alone would leave a gap).
      throw new ForbiddenError("Locked sheets are immutable.");
    }
    if (existing.status !== "DRAFT") {
      throw new ValidationError(
        `Only a DRAFT sheet can be edited - this sheet is ${existing.status}.`
      );
    }

    if (parsed.data.materialId) {
      const [material] = await db.select().from(materials).where(eq(materials.id, parsed.data.materialId));
      if (!material) {
        throw new NotFoundError(`Material "${parsed.data.materialId}" not found.`);
      }
    }

    await db.update(receivingSheets).set(parsed.data).where(eq(receivingSheets.id, params.id));
    const [updated] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, params.id));
    return NextResponse.json({ receivingSheet: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
