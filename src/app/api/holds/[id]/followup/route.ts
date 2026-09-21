import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { holdRecords } from "../../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
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
 * Follow-up nudge (SCREEN-004's "Send reminder to QC LAB about N aged
 * holds" panel, holds.followup_nudge - R03). This project has no real
 * notification channel anywhere (no email/SMS/push integration exists
 * in this repository at all - not a gap specific to holds), so "sends
 * system notification to QC queue" is implemented as what is honestly
 * buildable: a real, permanent, queryable record of the nudge itself
 * (hold_records.qc_followup_count / last_followup_at, both already part
 * of the entity's own contracted attribute list) - visible to QC via
 * this same dashboard's aging column, not a fabricated "notification
 * sent" confirmation. See PEN-036 in docs/PENDING_ITEMS.md.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("holds.followup_nudge");

    const db = getDb();
    const [hold] = await db.select().from(holdRecords).where(eq(holdRecords.id, params.id));
    if (!hold) {
      throw new NotFoundError(`Hold "${params.id}" not found.`);
    }
    // Loop 50 / PEN-037: a PARTIALLY_RELEASED hold still has real ACTIVE
    // pallets waiting on QC, same reasoning as the release/reject routes.
    if (hold.status !== "ACTIVE" && hold.status !== "PARTIALLY_RELEASED") {
      throw new ValidationError(`Only a hold with pallets still ACTIVE can get a follow-up nudge - this hold is ${hold.status}.`);
    }

    const now = new Date().toISOString();
    await db
      .update(holdRecords)
      .set({ qcFollowupCount: hold.qcFollowupCount + 1, lastFollowupAt: now })
      .where(eq(holdRecords.id, params.id));

    const [updated] = await db.select().from(holdRecords).where(eq(holdRecords.id, params.id));
    return NextResponse.json({ hold: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
