import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { locations } from "../../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { locationBlockSchema } from "@/lib/validations/location";
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
 * Block/unblock a location only - never touches occupancy fields
 * (`current_pallet_id`) here, since changing who occupies a location
 * is the putaway/move endpoints' job, not this one's.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("masters.edit");

    const body = await request.json();
    const parsed = locationBlockSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const [existing] = await db.select().from(locations).where(eq(locations.id, params.id));
    if (!existing) {
      throw new NotFoundError(`Location "${params.id}" not found.`);
    }
    if (existing.currentPalletId) {
      throw new ValidationError(
        `Location ${existing.fullCode} currently holds a pallet - move it out before changing this location's status.`
      );
    }

    await db.update(locations).set({ status: parsed.data.status }).where(eq(locations.id, params.id));

    const [updated] = await db.select().from(locations).where(eq(locations.id, params.id));
    return NextResponse.json({ location: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
