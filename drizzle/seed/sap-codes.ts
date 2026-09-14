/**
 * SAP Warehouse Master seed data (Loop 14 / PEN-007 architecture).
 *
 * Transcribed directly, row for row, from the canonical flow document's
 * Appendix D ("Complete SAP Storage Location Master"), sections D.1
 * (Limbasi Plant - Finished Goods) and D.6 (Sabarkantha Plant - Finished
 * Goods) - the two sections marked Finished-Goods-relevant. No row
 * invented; nothing from the other Appendix D sections (Raw Material,
 * Packing Material, Ingredients & Additives, "Other", Patan) is included
 * here, since this module's locked scope is FG only.
 *
 * PEN-018 finding (recorded, not silently resolved): section D.6's own
 * heading says "(24 codes)" but the table under it actually lists 25
 * rows. This file uses the 25 actually-enumerated rows (itemized data
 * over a summary count), giving 20 + 25 = 45 FG-relevant codes total,
 * not the "44" figure quoted elsewhere in this repository's own
 * documentation (README, implementation spec, backend stack doc). That
 * "44" figure predates this transcription and has not been corrected
 * here - see PEN-018 in docs/PENDING_ITEMS.md.
 *
 * Type-value finding (also recorded): the architecture blueprint's own
 * attribute description for this entity lists only 4 type values
 * (STATUS/3PL/CROSS_PLANT/OTHER), but the actual Appendix D data
 * contains a 5th real value for SKSALES ("Sales"). The schema's CHECK
 * constraint (drizzle/schema.ts) includes SALES because the real data
 * requires it - the architecture blueprint's summary was incomplete for
 * this one entity, not the other way around.
 */
export type SapCodeSeedRow = {
  sapCode: string;
  sapName: string;
  plant: "LIMBASI" | "SABARKANTHA";
  type: "STATUS" | "3PL" | "CROSS_PLANT" | "OTHER" | "SALES";
  moduleStatusMapping: string;
  fgRelevant: 0 | 1;
};

const LIMBASI_FG: SapCodeSeedRow[] = [
  { sapCode: "LMFGQ", sapName: "Limbasi FG Under QC Warehouse - Frozen", plant: "LIMBASI", type: "STATUS", moduleStatusMapping: "QC HOLD", fgRelevant: 1 },
  { sapCode: "LMFGA", sapName: "Limbasi FG Approved Warehouse - Frozen", plant: "LIMBASI", type: "STATUS", moduleStatusMapping: "OK/AVAILABLE", fgRelevant: 1 },
  { sapCode: "LMFGH", sapName: "Limbasi FG Hold Warehouse", plant: "LIMBASI", type: "STATUS", moduleStatusMapping: "HOLD", fgRelevant: 1 },
  { sapCode: "LMFGD", sapName: "Limbasi FG Dispatch Warehouse", plant: "LIMBASI", type: "STATUS", moduleStatusMapping: "DISPATCHED", fgRelevant: 1 },
  { sapCode: "LMFGIN", sapName: "Limbasi FG In-Transit Warehouse - Frozen", plant: "LIMBASI", type: "STATUS", moduleStatusMapping: "IN TRANSIT", fgRelevant: 1 },
  { sapCode: "LMFGBULK", sapName: "Limbasi FG Bulk Warehouse", plant: "LIMBASI", type: "STATUS", moduleStatusMapping: "BULK", fgRelevant: 1 },
  { sapCode: "LMFGCS", sapName: "Limbasi FG Customer Sample Warehouse", plant: "LIMBASI", type: "STATUS", moduleStatusMapping: "CUSTOMER SAMPLE", fgRelevant: 1 },
  { sapCode: "LMFGSMPL", sapName: "Limbasi FG Sample Warehouse - Frozen", plant: "LIMBASI", type: "STATUS", moduleStatusMapping: "SAMPLE", fgRelevant: 1 },
  { sapCode: "LMFGVIND", sapName: "Limbasi FG Virtual INDICOLD Approved - Frozen", plant: "LIMBASI", type: "3PL", moduleStatusMapping: "Indicold (virtual)", fgRelevant: 1 },
  { sapCode: "LMFGA-CM", sapName: "Cold Man Approved Warehouse - Frozen", plant: "LIMBASI", type: "3PL", moduleStatusMapping: "Cold Man", fgRelevant: 1 },
  { sapCode: "LMFG-CMU", sapName: "Cold Man (QC variant)", plant: "LIMBASI", type: "3PL", moduleStatusMapping: "Cold Man (QC pending)", fgRelevant: 1 },
  { sapCode: "LMFGA-CR", sapName: "Cold Rush Approved Warehouse - Frozen", plant: "LIMBASI", type: "3PL", moduleStatusMapping: "Cold Rush", fgRelevant: 1 },
  { sapCode: "LMFGACRH", sapName: "Cold Rush Approved - Coldrush variant", plant: "LIMBASI", type: "3PL", moduleStatusMapping: "Cold Rush (alt)", fgRelevant: 1 },
  { sapCode: "LMFGA-RK", sapName: "Radhakrishan Cold Store", plant: "LIMBASI", type: "3PL", moduleStatusMapping: "Radhakrishan", fgRelevant: 1 },
  { sapCode: "LMFGARKU", sapName: "Radha Krishna Cold Storage - GJ", plant: "LIMBASI", type: "3PL", moduleStatusMapping: "Radha Krishna (GJ)", fgRelevant: 1 },
  { sapCode: "LMFGA-MZ", sapName: "MZ Cold Storage", plant: "LIMBASI", type: "3PL", moduleStatusMapping: "MZ", fgRelevant: 1 },
  { sapCode: "LMFGAMAR", sapName: "Amar Cold Store Approved - Frozen", plant: "LIMBASI", type: "3PL", moduleStatusMapping: "Amar", fgRelevant: 1 },
  { sapCode: "LMFGAWS", sapName: "Wholesome FG Approved Warehouse", plant: "LIMBASI", type: "3PL", moduleStatusMapping: "Wholesome", fgRelevant: 1 },
  { sapCode: "LMFGASK", sapName: "Sabarkantha Cold Storage (Limbasi FG at SK)", plant: "LIMBASI", type: "CROSS_PLANT", moduleStatusMapping: "Limbasi FG at SK", fgRelevant: 1 },
  { sapCode: "LMFGA-HO", sapName: "IBF Corporate Head Office", plant: "LIMBASI", type: "OTHER", moduleStatusMapping: "FG at Head Office", fgRelevant: 1 },
];

