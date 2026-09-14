import { sqliteTable, text, integer, real, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Core Drizzle schema slice (Loop 6) - the 6 entities that already have a
 * formal attribute contract (Material Master, Batch, Pallet, Location,
 * Stock Ledger, User), plus a minimal Warehouse Master table because
 * Location and Pallet already reference one at the contract level even
 * though Warehouse Master itself is not yet formally contracted (see
 * docs/PENDING_ITEMS.md PEN-014 and docs/ENTITY_RELATIONSHIP_MAP.md).
 *
 * Enum values are enforced with real SQLite CHECK constraints (IN (...))
 * wherever the contract gives a fixed value list. Regex-shaped fields
 * (material code, batch number) only get a coarse prefix/shape CHECK
 * here, because SQLite has no native regex support without a registered
 * function; the full regex from the contract is enforced in the
 * application layer (Zod), not invented here.
 *
 * The stock_ledger append-only triggers and other DB triggers are added
 * as raw migration SQL in the next loop, not in this file.
 */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  roleId: text("role_id").notNull(),
  department: text("department").notNull(),
  plant: text("plant").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Minimal Warehouse Master shape (architecture-blueprint prose, ENTITY-006 -
// not yet in the formal entities contract; see PEN-014).
export const warehouses = sqliteTable(
  "warehouses",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    plant: text("plant").notNull(),
    sapCode: text("sap_code").notNull(),
    address: text("address"),
    locationStructure: text("location_structure").notNull(),
    active: integer("active").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    typeCheck: check("warehouses_type_check", sql`${table.type} IN ('OWN','3PL','CROSS_PLANT')`),
    plantCheck: check(
      "warehouses_plant_check",
      sql`${table.plant} IN ('LIMBASI','SABARKANTHA','PATAN')`
    ),
    locationStructureCheck: check(
      "warehouses_location_structure_check",
      sql`${table.locationStructure} IN ('RACK','FLAT')`
    ),
  })
);

// ENTITY-008 Status Master (architecture-blueprint prose, not yet in the
// formal entities contract - see PEN-014). The fixed 10-value list itself
// is already locked (materials/pallets already CHECK against it); this
// table is the reference data those checks describe.
export const statuses = sqliteTable(
  "statuses",
  {
    code: text("code").primaryKey(),
    description: text("description").notNull(),
    dispatchable: integer("dispatchable").notNull(),
    transferable: integer("transferable").notNull(),
    sapLimbasi: text("sap_limbasi").notNull(),
    sapSabarkantha: text("sap_sabarkantha"),
  },
  (table) => ({
    codeCheck: check(
      "statuses_code_check",
      sql`${table.code} IN ('QC_HOLD','OK','HOLD','BULK','DISPATCHED','IN_TRANSIT','CUSTOMER_SAMPLE','SAMPLE','REJECTED','SCRAP')`
    ),
  })
);

// ENTITY-007 SAP Warehouse Master (architecture-blueprint prose, not yet
// in the formal entities contract - see PEN-014). Reference data only;
// see drizzle/seed/sap-codes.ts for the seeded rows and PEN-018 for a
// count discrepancy found in the canonical source while deriving them.
export const sapCodes = sqliteTable(
  "sap_codes",
  {
    sapCode: text("sap_code").primaryKey(),
    sapName: text("sap_name").notNull(),
    plant: text("plant").notNull(),
    type: text("type").notNull(),
    moduleStatusMapping: text("module_status_mapping").notNull(),
    fgRelevant: integer("fg_relevant").notNull(),
  },
  (table) => ({
    typeCheck: check(
      "sap_codes_type_check",
      // SALES included because the real Appendix D data contains it
      // (SKSALES) - the architecture blueprint's own 4-value summary for
      // this field was incomplete; see PEN-018.
      sql`${table.type} IN ('STATUS','3PL','CROSS_PLANT','OTHER','SALES')`
    ),
  })
);

export const materials = sqliteTable(
  "materials",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    description: text("description").notNull(),
    uomKgPerCarton: real("uom_kg_per_carton").notNull(),
    category: text("category").notNull(),
    palletWeightLimitKg: real("pallet_weight_limit_kg").notNull(), // INV-007
    palletType: text("pallet_type").notNull(),
    shelfLifeDays: integer("shelf_life_days"),
    plantOrigin: text("plant_origin").notNull(),
    active: integer("active").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    // Enforces the LFG/SFG prefix at the database level. SKFG is a
    // SAP/warehouse code family, not a material code - see the SKFG
    // correction record - and must never satisfy this check.
    codePrefixCheck: check(
      "materials_code_prefix_check",
      sql`(${table.code} LIKE 'LFG%' OR ${table.code} LIKE 'SFG%')`
    ),
    palletTypeCheck: check(
      "materials_pallet_type_check",
      sql`${table.palletType} IN ('CARTON','ROLL','POUCH')`
    ),
    plantOriginCheck: check(
      "materials_plant_origin_check",
      sql`${table.plantOrigin} IN ('LIMBASI','SABARKANTHA')`
    ),
  })
);

