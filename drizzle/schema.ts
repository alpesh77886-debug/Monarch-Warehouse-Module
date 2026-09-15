import { sqliteTable, text, integer, real, check, uniqueIndex } from "drizzle-orm/sqlite-core";
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

// Warehouse Master (ENTITY-006 - formally contracted since Loop 34, see
// PEN-014; this table already matched the contract's shape once applied).
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
    // Unique because a full_code identifies one physical location - two
    // rows for the same physical spot would be a data-integrity bug.
    // (Schema-correctness fix found and applied in the location-grid
    // loop - entities.yaml does not explicitly say "unique" for this
    // field, but the architecture blueprint's own description of the
    // location hierarchy makes this an obvious, non-invented rule.)
    fullCode: text("full_code").notNull().unique(),
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

// ENTITY-004 Pallet-Batch junction (Loop 35 / TASK-004) - now formally
// contracted (Loop 34 closed PEN-014/017). Lets one pallet carry more than
// one batch of the SAME material (INV-006 extension), and is the missing
// link PEN-024/025 already identified: without this table, putaway/move
// had no real batch_id to write a stock_ledger row with. This is what
// unblocks that gap, not a new invented relationship.
export const palletBatches = sqliteTable(
  "pallet_batches",
  {
    id: text("id").primaryKey(),
    palletId: text("pallet_id")
      .notNull()
      .references(() => pallets.id),
    batchId: text("batch_id")
      .notNull()
      .references(() => batches.id),
    cartonQty: integer("carton_qty").notNull(),
    weightKg: real("weight_kg").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  }
);

// ENTITY-009 Receiving Sheet (Loop 35 / TASK-004). `batchNumber` is a plain
// text field here, not a `batches` FK - matching the entities contract
// exactly, which lists it as `type: text` rather than `references: batches`.
// The application layer finds-or-creates the real `batches` row (by its
// unique batch_number) only once the sheet locks, per the flow document's
// own Step 4 - a DRAFT sheet may reference a batch number that does not
// exist as a row yet.
export const receivingSheets = sqliteTable(
  "receiving_sheets",
  {
    id: text("id").primaryKey(),
    sheetNumber: text("sheet_number").notNull().unique(),
    date: text("date").notNull(),
    shift: text("shift").notNull(),
    line: text("line").notNull(),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id),
    batchNumber: text("batch_number").notNull(),
    totalQty: integer("total_qty").notNull().default(0),
    totalBoxes: integer("total_boxes").notNull().default(0),
    packingSupervisorId: text("packing_supervisor_id").references(() => users.id),
    packingOperatorId: text("packing_operator_id").references(() => users.id),
    warehouseExecutiveId: text("warehouse_executive_id").references(() => users.id),
    warehouseOperatorId: text("warehouse_operator_id").references(() => users.id),
    packingConfirmedAt: text("packing_confirmed_at"),
    warehouseConfirmedAt: text("warehouse_confirmed_at"),
    status: text("status").notNull().default("DRAFT"),
    defaultPalletStatus: text("default_pallet_status").notNull().default("QC_HOLD"),
    // Loop 42 / TASK-007 (Bulk Management, Flow 3 Step 7): both nullable,
    // used only when defaultPalletStatus is 'BULK' (bulkReason) or when
    // this sheet is itself a repack receipt (originalBulkPalletId) - see
    // src/lib/business-rules/bulk.ts's own comment and PEN-040 in
    // docs/PENDING_ITEMS.md for the disclosed reasoning (neither field
    // exists on ENTITY-009's own contracted attribute list).
    bulkReason: text("bulk_reason"),
    originalBulkPalletId: text("original_bulk_pallet_id").references(() => pallets.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    shiftCheck: check("receiving_sheets_shift_check", sql`${table.shift} IN ('A','B','C')`),
    lineCheck: check("receiving_sheets_line_check", sql`${table.line} IN ('FF','SPECIALITY')`),
    // Coarse shape check only, same convention as the batches table's own
    // batch_number check - the full regex is enforced in the application
    // layer (Zod), not invented here.
    batchNumberShapeCheck: check(
      "receiving_sheets_batch_number_shape_check",
      sql`(${table.batchNumber} LIKE 'L%' AND length(${table.batchNumber}) >= 9)`
    ),
    statusCheck: check(
      "receiving_sheets_status_check",
      // Loop 39 / PEN-033: Alpesh decided CANCELLED should exist,
      // resolving the disagreement between the applied domain entities
      // contract (originally 4 values, no CANCELLED) and workflows.yaml's
      // 5-state machine (which already had it). This CHECK constraint now
      // matches workflows.yaml; the domain entities contract file itself
      // is protected and still needs Alpesh's own paste of the matching
      // one-line patch - see docs/PENDING_ITEMS.md PEN-033 for that exact
      // text, prepared but not self-applied.
      sql`${table.status} IN ('DRAFT','PENDING_PACKING','PENDING_WAREHOUSE','LOCKED','CANCELLED')`
    ),
    defaultPalletStatusCheck: check(
      "receiving_sheets_default_pallet_status_check",
      sql`${table.defaultPalletStatus} IN ('QC_HOLD','BULK')`
    ),
    // Loop 42 / TASK-007: the two values transcribed exactly from the
    // domain entities contract's own fixed_hold_reasons list (ENTITY-011,
    // already reused verbatim as HOLD_REASONS in hold.ts) - not a new,
    // invented vocabulary.
    bulkReasonCheck: check(
      "receiving_sheets_bulk_reason_check",
      sql`(${table.bulkReason} IS NULL OR ${table.bulkReason} IN ('Over-production (bulk)', 'Defective fries (bulk)'))`
    ),
    // NS-012 backstop: "Duplicate receiving sheet (same material+batch+
    // shift)" must be rejected. The API route checks this first for a
    // clean 409 message; this unique index is the database-level
    // guarantee for the same race-condition reason stock_ledger's own
    // triggers exist - a bug or a future code path cannot silently
    // create a second sheet for the same material+batch+shift even if
    // the app-layer check is ever bypassed.
    materialBatchShiftUnique: uniqueIndex("receiving_sheets_material_batch_shift_unique").on(
      table.materialId,
      table.batchNumber,
      table.shift
    ),
  })
);

