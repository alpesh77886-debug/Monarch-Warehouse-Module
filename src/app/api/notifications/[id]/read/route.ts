import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notifications } from "../../../../../../drizzle/schema";
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
 * Loop 50 / PEN-038: marks one of the CALLER's OWN notifications read -
 * scoped by recipient_user_id in the WHERE clause itself (not just a
 * lookup-then-trust-the-id), so this can never mark someone else's
 * notification read even given an arbitrary real id.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireCurrentUserId();

    const db = getDb();
    const [existing] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, params.id), eq(notifications.recipientUserId, userId)));
    if (!existing) {
      throw new NotFoundError(`Notification "${params.id}" not found.`);
    }

    if (!existing.readAt) {
      await db
        .update(notifications)
        .set({ readAt: new Date().toISOString() })
        .where(eq(notifications.id, params.id));
    }

    const [updated] = await db.select().from(notifications).where(eq(notifications.id, params.id));
    return NextResponse.json({ notification: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
