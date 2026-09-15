/**
 * Warehouse Master seed data (Loop 28 / PEN-008 real grid; Loop 39 adds
 * Sabarkantha per Alpesh's own PEN-035 decision).
 *
 * Limbasi is derived from the DSR Excel file Alpesh provided (the same
 * file whose CR-1/CR-2 sheets give the real location grid seeded
 * alongside this): the CONTAINER DETAILS sheet names the physical
 * location "LIMBASI-01", and every CR1/CR2 occupancy row in that file
 * is Limbasi FG cold storage.
 *
 * Sabarkantha has no equivalent CR-sheet in that file (still true), but
 * Alpesh explicitly confirmed (PEN-035, Loop 39) it is a real warehouse
 * that will see real material transfers, and that it deliberately does
 * NOT need location-wise stock tracking the way Limbasi does - so this
 * warehouse row is seeded (unblocking Receiving Sheet lock and any
 * transfer into/out of it) with `locationStructure: "FLAT"` rather than
 * a rack grid, and no location rows are seeded for it - not an
 * oversight, the actual decision. sapCode "SKFGA" ("SK FG Approved
 * Warehouse - Frozen", OK/AVAILABLE mapping) is the real Appendix D
 * code playing the same role LMFGA plays for Limbasi.
 */
export type WarehouseSeedRow = {
  code: string;
  name: string;
  type: "OWN" | "3PL" | "CROSS_PLANT";
  plant: "LIMBASI" | "SABARKANTHA" | "PATAN";
  sapCode: string;
  locationStructure: "RACK" | "FLAT";
};

export const WAREHOUSE_SEED_ROWS: WarehouseSeedRow[] = [
  {
    code: "LIMBASI-FG",
    name: "Limbasi FG Warehouse (CR1/CR2)",
    type: "OWN",
    plant: "LIMBASI",
    // LMFGA = "Limbasi FG Approved Warehouse - Frozen" (OK/AVAILABLE),
    // the primary SAP code for this physical warehouse per Appendix D.
    sapCode: "LMFGA",
    locationStructure: "RACK",
  },
  {
    code: "SABARKANTHA-FG",
    name: "Sabarkantha FG Warehouse (transfer only, no location grid)",
    type: "OWN",
    plant: "SABARKANTHA",
    sapCode: "SKFGA",
    locationStructure: "FLAT",
  },
];
