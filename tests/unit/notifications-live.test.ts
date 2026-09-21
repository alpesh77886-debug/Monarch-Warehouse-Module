import { describe, expect, it, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

/**
 * Loop 50 / PEN-038: live, end-to-end in-app notification inbox
 * (GET /api/notifications, mark-one-read, mark-all-read) - same
 * requirePermission-mock technique as every other *-live.test.ts file
 * in this repository, against the real local D1 file.
 */
const { currentUserId } = vi.hoisted(() => ({ currentUserId: { value: "loop-50-notif-viewer" as string | undefined } }));

vi.mock("@/lib/auth", () => ({
  requireCurrentUserId: vi.fn(async () => {
    const { UnauthorizedError, AuthNotConfiguredError } = await import("../../src/lib/errors");
    if (currentUserId.value === "STUB") throw new AuthNotConfiguredError();
    if (!currentUserId.value) throw new UnauthorizedError();
    return currentUserId.value;
  }),
}));

const { getDb } = await import("@/lib/db");
const { users, notifications } = await import("../../drizzle/schema");
const { GET: listNotifications } = await import("@/app/api/notifications/route");
const { POST: markRead } = await import("@/app/api/notifications/[id]/read/route");
const { POST: markAllRead } = await import("@/app/api/notifications/read-all/route");

function getRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}
function postRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost"), { method: "POST" });
}

const db = getDb();

const VIEWER_ID = "loop-50-notif-viewer";
const OTHER_ID = "loop-50-notif-other";

beforeAll(async () => {
  for (const id of [VIEWER_ID, OTHER_ID]) {
    const [existing] = await db.select().from(users).where(eq(users.id, id));
    if (!existing) {
      await db.insert(users).values({
        id,
        clerkUserId: `${id}-clerk`,
        name: `Loop 50 notif fixture ${id}`,
        email: `${id}@example.test`,
        roleId: "R01",
        department: "Warehouse",
        plant: "LIMBASI",
      });
    }
  }
});

let ownNotificationId: string;
let otherNotificationId: string;

describe("Notifications - real inbox reads/writes against local D1", () => {
  it("seeds two real notification rows (one for the viewer, one for someone else)", async () => {
    ownNotificationId = crypto.randomUUID();
    otherNotificationId = crypto.randomUUID();
    await db.insert(notifications).values([
      {
        id: ownNotificationId,
        recipientUserId: VIEWER_ID,
        eventType: "HOLD_PLACED",
        title: "Test notification",
        body: "Body text",
        referenceType: "HOLD_RECORD",
        referenceId: "does-not-matter",
      },
      {
        id: otherNotificationId,
        recipientUserId: OTHER_ID,
        eventType: "HOLD_PLACED",
        title: "Not mine",
        body: "Body text",
        referenceType: "HOLD_RECORD",
        referenceId: "does-not-matter",
      },
    ]);
  });

  it("honestly refuses in Clerk stub mode - no session to know whose inbox this is", async () => {
    currentUserId.value = "STUB";
    try {
      const res = await listNotifications();
      expect(res.status).toBe(503);
    } finally {
      currentUserId.value = VIEWER_ID;
    }
  });

  it("lists only the caller's own notifications, never someone else's", async () => {
    const res = await listNotifications();
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    const ids = (body.notifications as { id: string }[]).map((n) => n.id);
    expect(ids).toContain(ownNotificationId);
    expect(ids).not.toContain(otherNotificationId);
    expect(body.unreadCount).toBeGreaterThanOrEqual(1);
  });

  it("marks the caller's own notification read", async () => {
    const res = await markRead(postRequest(`/api/notifications/${ownNotificationId}/read`), {
      params: { id: ownNotificationId },
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.notification.readAt).not.toBeNull();

    const [row] = await db.select().from(notifications).where(eq(notifications.id, ownNotificationId));
    expect(row.readAt).not.toBeNull();
  });

  it("404s marking someone ELSE's notification read - never leaks or mutates it", async () => {
    const res = await markRead(postRequest(`/api/notifications/${otherNotificationId}/read`), {
      params: { id: otherNotificationId },
    });
    expect(res.status).toBe(404);

    const [row] = await db.select().from(notifications).where(eq(notifications.id, otherNotificationId));
    expect(row.readAt).toBeNull(); // untouched
  });

  it("mark-all-read only touches the caller's own rows", async () => {
    const freshId = crypto.randomUUID();
    await db.insert(notifications).values({
      id: freshId,
      recipientUserId: VIEWER_ID,
      eventType: "HOLD_FOLLOWUP",
      title: "Another one",
      body: "Body",
      referenceType: "HOLD_RECORD",
      referenceId: "does-not-matter",
    });

    const res = await markAllRead();
    expect(res.status).toBe(200);

    const [mine] = await db.select().from(notifications).where(eq(notifications.id, freshId));
    expect(mine.readAt).not.toBeNull();
    const [theirs] = await db.select().from(notifications).where(eq(notifications.id, otherNotificationId));
    expect(theirs.readAt).toBeNull(); // still untouched
  });
});
