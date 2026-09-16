import { NextRequest, NextResponse } from "next/server";
import { eq, and, count } from "drizzle-orm";
import { getDb, changesOf } from "@/lib/db";
import { loadingSheets, loadingSheetPallets } from "../../../../../../drizzle/schema";
import { requirePermission, requireCurrentUserId } from "@/lib/auth";
import { assertReadyToLoad, nextLoadingSheetStatus, type LoadingSheetStatus } from "@/lib/business-rules/loading-sheet";
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
 * STAGING -> LOADED (Flow 5 Step 3's "Loaded By"), gated
 * "loading_sheet.load" (R02, matching the entity's own loaded_by_id).
 * INV-018/019 enforced via assertReadyToLoad before this can succeed.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("loading_sheet.load");
    const currentUserId = await requireCurrentUserId();

    const db = getDb();
    const [sheet] = await db.select().from(loadingSheets).where(eq(loadingSheets.id, params.id));
    if (!sheet) {
      throw new NotFoundError(`Loading sheet "${params.id}" not found.`);
    }
    const nextStatus: LoadingSheetStatus = nextLoadingSheetStatus(sheet.status as LoadingSheetStatus, "load");

    const [{ pickedCount }] = await db
      .select({ pickedCount: count() })
      .from(loadingSheetPallets)
      .where(eq(loadingSheetPallets.loadingSheetId, params.id));
    if (pickedCount === 0) {
      throw new ValidationError("Pick at least one pallet before loading.");
    }

    assertReadyToLoad(sheet);

    // A single guarded UPDATE is already atomic as one statement - no
    // wrapping transaction needed (D1 has no multi-statement
    // BEGIN/COMMIT, see PEN-044 / src/lib/db.ts).
    const result = await db
      .update(loadingSheets)
      .set({ status: nextStatus, loadedById: currentUserId })
      .where(and(eq(loadingSheets.id, params.id), eq(loadingSheets.status, sheet.status)))
      .run();
    const applied = changesOf(result);
    if (applied === 0) {
      throw new ConflictError("This loading sheet was changed by someone else - your load action was not applied.");
    }

    const [updated] = await db.select().from(loadingSheets).where(eq(loadingSheets.id, params.id));
    return NextResponse.json({ loadingSheet: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
