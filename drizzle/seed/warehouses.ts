/**
 * Warehouse Master seed data (Loop 28 / PEN-008 real grid).
 *
 * One real warehouse row, derived from the DSR Excel file Alpesh
 * provided (the same file whose CR-1/CR-2 sheets give the real
 * location grid seeded alongside this): the CONTAINER DETAILS sheet
 * names the physical location "LIMBASI-01", and every CR1/CR2
 * occupancy row in that file is Limbasi FG cold storage - there is no
 * parallel CR1/CR2 sheet for Sabarkantha in the file, so only this one
 * warehouse is seeded from real evidence; a Sabarkantha warehouse row
 * is not invented alongside it.
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
];
