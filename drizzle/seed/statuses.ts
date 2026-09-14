/**
 * Status Master seed data (Loop 14 / PEN-007 architecture).
 *
 * This is the locked, fixed 10-value status vocabulary already
 * referenced by the CHECK constraints on materials/pallets/stock_ledger
 * in drizzle/schema.ts. Transcribed directly from the architecture
 * blueprint's Status Master attribute table (ENTITY-008) - no values
 * invented.
 *
 * dispatchable/transferable modeling note: the source table uses "YES",
 * "NO", "N/A" (for DISPATCHED/IN_TRANSIT, which are not pick-eligible
 * states at all) and "Conditional" (for REJECTED's transferable flag,
 * whose actual condition is business logic not yet formally contracted -
 * see PEN-014). Both "N/A" and "Conditional" are conservatively modeled
 * as false (0) here - a safe default, not an invented business rule -
 * until a formal contract defines the conditional logic.
 */
export type StatusSeedRow = {
  code: string;
  description: string;
  dispatchable: 0 | 1;
  transferable: 0 | 1;
  sapLimbasi: string;
  sapSabarkantha: string | null;
};

export const STATUS_SEED_ROWS: StatusSeedRow[] = [
  {
    code: "QC_HOLD",
    description: "QC Hold (new inward)",
    dispatchable: 0,
    transferable: 1,
    sapLimbasi: "LMFGQ",
    sapSabarkantha: "SKFGQ",
  },
  {
    code: "OK",
    description: "OK / Available",
    dispatchable: 1,
    transferable: 1,
    sapLimbasi: "LMFGA",
    sapSabarkantha: "SKFGA",
  },
  {
    code: "HOLD",
    description: "Hold",
    dispatchable: 0,
    transferable: 1, // with hold tag
    sapLimbasi: "LMFGH",
    sapSabarkantha: "SKFGH",
  },
  {
    code: "BULK",
    description: "Bulk",
    dispatchable: 0,
    transferable: 1, // with bulk tag
    sapLimbasi: "LMFGBULK",
    sapSabarkantha: "SKFGBULK",
  },
  {
    code: "DISPATCHED",
    description: "Dispatched",
    dispatchable: 0, // N/A in source - terminal state, not re-dispatchable
    transferable: 0, // N/A in source
    sapLimbasi: "LMFGD",
    sapSabarkantha: "SKSALES",
  },
  {
    code: "IN_TRANSIT",
    description: "In Transit",
    dispatchable: 0, // N/A in source - transitional state
    transferable: 0, // N/A in source
    sapLimbasi: "LMFGIN",
    sapSabarkantha: "SKGJFGIN",
  },
  {
    code: "CUSTOMER_SAMPLE",
    description: "Customer Sample",
    dispatchable: 0,
    transferable: 1,
    sapLimbasi: "LMFGCS",
    sapSabarkantha: "SKFGCS",
  },
  {
    code: "SAMPLE",
    description: "Sample",
    dispatchable: 0,
    transferable: 1,
    sapLimbasi: "LMFGSMPL",
    sapSabarkantha: "SKFGSMPL",
  },
  {
    code: "REJECTED",
    description: "Rejected / Grade Out",
    dispatchable: 0,
    transferable: 0, // "Conditional" in source - defaulted to false, see note above
    sapLimbasi: "LMGOA",
    sapSabarkantha: "SKGOA",
  },
  {
    code: "SCRAP",
    description: "Scrap",
    dispatchable: 0,
    transferable: 0,
    sapLimbasi: "LMSW",
    sapSabarkantha: null, // source table has no Sabarkantha scrap code
  },
];
