# Proposed Machine-Readable Contracts for PEN-014 (Loop 12 — BLOCKED)

## Stop condition hit this loop

Loop 12's objective was to add formal contract entries for the highest-priority uncontracted entities directly into the machine-readable contract folder. Attempting to create even one new file there was denied:

```
MONARCH HARNESS: destructive or protected project-artifact mutation is blocked.
Use the controlled human-approved change process.
```

The contract folder as a whole is one of this repository's hardcoded protected-path prefixes (same mechanism that blocked the SKFG wording correction in Loop 1 / PEN-012). This is not a false positive this time - the contract folder is *supposed* to be protected, and I have not attempted to route around it, weaken it, or disable it, per governance rule A.3 and the mandatory stop condition for protected-artifact mutation.

**This blocks the literal objective of Loops 12 and 13 as originally planned** (adding new files under the contract folder), and by extension blocks Loop 18's "core receiving/stock workflow," since every uncontracted entity (Receiving Sheet, Hold Record, Loading Sheet, etc.) that a real workflow would touch still has no formal contract to implement against. Per the priority rules, I am not inventing workflow logic against uncontracted entities to fill this gap.

**What this loop delivers instead:** the exact proposed contract content below, derived only from the architecture blueprint's already-locked attribute tables (Section 2.2) - nothing invented - ready for Alpesh (or an explicit, separately-approved exception process) to drop into the contract folder verbatim. Nothing below has been applied to any protected file.

## Proposed: Warehouse Master (ENTITY-006)

```yaml
warehouse_master:
  id: ENTITY-006
  table: warehouses
  purpose: Own and third-party warehouse locations
  authority: BUSINESS
  attributes:
    - name: code
      type: text
      unique: true
      required: true
      editable_by: [R12]
    - name: name
      type: text
      required: true
      editable_by: [R12]
    - name: type
      type: text
      check_constraint: "type IN ('OWN', '3PL', 'CROSS_PLANT')"
      required: true
      editable_by: [R12]
    - name: plant
      type: text
      check_constraint: "plant IN ('LIMBASI', 'SABARKANTHA', 'PATAN')"
      required: true
      editable_by: [R12]
    - name: sap_code
      type: text
      required: true
      editable_by: [R12]
    - name: address
      type: text
      required: false
      editable_by: [R12]
    - name: location_structure
      type: text
      check_constraint: "location_structure IN ('RACK', 'FLAT')"
      required: true
      editable_by: [R12]
    - name: active
      type: integer
      default: 1
      editable_by: [R12]
```

## Proposed: SAP Warehouse Master (ENTITY-007)

```yaml
sap_warehouse_master:
  id: ENTITY-007
  table: sap_codes
  purpose: Reference data - 110-code SAP storage location master (Appendix D of the flow document); 44 are FG-relevant
  authority: BUSINESS
  attributes:
    - name: sap_code
      type: text
      unique: true
      required: true
    - name: sap_name
      type: text
      required: true
    - name: plant
      type: text
      required: true
    - name: type
      type: text
      check_constraint: "type IN ('STATUS', '3PL', 'CROSS_PLANT', 'OTHER')"
      required: true
    - name: module_status_mapping
      type: text
      required: true
    - name: fg_relevant
      type: integer
      required: true
  invariants:
    - "Source: Appendix D of the canonical flow document - 110 codes total, 44 marked fg_relevant for this module's v1 scope"
```

## Proposed: Status Master (ENTITY-008)

```yaml
status_master:
  id: ENTITY-008
  table: statuses
  purpose: Fixed 10-value status vocabulary - replaces the free-text DSR remark column
  authority: BUSINESS
  locked: true
  attributes:
    - name: code
      type: text
      unique: true
      required: true
      check_constraint: "code IN ('QC_HOLD','OK','HOLD','BULK','DISPATCHED','IN_TRANSIT','CUSTOMER_SAMPLE','SAMPLE','REJECTED','SCRAP')"
    - name: description
      type: text
      required: true
    - name: dispatchable
      type: integer
      required: true
    - name: transferable
      type: integer
      required: true
    - name: sap_limbasi
      type: text
      required: true
    - name: sap_sabarkantha
      type: text
      required: false
  invariants:
    - "INV-014: status values are FIXED, no free text"
    - "dispatchable flag is the hard-block enforcement point for loading sheet generation (INV-001 to INV-004)"
```

## Proposed: Pallet-Batch (ENTITY-004, junction table)