export const batches = sqliteTable(
  "batches",
  {
    id: text("id").primaryKey(),
    batchNumber: text("batch_number").notNull().unique(),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id),
    productionDate: text("production_date").notNull(),
    productionLine: text("production_line").notNull(),
    shift: text("shift").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    productionLineCheck: check(
      "batches_production_line_check",
      sql`${table.productionLine} IN ('FF','SPECIALITY')`
    ),
    shiftCheck: check("batches_shift_check", sql`${table.shift} IN ('A','B','C')`),
    // Coarse shape check only (starts with 'L', minimum length for
    // year+month+day+sequence). Full ^L[0-9]{2}[A-L][0-9]{2}[0-9]{3,4}$
    // validation happens in the application layer.
    batchNumberShapeCheck: check(
      "batches_batch_number_shape_check",
      sql`(${table.batchNumber} LIKE 'L%' AND length(${table.batchNumber}) >= 9)`
    ),
  })
);

export const locations = sqliteTable(
  "locations",
  {
    id: text("id").primaryKey(),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    coldRoom: text("cold_room").notNull(),
    block: text("block"),
    position: text("position"),
    floor: integer("floor"),
    fullCode: text("full_code").notNull(),
    capacityPallets: integer("capacity_pallets").notNull().default(1),
    currentPalletId: text("current_pallet_id"),
    status: text("status").notNull().default("EMPTY"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    coldRoomCheck: check(
      "locations_cold_room_check",
      sql`${table.coldRoom} IN ('CR1','CR2','FLOOR','NA')`
    ),
    statusCheck: check(
      "locations_status_check",
      sql`${table.status} IN ('EMPTY','OCCUPIED','PARTIAL','BLOCKED')`
    ),
  })
);

export const pallets = sqliteTable(
  "pallets",
  {
    id: text("id").primaryKey(),
    palletNumber: text("pallet_number").notNull(),
    palletType: text("pallet_type").notNull(),
    materialId: text("material_id") // INV-006: one pallet = one material
      .notNull()
      .references(() => materials.id),
    currentLocationId: text("current_location_id").references(() => locations.id),
    statusCode: text("status_code").notNull().default("QC_HOLD"), // INV-014
    totalWeightKg: real("total_weight_kg").notNull(), // INV-007
    totalCartons: integer("total_cartons").notNull(),
    currentWarehouseId: text("current_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdBy: text("created_by").references(() => users.id),
  },
  (table) => ({
    palletTypeCheck: check(
      "pallets_pallet_type_check",
      sql`${table.palletType} IN ('PLASTIC','WOODEN')`
    ),
    statusCodeCheck: check(
      "pallets_status_code_check",
      sql`${table.statusCode} IN ('QC_HOLD','OK','HOLD','BULK','DISPATCHED','IN_TRANSIT','CUSTOMER_SAMPLE','SAMPLE','REJECTED','SCRAP')`
    ),
  })
);

// ENTITY-015 Stock Ledger. Its attribute list is not yet in the formal
// entities contract (only the append-only/invariant metadata is) - the
// columns below are sourced from the architecture blueprint's own
// attribute table for this entity (see PEN-014). Append-only enforcement
// (INV-009) is added as a database trigger in the next loop, not here.
export const stockLedger = sqliteTable(
  "stock_ledger",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    shift: text("shift").notNull(),
    transactionType: text("transaction_type").notNull(),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id),
    batchId: text("batch_id")
      .notNull()
      .references(() => batches.id),
    palletId: text("pallet_id")
      .notNull()
      .references(() => pallets.id),
    locationId: text("location_id").references(() => locations.id),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    qtyChange: integer("qty_change").notNull(),
    qtyAfter: integer("qty_after").notNull(),
    weightChangeKg: real("weight_change_kg").notNull(),
    weightAfterKg: real("weight_after_kg").notNull(),
    statusBefore: text("status_before"),
    statusAfter: text("status_after"),
    referenceType: text("reference_type").notNull(),
    referenceId: text("reference_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    remarks: text("remarks"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    shiftCheck: check("stock_ledger_shift_check", sql`${table.shift} IN ('A','B','C','NA')`),
    transactionTypeCheck: check(
      "stock_ledger_transaction_type_check",
      sql`${table.transactionType} IN ('INWARD','MOVE','HOLD','RELEASE','DISPATCH','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT','BULK_SEND','BULK_RECEIVE')`
    ),
    referenceTypeCheck: check(
      "stock_ledger_reference_type_check",
      sql`${table.referenceType} IN ('RECEIVING_SHEET','TRANSFER_ORDER','LOADING_SHEET','HOLD_RECORD','MANUAL_MOVE','CYCLE_COUNT')`
    ),
  })
);
