import type { Role } from "./auth";

/**
 * Typed permission matrix (Loop 16 / RBAC hardening), transcribed
 * field-for-field from the locked permissions contract. Nothing here
 * is invented - R05's "inherits: R04" and R12's wildcard "all" are
 * expressed exactly as the contract states them.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  R01: [
    "receiving_sheet.create",
    "receiving_sheet.confirm_warehouse",
    "loading_sheet.create",
    "loading_sheet.verify",
    "maintenance.create",
    "maintenance.close",
    "stock.view_ledger",
    "stock.view_summary",
  ],
  R02: [
    "putaway.confirm_location",
    "putaway.move_pallet",
    "loading_sheet.load",
    "maintenance.create",
    "maintenance.verify_fix",
  ],
  R03: [
    "receiving_sheet.create",
    "receiving_sheet.confirm_warehouse",
    "putaway.confirm_location",
    "putaway.override_location",
    "holds.view",
    "holds.followup_nudge",
    "fifo.override",
    "loading_sheet.create",
    "loading_sheet.verify",
    "transfers.create",
    "transfers.dispatch",
    "dispatch_orders.create",
    "dispatch_orders.generate_pick_list",
    "gate_pass.generate",
    "maintenance.create",
    "maintenance.view",
    "stock.view_ledger",
    "stock.view_summary",
    "stock.export",
  ],
  R04: [
    "receiving_sheet.view",
    "holds.view",
    "holds.create",
    "holds.release",
    "holds.reject",
    "export_container.approve",
    "loading_sheet.view",
    "stock.view_ledger",
  ],
  // R05 = R04's full permission set ("inherits: R04" in the contract)
  // plus its own two additional permissions.
  R05: [] as string[], // computed below, after R04 is defined
  R06: ["receiving_sheet.confirm_packing", "receiving_sheet.view", "bulk.view", "bulk.receive_for_repack"],
  R07: ["receiving_sheet.confirm_packing", "receiving_sheet.view"],
  R08: ["holds.view", "holds.acknowledge", "holds.request_reinspection", "bulk.view"],
  R09: [
    "dispatch_orders.create",
    "dispatch_orders.generate_pick_list",
    "loading_sheet.create",
    "transfers.create",
    "transfers.dispatch",
    "fifo.override",
    "stock.view_ledger",
    "stock.export",
  ],
  R10: ["loading_sheet.view", "gate_pass.verify", "gate_pass.record_exit"],
  R11: ["maintenance.acknowledge", "maintenance.resolve", "maintenance.view"],
  // R12 = "all" (wildcard) plus the 3 named admin-specific permissions
  // the contract lists alongside it.
  R12: ["all", "masters.edit", "users.manage", "system.configure"],
};

// Fill in R05 now that R04 is defined (avoids duplicating the R04 list by hand).
(ROLE_PERMISSIONS as Record<Role, string[]>).R05 = [
  ...ROLE_PERMISSIONS.R04,
  "holds.bulk_release",
  "holds.escalation_authority",
];

/**
 * True if the role has the given permission, honoring R12's "all"
 * wildcard exactly as the contract defines it. This is the
 * fine-grained alternative to requireRole's raw role-list check -
 * prefer this where the contract expresses an action as a permission
 * rather than a role list.
 */
export function hasPermission(role: Role | undefined, permission: string): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role];
  return permissions.includes("all") || permissions.includes(permission);
}