// ENTITY-010 Receiving Sheet Pallet (Loop 35 / TASK-004) - one row per
// physical pallet entered on a receiving sheet (NS-019: max 35 per sheet).
export const receivingSheetPallets = sqliteTable(
  "receiving_sheet_pallets",
  {
    id: text("id").primaryKey(),
    receivingSheetId: text("receiving_sheet_id")
      .notNull()
      .references(() => receivingSheets.id),
    srNo: integer("sr_no").notNull(),
    palletNumber: text("pallet_number").notNull(),
    qty: integer("qty").notNull(),
    receivingTime: text("receiving_time").notNull(),
    cartonCondition: text("carton_condition").notNull().default("OK"),
    temperatureC: real("temperature_c"),
    remarks: text("remarks"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    cartonConditionCheck: check(
      "receiving_sheet_pallets_carton_condition_check",
      sql`${table.cartonCondition} IN ('OK','BULGING','DAMAGED','WET','SHORT_QUANTITY','OTHER')`
    ),
    srNoPositiveCheck: check("receiving_sheet_pallets_sr_no_positive_check", sql`${table.srNo} >= 1`),
    // "sequential 1-35" (the contract's own validation note) - two rows
    // can't both be "row 3" of the same sheet; the 1-35 upper bound and
    // true sequencing are enforced in the application layer, where the
    // sheet's other rows are already loaded and the 35-row cap (NS-019)
    // is checked.
    sheetSrNoUnique: uniqueIndex("receiving_sheet_pallets_sheet_sr_no_unique").on(
      table.receivingSheetId,
      table.srNo
    ),
  })
);

