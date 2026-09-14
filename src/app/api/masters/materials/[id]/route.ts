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
 * Updates any of the entities contract's "editable_by: [R12]" fields
 * (Loop 29 - see the validation schema's own comment for why `code`
 * is excluded). There is deliberately still no DELETE route: the
 * contract's own invariant says a material cannot be deleted while it
 * has active stock, only deactivated, and this repo has no reliable
 * per-material stock check yet (needs the pallet/stock ledger
 * relationship) - so a hard delete never exists here, only `active`.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("masters.edit");

    const body = await request.json();
    const parsed = materialUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }
    if (Object.keys(parsed.data).length === 0) {
      throw new ValidationError("Provide at least one field to update.");
    }

    const db = getDb();
    const [existing] = await db.select().from(materials).where(eq(materials.id, params.id));
    if (!existing) {
      throw new NotFoundError(`Material "${params.id}" not found.`);
    }

    const { active, ...rest } = parsed.data;
    await db
      .update(materials)
      .set({
        ...rest,
        ...(active !== undefined ? { active: active ? 1 : 0 } : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(materials.id, params.id));

    const [updated] = await db.select().from(materials).where(eq(materials.id, params.id));
    return NextResponse.json({ material: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
