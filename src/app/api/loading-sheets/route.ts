import { NextRequest, NextResponse } from "next/server";
import { eq, desc, count, sum } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { loadingSheets, loadingSheetPallets } from "../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { loadingSheetCreateSchema } from "@/lib/validations/loading-sheet";
import { loadingSheetNumberPrefix } from "@/lib/business-rules/loading-sheet";
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
 * Loading Sheet list (SCREEN-005, TASK-008). Not gated - same PEN-022
 * reasoning already applied to Receiving Sheet: the real permission
 * matrix gives R01/R03/R09 create/verify grants but no explicit "view"
 * grant, and R04/R10 get "loading_sheet.view" - no role that touches
 * this document at any step lacks a real reason to read it, so gating
 * the plain read would make the screen unusable to its own creators
 * during Clerk stub mode, the same usability problem PEN-021/022 already
 * found elsewhere. Create/pick/load/verify/gate-pass/dispatch all stay
 * fully gated below and in their own route files.
 */
export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select().from(loadingSheets).orderBy(desc(loadingSheets.createdAt));

    const aggregates = await db
      .select({
        loadingSheetId: loadingSheetPallets.loadingSheetId,
        palletCount: count(),
        totalCartons: sum(loadingSheetPallets.cartonQty),
        totalWeightKg: sum(loadingSheetPallets.weightKg),
      })
      .from(loadingSheetPallets)
      .groupBy(loadingSheetPallets.loadingSheetId);
    const aggregateById = new Map(aggregates.map((a) => [a.loadingSheetId, a]));

    return NextResponse.json({
      loadingSheets: rows.map((r) => {
        const a = aggregateById.get(r.id);
        return {
          ...r,
          palletCount: a?.palletCount ?? 0,
          totalCartons: Number(a?.totalCartons ?? 0),
          totalWeightKg: Number(a?.totalWeightKg ?? 0),
        };
      }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

async function nextLoadingSheetNumber(db: ReturnType<typeof getDb>, date: string): Promise<string> {
  const prefix = loadingSheetNumberPrefix(date);
  const existing = await db.select({ loadingSheetNumber: loadingSheets.loadingSheetNumber }).from(loadingSheets);
  const todayCount = existing.filter((r) => r.loadingSheetNumber.startsWith(prefix)).length;
  const seq = String(todayCount + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

/**
 * Create a DRAFT loading sheet (Flow 5 Steps 1-3's header fields - the
 * "dispatch order" input and the loading sheet's own header are folded
 * into one DRAFT row, since the domain entities contract has no separate
 * dispatch_order entity to create one against - see PEN-039 in
 * docs/PENDING_ITEMS.md for the disclosed reasoning). Pallets are picked
 * onto it afterward via the pallets sub-route.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("loading_sheet.create");

    const body = await request.json();
    const parsed = loadingSheetCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const id = crypto.randomUUID();
    const loadingSheetNumber = await nextLoadingSheetNumber(db, parsed.data.date);
    await db.insert(loadingSheets).values({
      id,
      loadingSheetNumber,
      date: parsed.data.date,
      vehicleNumber: parsed.data.vehicleNumber,
      driverName: parsed.data.driverName,
      transporter: parsed.data.transporter ?? null,
      partyName: parsed.data.partyName,
      destination: parsed.data.destination,
      exportDomestic: parsed.data.exportDomestic,
      temperatureC: parsed.data.temperatureC,
      status: "DRAFT",
    });

    const [created] = await db.select().from(loadingSheets).where(eq(loadingSheets.id, id));
    return NextResponse.json({ loadingSheet: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
