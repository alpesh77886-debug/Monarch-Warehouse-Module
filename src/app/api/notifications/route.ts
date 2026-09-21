import { NextResponse } from "next/server";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notifications } from "../../../../drizzle/schema";
import { requireCurrentUserId } from "@/lib/auth";
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
 * Loop 50 / PEN-038: the real in-app notification list for the caller's
 * OWN inbox - not a public/ungated read like the PEN-022 precedent
 * (Material Master, Location, etc.), because this data is inherently
 * per-recipient, not reference data. requireCurrentUserId() therefore
 * gates this the same hard way every other authenticated read/write in
 * this app does - a 503 in Clerk stub mode is the correct, honest
 * refusal, not a gap: there is no real session to know WHOSE inbox to
 * serve. Returns the 50 most recent, newest first, plus the real
 * unread count (for the bell's own badge).
 */
export async function GET() {
  try {
    const userId = await requireCurrentUserId();

    const db = getDb();
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientUserId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    // Counted separately (not derived from the 50-row page above), so
    // the bell's own badge is correct even past 50 unread.
    const [unread] = await db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt)));

    return NextResponse.json({ notifications: rows, unreadCount: unread.n });
  } catch (err) {
    return errorResponse(err);
  }
}
