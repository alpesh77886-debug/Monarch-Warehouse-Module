import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb, changesOf } from "@/lib/db";
import { loadingSheets } from "../../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { loadingSheetGatePassSchema } from "@/lib/validations/loading-sheet";
import { nextLoadingSheetStatus, type LoadingSheetStatus } from "@/lib/business-rules/loading-sheet";
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
 * VERIFIED -> GATE_PASSED (Flow 5 Step 5 - security records vehicle
 * exit), gated "gate_pass.record_exit" (R10 - security, matching the
 * IN SCOPE bullet's own "gate-pass (R10)"). NS-009's own "Gate pass
 * requires linked loading sheet" is enforced by nextLoadingSheetStatus
 * itself - see that function's own comment.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("gate_pass.record_exit");

    const body = await request.json();
    const parsed = loadingSheetGatePassSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [sheet] = await db.select().from(loadingSheets).where(eq(loadingSheets.id, params.id));
    if (!sheet) {
      throw new NotFoundError(`Loading sheet "${params.id}" not found.`);
    }
    const nextStatus: LoadingSheetStatus = nextLoadingSheetStatus(sheet.status as LoadingSheetStatus, "gate_pass");

    // A single guarded UPDATE is already atomic as one statement - no
    // wrapping transaction needed (D1 has no multi-statement
    // BEGIN/COMMIT, see PEN-044 / src/lib/db.ts).
    const result = await db
      .update(loadingSheets)
      .set({ status: nextStatus, gatePassNumber: parsed.data.gatePassNumber, gatePassTime: new Date().toISOString() })
      .where(and(eq(loadingSheets.id, params.id), eq(loadingSheets.status, sheet.status)))
      .run();
    const applied = changesOf(result);
    if (applied === 0) {
      throw new ConflictError("This loading sheet was changed by someone else - your gate-pass action was not applied.");
    }

    const [updated] = await db.select().from(loadingSheets).where(eq(loadingSheets.id, params.id));
    return NextResponse.json({ loadingSheet: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
