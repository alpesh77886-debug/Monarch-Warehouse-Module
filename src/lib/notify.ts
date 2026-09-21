import { eq, inArray, and, ne } from "drizzle-orm";
import type { getDb, UnrunStatement } from "./db";
import { users, notifications } from "../../drizzle/schema";

/**
 * In-app notifications (Loop 50 / PEN-038 closure, Alpesh: "Application
 * Notification chahiye whatsapp ki jarurat nahi hai...Pop-up and
 * Notification dono aane chahiye...other department se abhi humne link
 * nahi kiya lekin Inter department rakho...Means Manager to Operators
 * and Executives, Executives to Operators and Managers, Operators to
 * executives and managers").
 *
 * The real 3-role graph this fans out to - see drizzle/schema.ts's own
 * doc comment on the notifications table for why R01/R02/R03 (Warehouse
 * Executive/Operator/Incharge) is the one literal, non-guessed match for
 * "Manager/Executive/Operator" in the real 12-role matrix. "Other
 * department se abhi link nahi kiya" means no other role ever appears
 * on either end of this graph yet - not the sender, not a recipient.
 *
 * Notifies every one of R01/R02/R03 EXCEPT the actor (if the actor
 * happens to be one of the three - e.g. R03's own follow-up nudge does
 * not notify R03 itself). Hold events are placed/released/rejected by
 * QC (R04/R05), never a Warehouse role today (see the real permission
 * matrix - R01/R02 hold no holds.* permission at all), so for those
 * events nobody is excluded and all three Warehouse roles are notified
 * about a status change on their own physical inventory - a deliberate,
 * disclosed reading, not an invented per-event asymmetric rule.
 */
export const WAREHOUSE_NOTIFY_ROLES = ["R01", "R02", "R03"] as const;

export type NotificationEventType =
  | "HOLD_PLACED"
  | "HOLD_RELEASED"
  | "HOLD_REJECTED"
  | "HOLD_PARTIALLY_RELEASED"
  | "HOLD_FOLLOWUP";

/**
 * Reads which real Warehouse-role users should receive this event, then
 * returns real, unrun INSERT statements (this project's own established
 * plan-then-batch pattern, PEN-044) - one per recipient, ready to be
 * appended to the SAME atomic batch as the business event's own writes.
 * A read-only call, never runs anything itself.
 */
export async function buildWarehouseNotificationInserts(
  db: ReturnType<typeof getDb>,
  params: {
    eventType: NotificationEventType;
    title: string;
    body: string;
    referenceType: string;
    referenceId: string;
    createdByUserId: string | null;
  }
): Promise<UnrunStatement[]> {
  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(
      params.createdByUserId
        ? and(inArray(users.roleId, WAREHOUSE_NOTIFY_ROLES), ne(users.id, params.createdByUserId))
        : inArray(users.roleId, WAREHOUSE_NOTIFY_ROLES)
    );

  return recipients.map((r) =>
    db.insert(notifications).values({
      id: crypto.randomUUID(),
      recipientUserId: r.id,
      eventType: params.eventType,
      title: params.title,
      body: params.body,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      createdByUserId: params.createdByUserId,
    })
  );
}
