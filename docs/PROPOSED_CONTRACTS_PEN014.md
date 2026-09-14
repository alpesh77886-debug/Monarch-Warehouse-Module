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

## Not proposed this loop (deferred to a later contract-completion loop)

Receiving Sheet, Receiving Sheet Pallet, Hold Record, Transfer Order, Loading Sheet, and Maintenance Ticket are the 6 remaining uncontracted entities. They are workflow/transactional entities that build on the 4 reference entities proposed above, so drafting them productively depends on these being reviewed and applied first. Deferred, not skipped - tracked under the same PEN-014.
