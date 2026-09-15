import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { loadingSheets } from "../../../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { loadingSheetQcApproveSchema } from "@/lib/validations/loading-sheet";
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
 * QC container approval for an EXPORT loading sheet (Flow 5 Step 4,
 * INV-018/NS-013), gated "export_container.approve" (R04). Records the
 * fields, doesn't itself move the sheet's status - the "load" action
 * checks these are all present via assertReadyToLoad before allowing
 * STAGING -> LOADED for an EXPORT sheet.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("export_container.approve");
    const currentUserId = await requireCurrentUserId();

    const body = await request.json();
    const parsed = loadingSheetQcApproveSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [sheet] = await db.select().from(loadingSheets).where(eq(loadingSheets.id, params.id));
    if (!sheet) {
      throw new NotFoundError(`Loading sheet "${params.id}" not found.`);
    }
    if (sheet.exportDomestic !== "EXPORT") {
      throw new ValidationError("QC container approval only applies to EXPORT loading sheets.");
    }
    if (sheet.status === "DISPATCHED") {
      throw new ValidationError("Dispatched loading sheets are immutable.");
    }

    await db
      .update(loadingSheets)
      .set({
        qcApprovalById: currentUserId,
        qcApprovalAt: new Date().toISOString(),
        containerNumber: parsed.data.containerNumber,
        sealNumber: parsed.data.sealNumber,
        boltNumber: parsed.data.boltNumber,
      })
      .where(eq(loadingSheets.id, params.id));

    const [updated] = await db.select().from(loadingSheets).where(eq(loadingSheets.id, params.id));
    return NextResponse.json({ loadingSheet: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