// ENTITY-011 Hold Record (Loop 38 / TASK-006). `hold_reason` uses the
// entities contract's own `fixed_hold_reasons` list (20 values, INV-015 -
// "no free text") as a real SQLite CHECK constraint, same treatment as
// every other fixed-dropdown field in this schema. `custom_reason` is
// required only when hold_reason is the last value ("Other (requires
// supervisor approval)") - the contract's own conditional_rule - enforced
// in the application layer (Zod), since SQLite CHECK constraints can't
// easily cross-reference two columns' text values cleanly here.
export const holdRecords = sqliteTable(
  "hold_records",
  {
    id: text("id").primaryKey(),
    holdNumber: text("hold_number").notNull().unique(),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id),
    batchId: text("batch_id")
      .notNull()
      .references(() => batches.id),
    holdReason: text("hold_reason").notNull(),
    customReason: text("custom_reason"),
    placedById: text("placed_by_id")
      .notNull()
      .references(() => users.id),
    placedByDepartment: text("placed_by_department").notNull(),
    placedAt: text("placed_at").notNull(),
    releasedById: text("released_by_id").references(() => users.id),
    releasedAt: text("released_at"),
    releaseRemarks: text("release_remarks"),
    status: text("status").notNull().default("ACTIVE"),
    qcFollowupCount: integer("qc_followup_count").notNull().default(0),
    lastFollowupAt: text("last_followup_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    statusCheck: check("hold_records_status_check", sql`${table.status} IN ('ACTIVE','RELEASED','REJECTED')`),
    holdReasonCheck: check(
      "hold_records_hold_reason_check",
      sql`${table.holdReason} IN (
        'High Temperature',
        'Metal piece found (repass needed)',
        'Thread contamination',
        'Enzyme test positive',
        'Uneven coating / Belt mark',
        'High defects / Major defects',
        'Dull appearance and color difference',
        'Short length',
        'Black particles',
        'White patches on product surface',
        'Wrong batch code printed',
        'Batter bubbles',
        'Product carton not available',
        'Low retention time',
        'Bad smell in product',
        'Misshapes',
        'Over-production (bulk)',
        'Defective fries (bulk)',
        'Trial / Sample',
        'Other (requires supervisor approval)'
      )`
    ),
  })
);

// ENTITY-011's own `pallet_ids` attribute is `type: array`, which SQLite/
// Drizzle cannot store directly - the same translation already applied to
// Receiving Sheet's pallet rows and the Pallet-Batch relationship
// (ENTITY-004): a real junction table, not an invented new relationship.
// A hold covers 1..N pallets (Flow 3's own "select pallet(s) to hold").
export const holdPallets = sqliteTable(
  "hold_pallets",
  {
    id: text("id").primaryKey(),
    holdId: text("hold_id")
      .notNull()
      .references(() => holdRecords.id),
    palletId: text("pallet_id")
      .notNull()
      .references(() => pallets.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    // A given pallet can only be on ONE active hold at a time in practice
    // (its own status can only be QC_HOLD/HOLD once), but the same pallet
    // legitimately appears across multiple hold_pallets rows over its
    // lifetime (placed on hold, released, later held again) - so this
    // index only prevents the same pallet being added twice to the SAME
        // hold record, not across different ones.
    holdPalletUnique: uniqueIndex("hold_pallets_hold_pallet_unique").on(table.holdId, table.palletId),
  })
);

// ENTITY-013 Loading Sheet (Loop 41 / TASK-008). loaded_by_id, verified_by_id,
// gate_pass_number and gate_pass_time are listed `required: true` in the
// domain entities contract, but - same reading already applied to Receiving
// Sheet's own confirmation fields - that means "required for the document
// to be complete", not "required at the moment the DRAFT row is first
// created" (Flow 5's own Steps 3/5 fill these in progressively, long after
// creation). They are nullable here for exactly that reason, populated as
// the loading sheet moves through its real lifecycle.
export const loadingSheets = sqliteTable(
  "loading_sheets",
  {
    id: text("id").primaryKey(),
    loadingSheetNumber: text("loading_sheet_number").notNull().unique(),
    date: text("date").notNull(),
    vehicleNumber: text("vehicle_number").notNull(),
    driverName: text("driver_name").notNull(),
    transporter: text("transporter"),
    partyName: text("party_name").notNull(),
    destination: text("destination").notNull(),
    exportDomestic: text("export_domestic").notNull(),
    temperatureC: real("temperature_c").notNull(),
    qcApprovalById: text("qc_approval_by_id").references(() => users.id),
    qcApprovalAt: text("qc_approval_at"),
    containerNumber: text("container_number"),
    sealNumber: text("seal_number"),
    boltNumber: text("bolt_number"),
    gatePassNumber: text("gate_pass_number"),
    gatePassTime: text("gate_pass_time"),
    loadedById: text("loaded_by_id").references(() => users.id),
    verifiedById: text("verified_by_id").references(() => users.id),
    status: text("status").notNull().default("DRAFT"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    exportDomesticCheck: check(
      "loading_sheets_export_domestic_check",
      sql`${table.exportDomestic} IN ('EXPORT','DOMESTIC')`
    ),
    statusCheck: check(
      "loading_sheets_status_check",
      sql`${table.status} IN ('DRAFT','STAGING','LOADED','VERIFIED','GATE_PASSED','DISPATCHED')`
    ),
  })
);