```yaml
pallet_batch:
  id: ENTITY-004
  table: pallet_batches
  purpose: Junction table - supports multiple batches of the SAME material on one pallet
  authority: BUSINESS
  attributes:
    - name: pallet_id
      type: text
      references: pallets
      required: true
    - name: batch_id
      type: text
      references: batches
      required: true
    - name: carton_qty
      type: integer
      required: true
    - name: weight_kg
      type: real
      required: true
  invariants:
    - "All batches on a pallet must belong to the SAME material as the pallet (INV-006 extension)"
    - "Sum of all pallet-batch weights on one pallet must not exceed the material's pallet_weight_limit_kg (INV-007)"
```

## Loop 30 update: the remaining 6 entities are now drafted too

Alpesh confirmed (Loop 30) he will apply this himself, outside Claude Code. Since a human has to do the paste either way, drafting all 10 missing entities now - not just the 4 above - means one paste instead of two. Everything below is transcribed only from the architecture blueprint's already-locked Section 2.2 attribute tables (ENTITY-009 through ENTITY-014); nothing invented. One small, disclosed translation decision was needed because SQL/Drizzle cannot represent an `array[FK]` column the way the blueprint's prose does - see the note under Hold Record below.

## Proposed: Receiving Sheet (ENTITY-009)

```yaml
receiving_sheet:
  id: ENTITY-009
  table: receiving_sheets
  purpose: Inward slip - one sheet per material + batch + shift + line, dual-confirmed by Packing and Warehouse before locking
  authority: BUSINESS
  attributes:
    - name: sheet_number
      type: text
      unique: true
      required: true
      description: "auto-generated, format RS-YYYY-MMDD-NNN"
    - name: date
      type: text
      required: true
      editable_by: [R01]
    - name: shift
      type: text
      check_constraint: "shift IN ('A', 'B', 'C')"
      required: true
      editable_by: [R01]
    - name: line
      type: text
      check_constraint: "line IN ('FF', 'SPECIALITY')"
      required: true
      editable_by: [R01]
    - name: material_id
      type: text
      references: materials
      required: true
      editable_by: [R01]
    - name: batch_number
      type: text
      required: true
      editable_by: [R01]
    - name: total_qty
      type: integer
      required: true
      description: "system auto-calculated from the sheet's own pallet rows"
    - name: total_boxes
      type: integer
      required: true
      description: "system auto-calculated"
    - name: packing_supervisor_id
      type: text
      references: users
      required: false
      editable_by: [R06]
    - name: packing_operator_id
      type: text
      references: users
      required: false
      editable_by: [R07]
    - name: warehouse_executive_id
      type: text
      references: users
      required: false
      editable_by: [R01]
    - name: warehouse_operator_id
      type: text
      references: users
      required: false
      editable_by: [R02]
    - name: packing_confirmed_at
      type: text
      required: false
    - name: warehouse_confirmed_at
      type: text
      required: false
    - name: status
      type: text
      check_constraint: "status IN ('DRAFT', 'PENDING_PACKING', 'PENDING_WAREHOUSE', 'LOCKED')"
      required: true
    - name: default_pallet_status
      type: text
      check_constraint: "default_pallet_status IN ('QC_HOLD', 'BULK')"
      required: true
  invariants:
    - "Once both Packing and Warehouse sides confirm, status becomes LOCKED and the sheet is immutable - NS-006"
    - "One sheet = one material + one batch + one shift + one line"
    - "A discrepancy (damaged/bulging/short) must be recorded before lock"
    - "Duplicate sheet (same material+batch+shift) must be rejected - NS-012"
```

## Proposed: Receiving Sheet Pallet (ENTITY-010, child of Receiving Sheet)

```yaml
receiving_sheet_pallet:
  id: ENTITY-010
  table: receiving_sheet_pallets
  purpose: Child rows of a Receiving Sheet - one row per physical pallet received on that sheet
  authority: BUSINESS
  attributes:
    - name: receiving_sheet_id
      type: text
      references: receiving_sheets
      required: true
    - name: sr_no
      type: integer
      required: true
      description: "sequential 1-35 within one receiving sheet - see NS-019"
    - name: pallet_number
      type: text
      required: true
      description: "the physical slip number"
    - name: qty
      type: integer
      required: true
      description: "carton count"
    - name: receiving_time
      type: text
      required: true
    - name: carton_condition
      type: text
      check_constraint: "carton_condition IN ('OK', 'BULGING', 'DAMAGED', 'WET', 'SHORT_QUANTITY', 'OTHER')"
      required: true
    - name: temperature_c
      type: real
      required: false
    - name: remarks
      type: text
      required: false
      description: "mandatory in the application layer if carton_condition is not OK"
  invariants:
    - "A receiving sheet may not have more than 35 pallet rows - NS-019"
```

