import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { warehouses } from "../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { warehouseCreateSchema } from "@/lib/validations/warehouse";
import {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  AuthNotConfiguredError,
} from "@/lib/errors";

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
      { error: "This code is already in use by another warehouse." },
      { status: 409 }
    );
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select().from(warehouses).orderBy(asc(warehouses.code));
    return NextResponse.json({ warehouses: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("masters.edit");

    const body = await request.json();
    const parsed = warehouseCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.insert(warehouses).values({
      id,
      code: parsed.data.code,
      name: parsed.data.name,
      type: parsed.data.type,
      plant: parsed.data.plant,
      sapCode: parsed.data.sapCode,
      address: parsed.data.address ?? null,
      locationStructure: parsed.data.locationStructure,
      active: 1,
      createdAt: now,
    });

    const [created] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    return NextResponse.json({ warehouse: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
