import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { materials } from "../../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { materialUpdateSchema } from "@/lib/validations/material";
import {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  NotFoundError,
  AuthNotConfiguredError,
} from "@/lib/errors";

export const runtime = "nodejs";

function errorResponse(err: unknown) {
  if (
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError ||
    err instanceof ValidationError ||
    err instanceof NotFoundError ||
    err instanceof AuthNotConfiguredError
  ) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

/**
 * Deactivate/reactivate only - there is deliberately no DELETE route.
 * The entities contract's own invariant says a material cannot be
 * deleted while it has active stock, only deactivated; this repo has
 * no reliable per-material stock check yet (that needs the pallet/stock
 * ledger relationship, out of this loop's masters-only scope), so the
 * safe, contract-consistent behavior is: never allow a hard delete
 * through this API at all, only the reversible active flag.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("masters.edit");

    const body = await request.json();
    const parsed = materialUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [existing] = await db.select().from(materials).where(eq(materials.id, params.id));
    if (!existing) {
      throw new NotFoundError(`Material "${params.id}" not found.`);
    }

    await db
      .update(materials)
      .set({ active: parsed.data.active ? 1 : 0, updatedAt: new Date().toISOString() })
      .where(eq(materials.id, params.id));

    const [updated] = await db.select().from(materials).where(eq(materials.id, params.id));
    return NextResponse.json({ material: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
