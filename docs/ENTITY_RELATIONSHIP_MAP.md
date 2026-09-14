# Entity Relationship Map (Loop 5)

Prepared before any schema code, per the architecture blueprint's 16-entity domain model (Section 2) and the locked entity relationship overview it defines. This is documentation only - no Drizzle code in this loop.

## Finding to record: contract-file coverage gap

The architecture blueprint fully specifies 16 entities (ENTITY-001 through ENTITY-016). The machine-readable entities contract file, however, currently only formally defines **6 of those 16** with attribute-level validation (types, required flags, check constraints, regex):

| Has a formal YAML contract | Architecture-blueprint-only (prose, no YAML contract yet) |
|---|---|
| ENTITY-001 Material Master | ENTITY-004 Pallet-Batch (junction) |
| ENTITY-002 Batch | ENTITY-006 Warehouse Master |
| ENTITY-003 Pallet | ENTITY-007 SAP Warehouse Master |
| ENTITY-005 Location | ENTITY-008 Status Master |
| ENTITY-015 Stock Ledger | ENTITY-009 Receiving Sheet |
| ENTITY-016 User/Role | ENTITY-010 Receiving Sheet Pallet |
| | ENTITY-011 Hold Record |
| | ENTITY-012 Transfer Order |
| | ENTITY-013 Loading Sheet |
| | ENTITY-014 Maintenance Ticket |

This is recorded rather than silently worked around. It does not block Loop 6: the "core slice" that loop already targets (materials, batches, pallets, locations, statuses, users, ledger) is exactly the set that already has a formal contract, so Loop 6 can proceed on solid ground without inventing validation rules for the other 10. Those 10 will need their own formal contract entries before the tasks that implement them (receiving sheet, holds, transfers, loading sheets, maintenance) begin.

## Relationship map (from the architecture blueprint's entity relationship overview)

```
MATERIAL_MASTER ──1:N──> BATCH ──1:N──> PALLET ──1:1──> LOCATION
      │                    │            │
      │                    │            ├──1:N──> PALLET_BATCH (multiple batches per pallet)
      │                    │            ├──1:N──> STATUS_HISTORY
      │                    │            └──1:N──> LOCATION_HISTORY (moves)
      │                    └── tracked across WAREHOUSE_MASTER
WAREHOUSE_MASTER ──1:N──> LOCATION ── linked to SAP_WAREHOUSE_MASTER

RECEIVING_SHEET ──1:N──> PALLET (creates pallets)
TRANSFER_ORDER  ──1:N──> PALLET (moves pallets)
LOADING_SHEET   ──1:N──> PALLET (dispatches pallets)
HOLD_RECORD     ──1:N──> PALLET (holds pallets)
MAINTENANCE_TICKET (standalone, linked to a location)
STOCK_LEDGER (append-only transaction log; references material, batch,
              pallet, location, warehouse, user, and the originating
              receiving sheet / transfer order / loading sheet / hold
              record via reference_type + reference_id)
```

## Cardinality and foreign-key notes for the Loop 6 core slice

| Entity | Key relationships | FK direction |
|---|---|---|
| Material Master | 1 material -> many batches; 1 material -> many pallets (denormalized for lookup) | referenced by |
| Batch | 1 batch -> 1 material; 1 batch -> many pallet-batch rows | `material_id` -> Material Master |
| Pallet | 1 pallet -> 1 material (hard invariant, no mixing); 1 pallet -> 0..1 current location; 1 pallet -> many batches via the junction table | `material_id` -> Material Master, `current_location_id` -> Location, `current_warehouse_id` -> Warehouse Master |
| Location | 1 location -> 0..1 current pallet (or partial/shared for same-material multi-batch cases) | `warehouse_id` -> Warehouse Master, `current_pallet_id` -> Pallet |
| Stock Ledger | every row references exactly one material, batch, pallet, warehouse, and user; append-only, never updated in place | references Material Master, Batch, Pallet, Warehouse Master, User |
| User | referenced as an actor by every other entity's audit fields | referenced by all |

## What this unblocks

Loop 6 can now implement the six contract-defined entities' Drizzle schema directly against this map without inventing any relationship, cardinality, or constraint that isn't already either in the entities contract file or the architecture blueprint's own entity relationship overview.