const SABARKANTHA_FG: SapCodeSeedRow[] = [
  { sapCode: "SKFGQ", sapName: "SK FG Under QC Warehouse - Frozen", plant: "SABARKANTHA", type: "STATUS", moduleStatusMapping: "QC HOLD", fgRelevant: 1 },
  { sapCode: "SKFGA", sapName: "SK FG Approved Warehouse - Frozen", plant: "SABARKANTHA", type: "STATUS", moduleStatusMapping: "OK/AVAILABLE", fgRelevant: 1 },
  { sapCode: "SKFGH", sapName: "SK FG Hold Warehouse", plant: "SABARKANTHA", type: "STATUS", moduleStatusMapping: "HOLD", fgRelevant: 1 },
  { sapCode: "SKFGBULK", sapName: "Himmatnagar FG Bulk Warehouse", plant: "SABARKANTHA", type: "STATUS", moduleStatusMapping: "BULK", fgRelevant: 1 },
  { sapCode: "SKFGCS", sapName: "Himmatnagar FG Customer Sample Warehouse", plant: "SABARKANTHA", type: "STATUS", moduleStatusMapping: "CUSTOMER SAMPLE", fgRelevant: 1 },
  { sapCode: "SKFGSMPL", sapName: "Himmatnagar FG Sample Warehouse", plant: "SABARKANTHA", type: "STATUS", moduleStatusMapping: "SAMPLE", fgRelevant: 1 },
  { sapCode: "SKGJFGIN", sapName: "SK Goods In-Transit Warehouse - Frozen", plant: "SABARKANTHA", type: "STATUS", moduleStatusMapping: "IN TRANSIT", fgRelevant: 1 },
  { sapCode: "SKGOA", sapName: "SK Grade Out Material Warehouse", plant: "SABARKANTHA", type: "STATUS", moduleStatusMapping: "REJECTED", fgRelevant: 1 },
  { sapCode: "SKFGA-FR", sapName: "Frostine Cold Storage", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Frostine", fgRelevant: 1 },
  { sapCode: "SKFGAFR2", sapName: "Frostine Elite Cold Storage-2", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Frostine Elite", fgRelevant: 1 },
  { sapCode: "SKFGACR", sapName: "Coldrush Logistics Mehsana", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Cold Rush Mehsana", fgRelevant: 1 },
  { sapCode: "SKFGACR2", sapName: "Coldrush Logistics Mehsana-2", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Cold Rush Mehsana-2", fgRelevant: 1 },
  { sapCode: "SKFGAFNK", sapName: "Nikhar Cold Storage", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Nikhar", fgRelevant: 1 },
  { sapCode: "SKFGAKKF", sapName: "Kravekraft Foods WH", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Kravekraft", fgRelevant: 1 },
  { sapCode: "SKFGASML", sapName: "Shree Maruti Integrated Logistics", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Shree Maruti", fgRelevant: 1 },
  { sapCode: "SKFGAVCM", sapName: "Virtual Cold Man Approved - Frozen", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Cold Man (virtual)", fgRelevant: 1 },
  { sapCode: "SKFGJJAF", sapName: "Jai Jinendra Agro Foods LLP", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Jai Jinendra", fgRelevant: 1 },
  { sapCode: "SKJJH", sapName: "Jai Jinendra - Hold WH", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Jai Jinendra (Hold)", fgRelevant: 1 },
  { sapCode: "SK1FGCR", sapName: "Cold Rush Plant Warehouse", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Cold Rush Plant", fgRelevant: 1 },
  { sapCode: "SK1FGCRM", sapName: "Cold Rush Mehsana Warehouse", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Cold Rush Mehsana", fgRelevant: 1 },
  { sapCode: "SK1FGCM", sapName: "Cold Man Approved - Frozen", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Cold Man", fgRelevant: 1 },
  { sapCode: "SK1FGAM", sapName: "Amar Cold Store Approved - Frozen", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Amar", fgRelevant: 1 },
  { sapCode: "SK1FGARK", sapName: "Radha Krishna Cold Storage", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Radha Krishna", fgRelevant: 1 },
  { sapCode: "SK1FGABT", sapName: "Brattle Warehouse", plant: "SABARKANTHA", type: "3PL", moduleStatusMapping: "Brattle", fgRelevant: 1 },
  { sapCode: "SKSALES", sapName: "SK Sales", plant: "SABARKANTHA", type: "SALES", moduleStatusMapping: "Dispatch/Sales", fgRelevant: 1 },
];

export const SAP_CODE_SEED_ROWS: SapCodeSeedRow[] = [...LIMBASI_FG, ...SABARKANTHA_FG];
