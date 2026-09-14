import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { materials } from "../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { materialCreateSchema } from "@/lib/validations/material";
import { UnauthorizedError, ForbiddenError, ValidationError, AuthNotConfiguredError } from "@/lib/errors";

// Node.js runtime (not edge): better-sqlite3 needs real filesystem/native
// module access, which the edge runtime does not provide.
export const runtime = "nodejs";

function errorResponse(err: unknown) {
  if (
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError ||
    err instanceof ValidationError ||
    err instanceof AuthNotConfiguredError
  ) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof Error && err.message.includes("SQLITE_CONSTRAINT")) {
    return NextResponse.json(
      { error: "This code is already in use by another material." },
      { status: 409 }
    );
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

/** R12-and-up read access, matching the permission matrix's masters.edit role scope for now (list is not separately gated in the matrix, so any authenticated session may read). */
export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select().from(materials).orderBy(asc(materials.code));
    return NextResponse.json({ materials: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("masters.edit");

    const body = await request.json();
    const parsed = materialCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.insert(materials).values({
      id,
      code: parsed.data.code,
      description: parsed.data.description,
      uomKgPerCarton: parsed.data.uomKgPerCarton,
      category: parsed.data.category,
      palletWeightLimitKg: parsed.data.palletWeightLimitKg,
      palletType: parsed.data.palletType,
      shelfLifeDays: parsed.data.shelfLifeDays ?? null,
      plantOrigin: parsed.data.plantOrigin,
      active: 1,
      createdAt: now,
      updatedAt: now,
    });

    const [created] = await db.select().from(materials).where(eq(materials.id, id));
    return NextResponse.json({ material: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
