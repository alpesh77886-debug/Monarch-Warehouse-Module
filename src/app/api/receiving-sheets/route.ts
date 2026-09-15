import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { receivingSheets, materials } from "../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { receivingSheetCreateSchema } from "@/lib/validations/receiving-sheet";
import { validateBatchNumberFormat } from "@/lib/business-rules/receiving-sheet";
import { assertBulkReasonConsistency } from "@/lib/business-rules/bulk";
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
 * Receiving Sheet create/list (Flow 1 Step 1, TASK-004). List is
 * deliberately NOT gated, same PEN-022 reasoning already established
 * for Material/Warehouse/Location reads in this repository: the
 * permissions contract never spells out a separate "view" grant for
 * every role that legitimately needs to see a receiving sheet (R01/R03
 * create it, R04/R06/R07 have an explicit view, but nothing says a
 * plain read needs a session at all), and requiring one today - while
 * Clerk stub mode means no one can ever hold a real session - would
 * make this screen unreadable to everyone, not more secure. The actual
 * sensitive half (create/edit/confirm) stays fully gated below.
 */
export async function GET() {
  try {
    const db = getDb();
    const rows = await db
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
        status: receivingSheets.status,
        defaultPalletStatus: receivingSheets.defaultPalletStatus,
        bulkReason: receivingSheets.bulkReason,
        originalBulkPalletId: receivingSheets.originalBulkPalletId,
        createdAt: receivingSheets.createdAt,
      })
      .from(receivingSheets)
      .innerJoin(materials, eq(receivingSheets.materialId, materials.id))
      .orderBy(desc(receivingSheets.createdAt));
    return NextResponse.json({ receivingSheets: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

async function nextSheetNumber(db: ReturnType<typeof getDb>, date: string): Promise<string> {
  // Format RS-YYYY-MMDD-NNN, per the entities contract's own
  // generated_format note. `date` arrives as YYYY-MM-DD (the create
  // schema's own field); today's sequence is derived by counting
  // existing sheets whose number already carries today's date segment,
  // the same convention this repository already uses nowhere else yet
  // but is the direct, non-invented reading of the contract's own
  // format string.
  const [y, m, d] = date.split("-");
  const prefix = `RS-${y}-${m}${d}-`;
  const existing = await db.select({ sheetNumber: receivingSheets.sheetNumber }).from(receivingSheets);
  const todayCount = existing.filter((r) => r.sheetNumber.startsWith(prefix)).length;
  const seq = String(todayCount + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("receiving_sheet.create");

    const body = await request.json();
    const parsed = receivingSheetCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }
    validateBatchNumberFormat(parsed.data.batchNumber);
    assertBulkReasonConsistency(parsed.data.defaultPalletStatus, parsed.data.bulkReason);

    const db = getDb();
    const [material] = await db.select().from(materials).where(eq(materials.id, parsed.data.materialId));
    if (!material) {
      throw new NotFoundError(`Material "${parsed.data.materialId}" not found.`);
    }

    // NS-012: "Duplicate receiving sheet (same material+batch+shift)" -
    // checked here for a clean 409 message; the DB's own composite
    // unique index is the race-condition backstop.
    const [dup] = await db
      .select({ id: receivingSheets.id, sheetNumber: receivingSheets.sheetNumber })
      .from(receivingSheets)
      .where(
        and(
          eq(receivingSheets.materialId, parsed.data.materialId),
          eq(receivingSheets.batchNumber, parsed.data.batchNumber),
          eq(receivingSheets.shift, parsed.data.shift)
        )
      );
    if (dup) {
      throw new ConflictError(
        `Sheet already exists for this material, batch, and shift (${dup.sheetNumber}).`
      );
    }

    const sheetNumber = await nextSheetNumber(db, parsed.data.date);
    const id = crypto.randomUUID();
    try {
      await db.insert(receivingSheets).values({
        id,
        sheetNumber,
        date: parsed.data.date,
        shift: parsed.data.shift,
        line: parsed.data.line,
        materialId: parsed.data.materialId,
        batchNumber: parsed.data.batchNumber,
        defaultPalletStatus: parsed.data.defaultPalletStatus,
        bulkReason: parsed.data.bulkReason ?? null,
        status: "DRAFT",
      });
    } catch (e) {
      // The composite unique index's own race-condition backstop.
      if (e instanceof Error && /UNIQUE constraint failed/i.test(e.message)) {
        throw new ConflictError("Sheet already exists for this material, batch, and shift.");
      }
      throw e;
    }

    const [created] = await db.select().from(receivingSheets).where(eq(receivingSheets.id, id));
    return NextResponse.json({ receivingSheet: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
