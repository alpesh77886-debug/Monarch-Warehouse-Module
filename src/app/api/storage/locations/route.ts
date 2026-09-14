import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { locations } from "../../../../../drizzle/schema";
import { requirePermission } from "@/lib/auth";
import { locationCreateSchema } from "@/lib/validations/location";
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
      { error: "This full code is already in use by another location." },
      { status: 409 }
    );
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

// Location CRUD is "admin config" per the entities contract's own
// Location attribute list - same masters.edit gate as Warehouse Master.
export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select().from(locations).orderBy(asc(locations.fullCode));
    return NextResponse.json({ locations: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("masters.edit");

    const body = await request.json();
    const parsed = locationCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const db = getDb();
    const id = crypto.randomUUID();
    await db.insert(locations).values({
      id,
      warehouseId: parsed.data.warehouseId,
      coldRoom: parsed.data.coldRoom,
      block: parsed.data.block ?? null,
      position: parsed.data.position ?? null,
      floor: parsed.data.floor ?? null,
      fullCode: parsed.data.fullCode,
      capacityPallets: parsed.data.capacityPallets,
      status: "EMPTY",
      createdAt: new Date().toISOString(),
    });

    const [created] = await db.select().from(locations).where(eq(locations.id, id));
    return NextResponse.json({ location: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