// ENTITY-013's own attribute list has no pallet_ids/material/batch/quantity
// fields at all (unlike Receiving Sheet, which at least models pallet_ids
// as an uncontracted array) - "Material Details (table)" and "Pallet-wise
// loading sequence" are described only in the flow document's own Step 3
// prose. Same translation already applied elsewhere (receiving_sheet_pallets,
// pallet_batches, hold_pallets): a real junction/child table, not invented
// business logic - one row per pallet picked onto this loading sheet.
// fifo_override_reason is INV-010's own "logged override with reason",
// attached to the specific pick it applies to rather than the whole sheet.
export const loadingSheetPallets = sqliteTable(
  "loading_sheet_pallets",
  {
    id: text("id").primaryKey(),
    loadingSheetId: text("loading_sheet_id")
      .notNull()
      .references(() => loadingSheets.id),
    palletId: text("pallet_id")
      .notNull()
      .references(() => pallets.id),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id),
    batchId: text("batch_id")
      .notNull()
      .references(() => batches.id),
    cartonQty: integer("carton_qty").notNull(),
    weightKg: real("weight_kg").notNull(),
    loadingSequence: integer("loading_sequence").notNull(),
    fifoOverrideReason: text("fifo_override_reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    sequencePositiveCheck: check("loading_sheet_pallets_sequence_positive_check", sql`${table.loadingSequence} >= 1`),
    loadingSheetPalletUnique: uniqueIndex("loading_sheet_pallets_sheet_pallet_unique").on(
      table.loadingSheetId,
      table.palletId
    ),
  })
);

// Loop 43 / TASK-009 (Inter-Warehouse Transfers, Flow 4). Transcribed
// field-for-field from ENTITY-012 - same as loading_sheet before it, this
// entity has no material/batch/pallet/quantity field of its own, so
// transfer_order_pallets is the same disclosed junction-table translation
// already applied to loading_sheet_pallets/receiving_sheet_pallets/
// pallet_batches/hold_pallets (see PEN-014's own precedent, and PEN-041
// in docs/PENDING_ITEMS.md for the full reasoning specific to this task).
export const transferOrders = sqliteTable(
  "transfer_orders",
  {
    id: text("id").primaryKey(),
    transferNumber: text("transfer_number").notNull().unique(),
    sourceWarehouseId: text("source_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    destinationWarehouseId: text("destination_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    transferType: text("transfer_type").notNull(),
    vehicleNumber: text("vehicle_number"),
    driverName: text("driver_name"),
    transporter: text("transporter"),
    temperatureC: real("temperature_c"),
    lrNumber: text("lr_number"),
    status: text("status").notNull().default("DRAFT"),
    initiatedById: text("initiated_by_id").references(() => users.id),
    receivedById: text("received_by_id").references(() => users.id),
    dispatchedAt: text("dispatched_at"),
    receivedAt: text("received_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    transferTypeCheck: check(
      "transfer_orders_transfer_type_check",
      sql`${table.transferType} IN ('NORMAL','HOLD_TAG','BULK_TAG')`
    ),
    statusCheck: check(
      "transfer_orders_status_check",
      // Fully contracted, transcribed exactly from workflows.yaml's own
      // transfer_order_status states - unlike loading_sheet_status, this
      // one already lists every state (including CANCELLED) with no gap.
      sql`${table.status} IN ('DRAFT','PICKED','LOADED','IN_TRANSIT','RECEIVED','COMPLETED','CANCELLED')`
    ),
    sourceDestDifferentCheck: check(
      "transfer_orders_source_dest_different_check",
      sql`${table.sourceWarehouseId} != ${table.destinationWarehouseId}`
    ),
  })
);

export const transferOrderPallets = sqliteTable(
  "transfer_order_pallets",
  {
    id: text("id").primaryKey(),
    transferOrderId: text("transfer_order_id")
      .notNull()
      .references(() => transferOrders.id),
    palletId: text("pallet_id")
      .notNull()
      .references(() => pallets.id),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id),
    batchId: text("batch_id")
      .notNull()
      .references(() => batches.id),
    cartonQty: integer("carton_qty").notNull(),
    weightKg: real("weight_kg").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    transferOrderPalletUnique: uniqueIndex("transfer_order_pallets_order_pallet_unique").on(
      table.transferOrderId,
      table.palletId
    ),
  })
);
