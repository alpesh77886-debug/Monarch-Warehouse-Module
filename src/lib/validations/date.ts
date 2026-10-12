import { z } from "zod";
import { isRealCalendarDate } from "../business-rules/receiving-sheet";

// Document numbers (RS-/LS-/TO-YYYY-MMDD-NNN) and ledger dates are built
// from this field, so it must be a real YYYY-MM-DD day.
export const isoDateString = z
  .string()
  .trim()
  .min(1, "Date is required.")
  .refine(isRealCalendarDate, "Date must be a real date in YYYY-MM-DD format.");
