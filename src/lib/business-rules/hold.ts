import { ValidationError } from "../errors";

/**
 * Hold Record business rules (Loop 38 / TASK-006, Flow 3).
 *
 * Grounded directly in the domain entities contract's `hold_record`
 * entity (ENTITY-011) and INV-015 ("Hold reason from fixed dropdown (no
 * free text)") - nothing here is invented scope.
 */

// Transcribed exactly from the domain entities contract's own
// `fixed_hold_reasons` list - order and wording preserved, including the
// trailing "Other" entry whose own conditional_rule requires
// custom_reason.
export const HOLD_REASONS = [
  "High Temperature",
  "Metal piece found (repass needed)",
  "Thread contamination",
  "Enzyme test positive",
  "Uneven coating / Belt mark",
  "High defects / Major defects",
  "Dull appearance and color difference",
  "Short length",
  "Black particles",
  "White patches on product surface",
  "Wrong batch code printed",
  "Batter bubbles",
  "Product carton not available",
  "Low retention time",
  "Bad smell in product",
  "Misshapes",
  "Over-production (bulk)",
  "Defective fries (bulk)",
  "Trial / Sample",
  "Other (requires supervisor approval)",
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

export const OTHER_HOLD_REASON: HoldReason = "Other (requires supervisor approval)";

export type HoldStatus = "ACTIVE" | "RELEASED" | "REJECTED";

/**
 * NS-015 ("Free-text hold reason" -> 422): rejects anything not in the
 * fixed dropdown. Also enforces the entity's own conditional_rule -
 * custom_reason is required only when hold_reason is the "Other" value,
 * and must be left empty otherwise (a custom reason attached to a real,
 * specific reason would silently contradict the reason actually picked).
 */
export function validateHoldReason(reason: string, customReason: string | undefined | null): void {
  if (!(HOLD_REASONS as readonly string[]).includes(reason)) {
    throw new ValidationError(`Invalid hold reason - must be one of the fixed dropdown values.`);
  }
  const trimmedCustom = customReason?.trim();
  if (reason === OTHER_HOLD_REASON && !trimmedCustom) {
    throw new ValidationError(`A custom reason is required when hold reason is "${OTHER_HOLD_REASON}".`);
  }
  if (reason !== OTHER_HOLD_REASON && trimmedCustom) {
    throw new ValidationError(`Custom reason is only allowed when hold reason is "${OTHER_HOLD_REASON}".`);
  }
}

export type HoldAgeBucket = "RED" | "AMBER" | "OK";

// SCREEN-004's own legend: "Red (>7d) / Amber (>3d) / OK". Whole days
// since placed_at, using calendar time (not business days - nothing in
// the flow document scopes this to working days only).
export function holdAgeDays(placedAt: string, now: Date = new Date()): number {
  const placed = new Date(placedAt);
  const diffMs = now.getTime() - placed.getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

export function holdAgeBucket(days: number): HoldAgeBucket {
  if (days > 7) return "RED";
  if (days > 3) return "AMBER";
  return "OK";
}

/**
 * hold_number generated_format "HOLD-YYYY-MMDD-NNN", the same reading
 * already applied to Receiving Sheet's own RS-YYYY-MMDD-NNN format.
 */
export function holdNumberPrefix(date: string): string {
  const [y, m, d] = date.split("-");
  return `HOLD-${y}-${m}${d}-`;
}