## Proposed: Hold Record (ENTITY-011)

```yaml
hold_record:
  id: ENTITY-011
  table: hold_records
  purpose: QC hold placed on one or more pallets of one material+batch, with a fixed-vocabulary reason and a release workflow
  authority: BUSINESS
  attributes:
    - name: hold_number
      type: text
      unique: true
      required: true
      description: "auto-generated, format HOLD-YYYY-MMDD-NNN"
    - name: material_id
      type: text
      references: materials
      required: true
    - name: batch_id
      type: text
      references: batches
      required: true
    - name: hold_reason
      type: text
      check_constraint: "hold_reason IN ('High Temperature', 'Metal piece found (repass needed)', 'Thread contamination', 'Enzyme test positive', 'Uneven coating / Belt mark', 'High defects / Major defects', 'Dull appearance and color difference', 'Short length', 'Black particles', 'White patches on product surface', 'Wrong batch code printed', 'Batter bubbles', 'Product carton not available', 'Low retention time', 'Bad smell in product', 'Misshapes', 'Over-production (bulk)', 'Defective fries (bulk)', 'Trial / Sample', 'Other')"
      required: true
      description: "FIXED dropdown, no free text - transcribed verbatim from the canonical flow document's 20-item list"
    - name: custom_reason
      type: text
      required: false
      description: "required only when hold_reason = 'Other'"
    - name: placed_by_id
      type: text
      references: users
      required: true
    - name: placed_by_department
      type: text
      required: true
    - name: placed_at
      type: text
      required: true
    - name: released_by_id
      type: text
      references: users
      required: false
    - name: released_at
      type: text
      required: false
    - name: release_remarks
      type: text
      required: false
    - name: status
      type: text
      check_constraint: "status IN ('ACTIVE', 'RELEASED', 'REJECTED')"
      required: true
    - name: qc_followup_count
      type: integer
      required: true
      default: 0
    - name: last_followup_at
      type: text
      required: false
  invariants:
    - "Only R04/R05 (QC) may release a hold - NS-003"
    - "custom_reason is required when hold_reason is 'Other'"
```

**Translation note (disclosed, not invented):** the blueprint's own ENTITY-011 table lists `pallet_ids: array[FK]` as one field - SQLite/Drizzle cannot represent a multi-value FK array as a plain column, so this needs the standard relational translation, a junction table. Not separately numbered in the blueprint (it names no entity ID for it), so proposed here as an extension of ENTITY-011 rather than a new top-level entity number:

```yaml
hold_pallet:
  id: ENTITY-011-PALLETS
  table: hold_pallets
  purpose: "Junction table implementing ENTITY-011's own pallet_ids field - one Hold Record may cover multiple pallets"
  authority: BUSINESS
  attributes:
    - name: hold_record_id
      type: text
      references: hold_records
      required: true
    - name: pallet_id
      type: text
      references: pallets
      required: true
```

## Proposed: Transfer Order (ENTITY-012)

```yaml
transfer_order:
  id: ENTITY-012
  table: transfer_orders
  purpose: Inter-warehouse/3PL stock transfer, including HOLD-tagged and BULK-tagged transfers
  authority: BUSINESS
  attributes:
    - name: transfer_number
      type: text
      unique: true
      required: true
      description: "auto-generated, format TO-YYYY-MMDD-NNN"
    - name: source_warehouse_id
      type: text
      references: warehouses
      required: true
    - name: destination_warehouse_id
      type: text
      references: warehouses
      required: true
    - name: transfer_type
      type: text
      check_constraint: "transfer_type IN ('NORMAL', 'HOLD_TAG', 'BULK_TAG')"
      required: true
    - name: vehicle_number
      type: text
      required: true
    - name: driver_name
      type: text
      required: true
    - name: transporter
      type: text
      required: false
    - name: temperature_c
      type: real
      required: false
    - name: lr_number
      type: text
      required: false
    - name: status
      type: text
      check_constraint: "status IN ('DRAFT', 'PICKED', 'LOADED', 'IN_TRANSIT', 'RECEIVED', 'COMPLETED', 'CANCELLED')"
      required: true
    - name: initiated_by_id
      type: text
      references: users
      required: true
    - name: received_by_id
      type: text
      references: users
      required: false
    - name: dispatched_at
      type: text
      required: false
    - name: received_at
      type: text
      required: false
```

