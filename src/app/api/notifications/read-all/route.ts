import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notifications } from "../../../../../drizzle/schema";
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

/** Loop 50 / PEN-038: marks every one of the CALLER's OWN unread notifications read. */
export async function POST() {
  try {
    const userId = await requireCurrentUserId();

    const db = getDb();
    await db
      .update(notifications)
      .set({ readAt: new Date().toISOString() })
      .where(and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
