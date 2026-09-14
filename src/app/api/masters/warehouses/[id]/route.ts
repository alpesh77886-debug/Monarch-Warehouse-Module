import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { warehouses } from "../../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { warehouseUpdateSchema } from "@/lib/validations/warehouse";
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

/** Deactivate/reactivate only - same no-hard-delete rule as Material Master. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("masters.edit");

    const body = await request.json();
    const parsed = warehouseUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [existing] = await db.select().from(warehouses).where(eq(warehouses.id, params.id));
    if (!existing) {
      throw new NotFoundError(`Warehouse "${params.id}" not found.`);
    }

    await db
      .update(warehouses)
      .set({ active: parsed.data.active ? 1 : 0 })
      .where(eq(warehouses.id, params.id));

    const [updated] = await db.select().from(warehouses).where(eq(warehouses.id, params.id));
    return NextResponse.json({ warehouse: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