## Proposed: Loading Sheet (ENTITY-013)

```yaml
loading_sheet:
  id: ENTITY-013
  table: loading_sheets
  purpose: Dispatch loading/gate-pass record, export or domestic
  authority: BUSINESS
  attributes:
    - name: loading_sheet_number
      type: text
      unique: true
      required: true
      description: "auto-generated, format LS-YYYY-MMDD-NNN"
    - name: date
      type: text
      required: true
    - name: vehicle_number
      type: text
      required: true
    - name: driver_name
      type: text
      required: true
    - name: transporter
      type: text
      required: false
    - name: party_name
      type: text
      required: true
    - name: destination
      type: text
      required: true
    - name: export_domestic
      type: text
      check_constraint: "export_domestic IN ('EXPORT', 'DOMESTIC')"
      required: true
    - name: temperature_c
      type: real
      required: true
    - name: qc_approval_by_id
      type: text
      references: users
      required: false
      description: "required only when export_domestic = EXPORT - NS-013"
    - name: qc_approval_at
      type: text
      required: false
    - name: container_number
      type: text
      required: false
      description: "required only when export_domestic = EXPORT"
    - name: seal_number
      type: text
      required: false
      description: "required only when export_domestic = EXPORT"
    - name: bolt_number
      type: text
      required: false
      description: "required only when export_domestic = EXPORT"
    - name: gate_pass_number
      type: text
      required: true
    - name: gate_pass_time
      type: text
      required: true
    - name: loaded_by_id
      type: text
      references: users
      required: true
    - name: verified_by_id
      type: text
      references: users
      required: true
    - name: status
      type: text
      check_constraint: "status IN ('DRAFT', 'STAGING', 'LOADED', 'VERIFIED', 'GATE_PASSED', 'DISPATCHED')"
      required: true
  invariants:
    - "Export loading requires QC approval before gate pass - NS-013"
    - "A DISPATCHED loading sheet is immutable - NS-020"
    - "A gate pass requires a linked loading sheet - NS-009"
```

## Proposed: Maintenance Ticket (ENTITY-014)

```yaml
maintenance_ticket:
  id: ENTITY-014
  table: maintenance_tickets
  purpose: Facility maintenance issue tracking with severity-based escalation
  authority: BUSINESS
  attributes:
    - name: ticket_number
      type: text
      unique: true
      required: true
      description: "auto-generated, format MT-YYYY-MMDD-NNN"
    - name: category
      type: text
      check_constraint: "category IN ('DOOR', 'FORKLIFT', 'RACKING', 'ELECTRICAL', 'REFRIGERATION', 'PPE', 'OTHER')"
      required: true
    - name: location
      type: text
      required: true
    - name: description
      type: text
      required: true
    - name: severity
      type: text
      check_constraint: "severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')"
      required: true
    - name: status
      type: text
      check_constraint: "status IN ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED')"
      required: true
    - name: raised_by_id
      type: text
      references: users
      required: true
    - name: acknowledged_by_id
      type: text
      references: users
      required: false
    - name: resolved_by_id
      type: text
      references: users
      required: false
    - name: resolution_notes
      type: text
      required: false
      description: "required in the application layer when status moves to RESOLVED"
    - name: parts_used
      type: text
      required: false
    - name: acknowledged_at
      type: text
      required: false
    - name: resolved_at
      type: text
      required: false
    - name: closed_at
      type: text
      required: false
```

## How to apply this (Alpesh, outside Claude Code)

All 10 blocks above (4 from Loop 12 + 6 from Loop 30) are written pre-indented to paste directly under the existing top-level entities key. To apply:

1. Open the domain entities contract file directly (inside the protected contract folder) - not through Claude Code.
2. Go to the end of the file - the last block there today is `user:` (ENTITY-016).
3. Paste all 10 YAML blocks above, in order, right after the `user:` block - each one starts at the same 2-space indent as `user:` itself, so they nest correctly under the file's own top-level entities key. Do not paste the code-fence markers themselves, only the content between them.
4. Save. No other file needs to change for this step - the permission matrix and workflow contract files are separate, later gaps (see the pending items log).
5. Tell Claude Code once this is done - the next loop verifies the file parses correctly (the same lexical guard check already run every loop) and starts building against it.
