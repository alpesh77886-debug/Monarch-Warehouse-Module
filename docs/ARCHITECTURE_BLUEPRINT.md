# IBF FG WAREHOUSE MODULE — DIGITAL APPLICATION ARCHITECTURE BLUEPRINT
## Version 1.0 — Architecture Freeze Candidate
### For: Claude Code (Implementation Agent) + Human Reviewer (Alpesh Parmar)
### Source of Truth: IBF_FG_Warehouse_Flow_Document_v3_FINAL_Complete.md

---

## DOCUMENT AUTHORITY

| Field | Value |
|-------|-------|
| Project | Iscon Balaji Foods — FG Warehouse Module |
| Owner | Alpesh Parmar (alpesh77886@gmail.com) |
| Source Document | IBF_FG_Warehouse_Flow_Document_v3_FINAL_Complete.md (v3.0 FINAL) |
| Blueprint Version | 1.0 |
| Status | ARCHITECTURE FREEZE CANDIDATE — awaiting human approval |
| Plant | Limbasi (primary) + Sabarkantha/Himmatnagar + 3PL locations |

---

## TABLE OF CONTENTS

1. Product Architecture
2. Domain Model & Entities
3. Information Architecture & Navigation
4. Screen Inventory & Wireframes
5. User Journeys
6. Workflow / State Machine Model
7. Role & Permission Matrix
8. Data Lineage
9. API Contract
10. Dashboard Specification
11. Design System
12. Responsive / Mobile Specification
13. Security Specification
14. Performance Specification
15. Observability Specification
16. Invariant Register
17. Evaluation Plan
18. Golden Scenarios
19. Negative Tests
20. Decision Register
21. Pending Items
22. Definition of Done

---

## 1. PRODUCT ARCHITECTURE

### 1.1 Product Mission

Replace WhatsApp + paper + Excel-based FG warehouse operations at Iscon Balaji Foods with a single digital system that enforces business rules, eliminates disputes, tracks holds, and provides real-time stock visibility across all warehouses including 3PL locations.

### 1.2 Application Areas (Floors of the Digital Building)

```
┌─────────────────────────────────────────────────────────────┐
│                    IBF FG WAREHOUSE MODULE                   │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  INWARD      │  STORAGE     │  OUTWARD     │  ADMIN         │
│  (Receiving) │  (Putaway,   │  (Dispatch,  │  (Masters,     │
│              │   Hold, Move,│   Transfer,  │   Users,       │
│              │   Bulk)      │   Loading)   │   Reports)     │
├──────────────┼──────────────┼──────────────┼────────────────┤
│  Receiving   │  Rack Map    │  Dispatch    │  Material Master│
│  Sheet       │  Putaway     │  Order       │  Warehouse     │
│              │  Hold Mgmt   │  Pick List   │  Master        │
│              │  Bulk Mgmt   │  Loading Sht │  User/Role     │
│              │  Move Ops    │  Gate Pass   │  Status Master │
│              │  Cycle Count │  Transfer    │  SAP Codes     │
├──────────────┼──────────────┼──────────────┼────────────────┤
│           DASHBOARD (Warehouse Incharge)                     │
│     Stock | Hold | Bulk | QC | Dispatch | Transfer | Maint   │
├─────────────────────────────────────────────────────────────┤
│           STOCK LEDGER (DSR replacement)                     │
│     Every transaction: inward, move, hold, dispatch, transfer│
├─────────────────────────────────────────────────────────────┤
│           MAINTENANCE MODULE (integrated)                    │
│     Issue → Acknowledge → Resolve → Verify → Close           │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 User Roles

| Role ID | Role Name | Primary Function | Team |
|---------|-----------|-----------------|------|
| R01 | Warehouse Executive | Receives FG, confirms sheets, manages putaway | IBF Warehouse |
| R02 | Warehouse Operator | Physical operations, location confirmations | IBF Warehouse |
| R03 | Warehouse Incharge | Full dashboard, approvals, overrides | IBF Warehouse |
| R04 | QC Lab Officer | Inspects, holds, releases, rejects | IBF QC LAB |
| R05 | QC Head | Escalation, bulk release authority | IBF QC LAB |
| R06 | Packing Supervisor | Confirms receiving sheets (packing side) | Packing |
| R07 | Packing Operator | Confirms receiving sheets (packing side) | Packing |
| R08 | Production Executive | Hold acknowledgments, re-inspection requests | FF/Speciality Production |
| R09 | Logistics Coordinator | Dispatch orders, transfers, vehicle coordination | Logistics |
| R10 | Security/Gate | Gate pass verification | Security |
| R11 | Maintenance Technician | Issue resolution | Maintenance |
| R12 | Admin | Master data, user management, system config | IT/Admin |

### 1.4 Technology Stack (APPROVED by Alpesh)

**Status: LOCKED — approved by Alpesh on 2026-09-13**

Alpesh has chosen Cloudflare D1 + Clerk as the backend stack. This is a cost-effective, serverless, edge-deployed solution that requires no server management.

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14+ (App Router, TypeScript, React) | UI, pages, components, cold-storage-friendly |
| Backend | Next.js API Routes (Edge Runtime) | API endpoints, business logic |
| Database | Cloudflare D1 (serverless SQLite) | All data — materials, pallets, locations, transactions, stock ledger |
| ORM | Drizzle ORM (drizzle-orm/d1) | TypeScript database queries, type-safe, D1 native support |
| Auth | Clerk | Login, logout, user management, roles (R01-R12), session management |
| File Storage | Cloudflare R2 | Photo uploads (future), Excel exports, documents — S3-compatible, zero egress fees |
| Hosting | Cloudflare Pages | Frontend + API deployed on Cloudflare global edge (Mumbai node = fast for India) |
| Charts | Recharts | Dashboard visualizations |
| Export | SheetJS (Excel) | DSR format Excel export |
| Offline | PWA + Service Worker (deferred) | Cold storage connectivity resilience |
| Testing | Vitest + React Testing Library + Playwright | Unit, integration, E2E tests |
| Styling | Tailwind CSS | Responsive design |

### 1.4.1 Backend Architecture — Kya Kahan Save Hota Hai

```
USER (browser/tablet, warehouse floor -18C)
  | HTTPS
  v
Cloudflare Pages (Edge Runtime)
  |
  |-- Clerk Auth: login/logout, user mgmt, roles R01-R12, sessions
  |
  |-- Next.js API Routes (Edge):
  |     /api/receiving-sheets, /api/pallets, /api/holds,
  |     /api/loading-sheets, /api/transfers, /api/stock/*,
  |     /api/maintenance, /api/masters/*
  |
  |-- Drizzle ORM (type-safe queries)
  |
  +---> Cloudflare D1 (SQLite database)
  |       tables: materials, batches, pallets, pallet_batches,
  |       locations, receiving_sheets, hold_records,
  |       loading_sheets, transfer_orders, maintenance_tickets,
  |       stock_ledger (APPEND-ONLY), users, statuses, warehouses
  |
  +---> Cloudflare R2 (file storage, S3-compatible)
          /exports/DSR_2026-09.xlsx        (Excel exports)
          /photos/receiving/RS-.../        (future: dispute photos)
          /documents/loading-sheets/LS-... (documents)
```

**Data Flow Summary:**
1. **Login/Logout:** Clerk handles entirely — user enters credentials on Clerk-hosted page, Clerk validates, JWT token issued, token sent with every API request, API verifies via Clerk middleware
2. **Data Storage:** All business data lives in Cloudflare D1 (serverless SQLite) — accessed via Drizzle ORM
3. **File Uploads:** Files go to Cloudflare R2 — the R2 URL is stored in D1 as reference
4. **Hosting:** Everything on Cloudflare Pages — no server needed

---

## 2. DOMAIN MODEL & ENTITIES

### 2.1 Entity Relationship Overview

```
MATERIAL_MASTER ──1:N──> BATCH ──1:N──> PALLET ──1:1──> LOCATION
      │                    │            │
      │                    │            ├──1:N──> PALLET_BATCH (multiple batches per pallet)
      │                    │            │
      │                    │            ├──1:N──> STATUS_HISTORY
      │                    │            │
      │                    │            └──1:N──> LOCATION_HISTORY (moves)
      │                    │
      │                    └── tracked across WAREHOUSE_MASTER
      │
WAREHOUSE_MASTER ──1:N──> LOCATION
      │
      └── linked to SAP_WAREHOUSE_MASTER

RECEIVING_SHEET ──1:N──> PALLET (creates pallets)
TRANSFER_ORDER ──1:N──> PALLET (moves pallets)
LOADING_SHEET ──1:N──> PALLET (dispatches pallets)
HOLD_RECORD ──1:N──> PALLET (holds pallets)
MAINTENANCE_TICKET (standalone, linked to location)
STOCK_LEDGER (append-only transaction log)
```

### 2.2 Core Entity Definitions

#### ENTITY-001: Material Master

| Attribute | Type | Required | Source | Editable By |
|-----------|------|----------|--------|-------------|
| id | UUID | yes | system | - |
| code | string (unique) | yes | admin entry | R12 |
| description | string | yes | admin entry | R12 |
| uom_kg_per_carton | decimal | yes | admin entry | R12 |
| category | string | yes | admin entry | R12 |
| pallet_weight_limit_kg | decimal | yes | admin entry | R12 |
| pallet_type | enum: CARTON/ROLL/POUCH | yes | admin entry | R12 |
| shelf_life_days | integer | no | admin entry | R12 |
| plant_origin | enum: LIMBASI/SABARKANTHA | yes | derived from code prefix | R12 |
| active | boolean | yes | system | R12 |
| created_at | timestamp | yes | system | - |
| updated_at | timestamp | yes | system | - |

**Invariants:** Code must start with LFG (Limbasi) or SFG/SKFG (Sabarkantha). Code must be unique. Cannot delete a material with active stock — must deactivate.

#### ENTITY-002: Batch

| Attribute | Type | Required | Source | Editable By |
|-----------|------|----------|--------|-------------|
| id | UUID | yes | system | - |
| batch_number | string | yes | manual entry (validated) | R01, R06 |
| material_id | FK → Material | yes | selected | R01 |
| production_date | date | yes | derived from batch_number | system |
| production_line | enum: FF/SPECIALITY | yes | receiving sheet | R01 |
| shift | enum: A/B/C | yes | receiving sheet | R01 |
| created_at | timestamp | yes | system | - |

**Batch Number Format:** `L` + Year(2) + Month(letter: A=Jan...L=Dec) + Day(2) + Sequence(4)
Example: `L26I071249` = 2026, September(I), 07th, sequence 1249

**Invariants:** Batch number must match format regex `^L\d{2}[A-L]\d{2}\d{3,4}$`. One batch = one material. Batch traceability must be preserved across warehouse transfers.

#### ENTITY-003: Pallet

| Attribute | Type | Required | Source | Editable By |
|-----------|------|----------|--------|-------------|
| id | UUID | yes | system | - |
| pallet_number | string | yes | manual entry (slip number) | R01, R02 |
| pallet_type | enum: PLASTIC/WOODEN | yes | manual selection | R01 |
| material_id | FK → Material | yes | derived from batch | R01 |
| current_location_id | FK → Location | no | putaway assignment | R02, R03 |
| status_id | FK → Status | yes | system (auto on receiving) | system |
| total_weight_kg | decimal | yes | calculated (qty × uom) | system |
| total_cartons | integer | yes | sum of pallet_batch entries | system |
| current_warehouse_id | FK → Warehouse | yes | derived from location | system |
| created_at | timestamp | yes | system | - |
| created_by | FK → User | yes | system | - |

**Invariants:** One pallet = one material (HARD BLOCK — system rejects mixed-material pallet). Pallet may have multiple batches of the SAME material. Pallet weight must not exceed material's pallet_weight_limit_kg (HARD BLOCK).

#### ENTITY-004: Pallet-Batch (junction — supports multiple batches per pallet)

| Attribute | Type | Required |
|-----------|------|----------|
| id | UUID | yes |
| pallet_id | FK → Pallet | yes |
| batch_id | FK → Batch | yes |
| carton_qty | integer | yes |
| weight_kg | decimal | yes (calculated: qty × uom) |

**Invariants:** All batches on a pallet must belong to the SAME material. Sum of all pallet-batch weights must not exceed pallet_weight_limit_kg.

#### ENTITY-005: Location

| Attribute | Type | Required | Source |
|-----------|------|----------|--------|--------|
| id | UUID | yes | system | - |
| warehouse_id | FK → Warehouse | yes | admin config |
| cold_room | enum: CR1/CR2/FLOOR/NA | yes | admin config |
| block | string (01-36) | no | admin config |
| position | string (A-E) | no | admin config |
| floor | integer (1-5) | no | admin config |
| full_code | string (e.g., CR1-01-A-4) | yes | auto-generated |
| capacity_pallets | integer | yes (default 1) | admin config |
| current_pallet_id | FK → Pallet | no | system |
| status | enum: EMPTY/OCCUPIED/PARTIAL/BLOCKED | yes | system |
| created_at | timestamp | yes | system |

**Invariants:** Each floor position holds one pallet (unless partial — same material). Location code format is hierarchical. 3PL locations may have flat structure (no block/position/floor).

#### ENTITY-006: Warehouse Master

| Attribute | Type | Required | Source |
|-----------|------|----------|--------|--------|
| id | UUID | yes | system | - |
| code | string (unique) | yes | admin entry |
| name | string | yes | admin entry |
| type | enum: OWN/3PL/CROSS_PLANT | yes | admin entry |
| plant | enum: LIMBASI/SABARKANTHA/PATAN | yes | admin entry |
| sap_code | string | yes | from SAP master |
| address | text | no | admin entry |
| location_structure | enum: RACK/FLAT | yes | admin entry |
| active | boolean | yes | system |
| created_at | timestamp | yes | system |

#### ENTITY-007: SAP Warehouse Master (reference data)

| Attribute | Type | Required |
|-----------|------|----------|
| sap_code | string (unique) | yes |
| sap_name | string | yes |
| plant | string | yes |
| type | enum: STATUS/3PL/CROSS_PLANT/OTHER | yes |
| module_status_mapping | string | yes |
| fg_relevant | boolean | yes |

**Source:** Appendix D of flow document — 110 codes. All FG-relevant codes (44 total: 20 Limbasi + 24 Sabarkantha) must be pre-loaded as seed data.

#### ENTITY-008: Status Master

| code | description | dispatchable | transferable | sap_limbasi | sap_sabarkantha |
|------|-------------|-------------|-------------|-------------|-----------------|
| QC_HOLD | QC Hold (new inward) | NO | YES | LMFGQ | SKFGQ |
| OK | OK / Available | YES | YES | LMFGA | SKFGA |
| HOLD | Hold | NO | YES (with tag) | LMFGH | SKFGH |
| BULK | Bulk | NO | YES (with tag) | LMFGBULK | SKFGBULK |
| DISPATCHED | Dispatched | N/A | N/A | LMFGD | SKSALES |
| IN_TRANSIT | In Transit | N/A | N/A | LMFGIN | SKGJFGIN |
| CUSTOMER_SAMPLE | Customer Sample | NO | YES | LMFGCS | SKFGCS |
| SAMPLE | Sample | NO | YES | LMFGSMPL | SKFGSMPL |
| REJECTED | Rejected / Grade Out | NO | Conditional | LMGOA | SKGOA |
| SCRAP | Scrap | NO | NO | LMSW | - |

**Invariants:** Status values are FIXED — no free text. dispatchable flag is the HARD BLOCK enforcement point for loading sheet generation.

#### ENTITY-009: Receiving Sheet

| Attribute | Type | Required | Source | Editable By |
|-----------|------|----------|--------|-------------|
| id | UUID | yes | system | - |
| sheet_number | string (unique, auto) | yes | system (RS-YYYY-MMDD-NNN) | - |
| date | date | yes | auto (today), editable | R01 |
| shift | enum: A/B/C | yes | manual | R01 |
| line | enum: FF/SPECIALITY | yes | manual | R01 |
| material_id | FK → Material | yes | search/select | R01 |
| batch_number | string | yes | manual (validated) | R01 |
| total_qty | integer | yes | auto-calculated | system |
| total_boxes | integer | yes | auto-calculated | system |
| packing_supervisor_id | FK → User | no | login + confirm | R06 |
| packing_operator_id | FK → User | no | login + confirm | R07 |
| warehouse_executive_id | FK → User | no | login + confirm | R01 |
| warehouse_operator_id | FK → User | no | login + confirm | R02 |
| packing_confirmed_at | timestamp | no | system | - |
| warehouse_confirmed_at | timestamp | no | system | - |
| status | enum: DRAFT/PENDING_PACKING/PENDING_WAREHOUSE/LOCKED | yes | system | - |
| default_pallet_status | enum: QC_HOLD/BULK | yes | system (auto) | - |
| created_at | timestamp | yes | system | - |

**Invariants:** Once both sides confirm → status = LOCKED (immutable). One sheet = one material + one batch + one shift + one line. Discrepancy (damaged/bulging/short) must be recorded BEFORE lock. Lock = legal document.

#### ENTITY-010: Receiving Sheet Pallet (child of Receiving Sheet)

| Attribute | Type | Required | Notes |
|-----------|------|----------|-------|
| id | UUID | yes | - |
| receiving_sheet_id | FK | yes | - |
| sr_no | integer | yes | sequential 1-35 |
| pallet_number | string | yes | slip number |
| qty | integer | yes | carton count |
| receiving_time | timestamp | yes | auto or manual |
| carton_condition | enum: OK/BULGING/DAMAGED/WET/SHORT_QUANTITY/OTHER | yes | - |
| temperature_c | decimal | no | recommended |
| remarks | string | conditional | mandatory if condition ≠ OK |

#### ENTITY-011: Hold Record

| Attribute | Type | Required | Source |
|-----------|------|----------|--------|
| id | UUID | yes | system |
| hold_number | string (auto) | yes | HOLD-YYYY-MMDD-NNN |
| material_id | FK | yes | selected |
| batch_id | FK | yes | selected |
| pallet_ids | array[FK] | yes | selected |
| hold_reason | enum (fixed dropdown) | yes | selected |
| custom_reason | string | conditional | required if reason = OTHER |
| placed_by_id | FK → User | yes | system |
| placed_by_department | string | yes | system |
| placed_at | timestamp | yes | system |
| released_by_id | FK → User | no | system |
| released_at | timestamp | no | system |
| release_remarks | string | no | manual |
| status | enum: ACTIVE/RELEASED/REJECTED | yes | system |
| qc_followup_count | integer | yes | system |
| last_followup_at | timestamp | no | system |

**Hold Reason Enum (FIXED — no free text):**
1. High Temperature
2. Metal piece found (repass needed)
3. Thread contamination
4. Enzyme test positive
5. Uneven coating / Belt mark
6. High defects / Major defects
7. Dull appearance and color difference
8. Short length
9. Black particles
10. White patches on product surface
11. Wrong batch code printed
12. Batter bubbles
13. Product carton not available
14. Low retention time
15. Bad smell in product
16. Misshapes
17. Over-production (bulk)
18. Defective fries (bulk)
19. Trial / Sample
20. Other (requires supervisor approval)

#### ENTITY-012: Transfer Order

| Attribute | Type | Required |
|-----------|------|----------|
| id | UUID | yes |
| transfer_number | string (auto: TO-YYYY-MMDD-NNN) | yes |
| source_warehouse_id | FK → Warehouse | yes |
| destination_warehouse_id | FK → Warehouse | yes |
| transfer_type | enum: NORMAL/HOLD_TAG/BULK_TAG | yes |
| vehicle_number | string | yes |
| driver_name | string | yes |
| transporter | string | no |
| temperature_c | decimal | no |
| lr_number | string | no |
| status | enum: DRAFT/PICKED/LOADED/IN_TRANSIT/RECEIVED/COMPLETED/CANCELLED | yes |
| initiated_by_id | FK → User | yes |
| received_by_id | FK → User | no |
| dispatched_at | timestamp | no |
| received_at | timestamp | no |
| created_at | timestamp | yes |

#### ENTITY-013: Loading Sheet

| Attribute | Type | Required |
|-----------|------|----------|
| id | UUID | yes |
| loading_sheet_number | string (auto: LS-YYYY-MMDD-NNN) | yes |
| date | date | yes |
| vehicle_number | string | yes |
| driver_name | string | yes |
| transporter | string | no |
| party_name | string | yes |
| destination | string | yes |
| export_domestic | enum: EXPORT/DOMESTIC | yes |
| temperature_c | decimal | yes |
| qc_approval_by_id | FK → User | conditional (export only) |
| qc_approval_at | timestamp | conditional |
| container_number | string | conditional (export only) |
| seal_number | string | conditional (export only) |
| bolt_number | string | conditional (export only) |
| gate_pass_number | string | yes |
| gate_pass_time | timestamp | yes |
| loaded_by_id | FK → User | yes |
| verified_by_id | FK → User | yes |
| status | enum: DRAFT/STAGING/LOADED/VERIFIED/GATE_PASSED/DISPATCHED | yes |
| created_at | timestamp | yes |

#### ENTITY-014: Maintenance Ticket

| Attribute | Type | Required |
|-----------|------|----------|
| id | UUID | yes |
| ticket_number | string (auto: MT-YYYY-MMDD-NNN) | yes |
| category | enum: DOOR/FORKLIFT/RACKING/ELECTRICAL/REFRIGERATION/PPE/OTHER | yes |
| location | string | yes |
| description | text | yes |
| severity | enum: LOW/MEDIUM/HIGH/CRITICAL | yes |
| status | enum: OPEN/ACKNOWLEDGED/IN_PROGRESS/RESOLVED/CLOSED/REOPENED | yes |
| raised_by_id | FK → User | yes |
| acknowledged_by_id | FK → User | no |
| resolved_by_id | FK → User | no |
| resolution_notes | text | conditional (required on resolve) |
| parts_used | string | no |
| created_at | timestamp | yes |
| acknowledged_at | timestamp | no |
| resolved_at | timestamp | no |
| closed_at | timestamp | no |

#### ENTITY-015: Stock Ledger (append-only)

| Attribute | Type | Required |
|-----------|------|----------|
| id | UUID | yes |
| date | date | yes |
| shift | enum: A/B/C/NA | yes |
| transaction_type | enum: INWARD/MOVE/HOLD/RELEASE/DISPATCH/TRANSFER_IN/TRANSFER_OUT/ADJUSTMENT/BULK_SEND/BULK_RECEIVE | yes |
| material_id | FK | yes |
| batch_id | FK | yes |
| pallet_id | FK | yes |
| location_id | FK | no |
| warehouse_id | FK | yes |
| qty_change | integer | yes (can be negative) |
| qty_after | integer | yes |
| weight_change_kg | decimal | yes |
| weight_after_kg | decimal | yes |
| status_before | string | no |
| status_after | string | no |
| reference_type | enum: RECEIVING_SHEET/TRANSFER_ORDER/LOADING_SHEET/HOLD_RECORD/MANUAL_MOVE/CYCLE_COUNT | yes |
| reference_id | UUID | yes |
| user_id | FK → User | yes |
| remarks | string | no |
| created_at | timestamp | yes |

**Invariants:** Append-only. NEVER update or delete a ledger entry. qty_after = running balance. This replaces the DSR Excel SEPT-2026 sheet.

#### ENTITY-016: User/Role

| Attribute | Type | Required |
|-----------|------|----------|
| id | UUID | yes |
| name | string | yes |
| email | string (unique) | yes |
| employee_id | string | no |
| role_id | FK → Role | yes |
| department | string | yes |
| plant | string | yes |
| active | boolean | yes |
| created_at | timestamp | yes |

---

## 3. INFORMATION ARCHITECTURE & NAVIGATION

### 3.1 Navigation Map

```
TOP NAVIGATION BAR (all roles)
├── Dashboard
├── Inward
│   ├── New Receiving Sheet
│   ├── Pending Confirmation Queue
│   └── Receiving Sheet History
├── Storage
│   ├── Rack Map (CR1 / CR2 / 3PL)
│   ├── Putaway Queue
│   ├── Move Operations
│   └── Cycle Count
├── Hold Management
│   ├── Active Holds (dashboard)
│   ├── Place Hold
│   └── Hold History
├── Bulk Management
│   ├── Active Bulk Stock
│   ├── Bulk → Packing Transfer
│   └── Repack Receipt (new receiving sheet)
├── Outward
│   ├── Dispatch Orders
│   ├── Pick List (FIFO)
│   ├── Loading Sheet
│   ├── Gate Pass
│   └── Export Container Approval
├── Transfers
│   ├── New Transfer Order
│   ├── In-Transit
│   └── Transfer History
├── Maintenance
│   ├── New Issue
│   ├── Open Issues
│   └── History
├── Stock
│   ├── Stock Ledger (DSR replacement)
│   ├── In-Out Summary
│   ├── Stock Aging (FIFO)
│   └── Multi-Warehouse View
├── Masters (R12 only)
│   ├── Material Master
│   ├── Warehouse Master
│   ├── SAP Codes
│   ├── Status Master
│   └── User Management
└── Reports
    ├── DSR Export (Excel)
    ├── Container Details
    └── FIFO Compliance
```

### 3.2 Role-Based Navigation

| Section | R01 W.Exec | R02 W.Oper | R03 W.Inch | R04 QC | R06 Pack Sup | R09 Logistics | R10 Security | R12 Admin |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard | view | view | full | QC view | limited | dispatch view | gate view | full |
| Inward | create | assist | view | view | confirm | - | - | full |
| Storage/Rack | view | operate | full | view | - | - | - | full |
| Hold Mgmt | view | - | view | full | - | - | - | full |
| Bulk Mgmt | view | - | full | view | view | - | - | full |
| Outward/Dispatch | view | assist | view | export approval | - | full | gate pass | full |
| Transfers | view | assist | create | - | - | create | - | full |
| Maintenance | create | create | view | - | - | - | - | full |
| Stock/Ledger | view | - | full | view | - | view | - | full |
| Masters | - | - | - | - | - | - | - | full |

---

## 4. SCREEN INVENTORY

### SCREEN-001: Main Dashboard (Warehouse Incharge)

**Purpose:** Single screen to see everything — replaces WhatsApp status checks.

```
┌─────────────────────────────────────────────────────────────────────┐
│  IBF FG WAREHOUSE    [Dashboard] [Inward] [Storage] ...  [👤 Name]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─STOCK SNAPSHOT─────┐  ┌─HOLD TRACKING──────────┐  ┌─QC QUEUE───┐ │
│  │ Total: 45,200 ctn  │  │ 🔴 3 holds (red >7d)   │  │ 2 pending   │ │
│  │ OK: 38,000          │  │ 🟡 2 holds (amber >3d) │  │ SLA: 2h    │ │
│  │ Hold: 3,200         │  │ ⚪ 5 holds (ok)         │  │             │ │
│  │ Bulk: 2,500         │  │ [View All Holds →]     │  │ [View →]   │ │
│  │ Rejected: 500       │  └────────────────────────┘  └────────────┘ │
│  │ Aging: 0-30: 70%    │                                           │
│  │       31-60: 20%    │  ┌─BULK TRACKING─────────┐  ┌─DISPATCH────┐ │
│  │       61-90: 7%      │  │ 2,500 ctn pending      │  │ Today: 3    │ │
│  │       90+: 3% 🔴     │  │ Oldest: 5 days         │  │ Pending: 2  │ │
│  └─────────────────────┘  │ [View Bulk →]          │  │ [View →]   │ │
│                            └────────────────────────┘  └────────────┘ │
│  ┌─TRANSFERS──────────┐  ┌─MAINTENANCE────────────┐                   │
│  │ In-Transit: 2       │  │ Open: 1 (HIGH)         │                   │
│  │ Pending Receipt: 1   │  │ Critical: 0            │                   │
│  └────────────────────┘  └────────────────────────┘                   │
│                                                                     │
│  ┌─RACK MAP (mini)──────────────────────────────────────────────┐    │
│  │  CR1: [🟢🟢🔴🔵🟡🔴🟢🟢🔴🟢]  68% occupied                   │    │
│  │  CR2: [🟢🔴🔴🟢🔴🔵🟢🔴🟢🔴]  55% occupied                   │    │
│  │  [View Full Rack Map →]                                        │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─STOCK LEDGER (recent)───────────────────────────────────────┐     │
│  │ Time    | Type    | Material  | Batch | Qty | Location       │     │
│  │ 09:40   | INWARD  | LFG00938  | L26I.. | 60  | CR1-01-A-1    │     │
│  │ 10:15   | MOVE    | LFG00613  | L26I.. | -   | CR2-05-B-3    │     │
│  │ 11:30   | HOLD    | LFG01088  | L26I.. | 90  | CR1-03-C-2    │     │
│  │ [View Full Ledger →]                                         │     │
│  └──────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

**Loading State:** Skeleton cards with spinner.
**Empty State:** "No data for today yet — create a receiving sheet to begin."
**Permission Denied:** Different dashboard variants per role.

**WHAT MUST NOT APPEAR ON THIS SCREEN:**
- Master data editing forms
- User management
- System configuration
- Detailed transaction entry (redirect to dedicated screens)
- SAP sync controls (future feature, not v1)

### SCREEN-002: New Receiving Sheet

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← Back    NEW FG RECEIVING SHEET                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─HEADER──────────────────────────────────────────────────────┐    │
│  │ Sheet No: RS-2026-0912-001 (auto)          Status: DRAFT     │    │
│  │                                                              │    │
│  │ Date: [12/09/2026 📅]   Shift: [A ▾]   Line: [FF ▾]        │    │
│  │ Material: [Search LFG/SFG... 🔍] → LFG00938 selected        │    │
│  │ Product: Hungritos Shoestring FF 1.0kg (auto-filled)        │    │
│  │ Batch No: [L26I07______] (format: L+YY+Month+Day+Seq)       │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─PALLET TABLE──────────────────────────────────────────────┐      │
│  │ Sr│Pallet No│Qty│Time  │Total│Condition  │Temp│Remarks    │      │
│  │──┼────────┼───┼──────┼─────┼───────────┼────┼───────────│      │
│  │ 1│30673    │60 │09:40 │ 60  │OK ▾       │-18 │           │      │
│  │ 2│30675    │60 │09:50 │120  │OK ▾       │-18 │           │      │
│  │ 3│30676    │60 │10:10 │180  │BULGING ▾  │-16 │⚠ sides bul│      │
│  │ 4│30698    │58 │10:15 │238  │SHORT QTY ▾│-18 │2 ctn short │      │
│  │                                                              │      │
│  │ [+ Add Pallet Row]                                          │      │
│  │                                                              │      │
│  │ Total Qty: 238   Total Boxes: 4   Total Weight: 2,856 kg   │      │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ⚠ Pallet 3: BULGING cartons — remark mandatory                     │
│  ⚠ Pallet 4: SHORT QUANTITY — 2 cartons short vs expected            │
│  ⚠ Pallet 3: Temperature -16°C above threshold (-15°C)              │
│                                                                     │
│  ┌─CONFIRMATION───────────────────────────────────────────────┐     │
│  │ PACKING SIDE:                          WAREHOUSE SIDE:       │     │
│  │ Sup: [Login → Confirm]                 Exec: [Login → Conf] │     │
│  │ Oper: [Login → Confirm]               Oper: [Login → Conf] │     │
│  │                                                              │     │
│  │ [Save Draft]    [Submit for Confirmation]                    │     │
│  └──────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

**States:**
- DRAFT: editable, auto-saved
- PENDING_PACKING: warehouse confirmed, waiting packing
- PENDING_WAREHOUSE: packing confirmed, waiting warehouse
- LOCKED: both sides confirmed — immutable

**WHAT MUST NOT APPEAR ON THIS SCREEN:**
- Putaway location assignment (happens after lock, on separate screen)
- QC inspection fields (QC works on their own screen)
- Dispatch/transfer fields
- Status override (auto-assigned to QC_HOLD/BULK)

### SCREEN-003: Rack Map (Digital Twin)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← Back    RACK MAP — CR1                          [CR1] [CR2] [3PL] │
├─────────────────────────────────────────────────────────────────────┤
│  Search: [Material/Batch/Pallet... 🔍]    Legend:                   │
│  🟢 Empty  🔴 Full  🔵 Partial  🟡 Multi-batch  🟠 Hold  ⬛ Blocked │
│                                                                     │
│  Block 01          Block 02          Block 03          Block 04      │
│  ┌───┬───┬───┐    ┌───┬───┬───┐    ┌───┬───┬───┐    ┌───┬───┬───┐  │
│  │A4 │B4 │C4 │    │A4 │B4 │C4 │    │A4 │B4 │C4 │    │A4 │B4 │C4 │  │
│  │🟢 │🔴 │🟢 │    │🔴 │🔴 │🟢 │    │🟠 │🟢 │🔴 │    │🟢 │🟢 │🟢 │  │
│  ├───┼───┼───┤    ├───┼───┼───┤    ├───┼───┼───┤    ├───┼───┼───┤  │
│  │A3 │B3 │C3 │    │A3 │B3 │C3 │    │A3 │B3 │C3 │    │A3 │B3 │C3 │  │
│  │🔴 │🔴 │🔵 │    │🟢 │🔴 │🔴 │    │🔴 │🔵 │🟢 │    │🟢 │🔴 │🟢 │  │
│  ├───┼───┼───┤    ├───┼───┼───┤    ├───┼───┼───┤    ├───┼───┼───┤  │
│  │A2 │B2 │C2 │    │A2 │B2 │C2 │    │A2 │B2 │C2 │    │A2 │B2 │C2 │  │
│  │🔴 │🟢 │🔴 │    │🔴 │🔴 │🟢 │    │🟢 │🔴 │🔴 │    │🔴 │🔴 │🔴 │  │
│  ├───┼───┼───┤    ├───┼───┼───┤    ├───┼───┼───┤    ├───┼───┼───┤  │
│  │A1 │B1 │C1 │    │A1 │B1 │C1 │    │A1 │B1 │C1 │    │A1 │B1 │C1 │  │
│  │🔴 │🔴 │🔴 │    │🔴 │🔴 │🔴 │    │🔴 │🔴 │🔴 │    │🔴 │🔴 │🔴 │  │
│  └───┴───┴───┘    └───┴───┴───┘    └───┴───┴───┘    └───┴───┴───┘  │
│  ...blocks 05-36...                                                 │
│                                                                     │
│  Click any cell to see pallet details →                              │
│  ┌─PALLET DETAIL (popup)─────────────────────────────────┐          │
│  │ CR1-03-A-4  |  Pallet: 30673                          │          │
│  │ Material: LFG00938 — Hungritos Shoestring FF 1.0kg   │          │
│  │ Batch: L26I010938 (960 ctn) + L26H130938 (640 ctn)   │          │
│  │ Total: 1,600 ctn | 19,200 kg                          │          │
│  │ Status: 🟠 HOLD — Thread contamination                │          │
│  │ Hold since: 05/09/2026 (7 days — 🔴 RED)              │          │
│  │ [View Hold Record]  [Move Pallet]  [History]          │          │
│  └───────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

### SCREEN-004: Hold Management Dashboard

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← Back    HOLD MANAGEMENT                                          │
├─────────────────────────────────────────────────────────────────────┤
│  Filter: [All Reasons ▾] [All Depts ▾] [All Aging ▾]  [Export 📊]  │
│                                                                     │
│  ┌─HOLD SUMMARY───────────────────────────────────────────────┐     │
│  │  Active Holds: 10  |  Total Cartons: 8,500                 │     │
│  │  🔴 Red (>7d): 3   |  🟡 Amber (>3d): 2  |  ⚪ OK: 5       │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ┌─ACTIVE HOLDS───────────────────────────────────────────────┐      │
│  │ Hold ID    │ Material │ Batch  │ Qty │ Pallets │ Reason  │  Age  │      │
│  │───────────┼──────────┼────────┼─────┼─────────┼────────┼───────│      │
│  │ HOLD-0912 │LFG00938  │L26I01..│1600 │30673... │Thread..│7d 🔴  │      │
│  │ HOLD-0910 │LFG01088  │L26I08..│ 360 │30001... │High Temp│5d 🟡 │      │
│  │ HOLD-0908 │LFG00613  │L26I07..│ 449 │30069... │Metal...│3d 🟡  │      │
│  │ HOLD-0905 │LFG01249  │L26I10..│ 840 │30486... │Enzyme..│2d ⚪   │      │
│  │                                                                 │      │
│  │ Row actions: [View] [Follow Up ⏰] [Release ✓] (QC only)       │      │
│  └──────────────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ┌─FOLLOW-UP NUDGE──────────────────────────────────────────┐       │
│  │ "Send reminder to QC LAB about 3 aged holds?"             │       │
│  │ [Send Reminder]  (sends system notification to QC queue) │       │
│  └──────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

### SCREEN-005: Loading Sheet & Dispatch

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← Back    LOADING SHEET — LS-2026-0912-001    Status: STAGING      │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─VEHICLE & PARTY────────────────────────────────────────────┐     │
│  │ Date: 12/09/2026   Vehicle: GJ14AT7260   Driver: Ramesh    │     │
│  │ Transporter: ABC Logistics  Party: XYZ Snacks, Dubai       │     │
│  │ Type: EXPORT   Container: MNBU9105855                      │     │
│  │ Seal No: MLIN3377853   Bolt No: PACK03760905               │     │
│  │ Temperature at Loading: -18°C ✓                           │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ┌─MATERIALS LOADED───────────────────────────────────────────┐      │
│  │ Material   │ Batch    │ Qty │ Weight  │ Pallets │ Location │      │
│  │───────────┼──────────┼─────┼─────────┼─────────┼──────────│      │
│  │ LFG00938  │L26I010938│ 960 │11,520kg │30673-82 │CR1-01-*  │      │
│  │ LFG00613  │L26I070613│ 449 │ 3,592kg │30069-75 │CR2-05-*  │      │
│  │                                                           │      │
│  │ Total: 1,409 cartons | 15,112 kg | 17 pallets           │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                     │
│  ┌─QC APPROVAL (export)──────────────────────────────────────┐      │
│  │ QC Approval: [Pending] → [Login as QC → Approve]          │      │
│  │ "Ok for loading" required before gate pass              │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
│  ┌─AUTHORIZATION─────────────────────────────────────────────┐     │
│  │ Loaded By: [Warehouse Operator login]                     │     │
│  │ Verified By: [Warehouse Executive login]                   │     │
│  │ Gate Pass: GP-2026-0912-001   Exit Time: [auto on verify] │     │
│  │ [Generate Gate Pass]  [Finalize Dispatch]                  │     │
│  └────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

### SCREEN-006 through SCREEN-012 (abbreviated)

| Screen ID | Name | Purpose |
|-----------|------|---------|
| SCREEN-006 | Putaway Queue | Assign locations to received pallets |
| SCREEN-007 | Transfer Order | Create/track inter-warehouse transfers |
| SCREEN-008 | Bulk Management | Track bulk stock, aging, packing queue |
| SCREEN-009 | Maintenance Ticket | Raise/track/resolve equipment issues |
| SCREEN-010 | Stock Ledger (DSR) | Full transaction log, exportable to Excel |
| SCREEN-011 | In-Out Summary | Daily summary matching DSR IN-OUT sheet |
| SCREEN-012 | Masters Management | Material/Warehouse/SAP/User/Status masters |
| SCREEN-013 | FIFO Aging Report | Stock aging by batch, FIFO compliance |
| SCREEN-014 | Export Container Details | Container tracking with seal/bolt numbers |

---

## 5. CORE USER JOURNEYS

### JOURNEY-001: Normal FG Inward to Dispatch (Happy Path)

```
ACTOR: Warehouse Executive (R01), QC Officer (R04)
STARTING STATE: Empty receiving dock

1. Packing team delivers pallets → R01 opens New Receiving Sheet
2. R01 fills header (date, shift, line, material, batch) + pallet table
3. R01 notes carton conditions, temperatures, discrepancies
4. R01 submits → status: PENDING_PACKING
5. Packing Supervisor (R06) logs in → confirms → status: PENDING_WAREHOUSE
6. R01 confirms warehouse side → status: LOCKED
7. System auto-sets all pallets to QC_HOLD + notifies QC dashboard
8. QC (R04) inspects → releases → pallets status: OK
9. R02 does putaway → assigns rack locations
10. Dispatch order arrives → system generates FIFO pick list
11. R02 picks → stages at dispatch dock
12. R01 creates loading sheet → QC approves (if export)
13. Security (R10) verifies gate pass → vehicle exits
14. Stock deducted → ledger updated → DISPATCHED
```

### JOURNEY-002: Hold & Release

```
1. FG received → QC_HOLD → putaway
2. QC finds issue → places HOLD (reason from dropdown)
3. Dashboard shows HOLD with aging counter
4. Daily digest sent to QC if aging > 3 days
5. Production acknowledges → provides action plan
6. Production marks "issue resolved → please re-inspect"
7. QC re-inspects → RELEASE (→ OK) or REJECT (→ REJECTED)
8. If released → dispatchable. If rejected → disposition decision.
```

### JOURNEY-003: Bulk Material Flow

```
1. Production over-produces → excess packed in bulk cartons
2. Receiving Sheet → status: BULK (not QC_HOLD)
3. Putaway in cold storage
4. System notifies packing team: bulk pending repacking
5. Warehouse transfers bulk to Packing Department
6. Packing repacks into branded cartons → new pallets
7. New Receiving Sheet (linked to original bulk record)
8. QC_HOLD → release → OK → dispatchable
   OR: Online-add to future production run
```

### JOURNEY-004: Inter-Warehouse 3PL Transfer

```
1. Warehouse Incharge/Logistics creates Transfer Order
2. Selects materials, pallets, destination (3PL warehouse)
3. Transfer type: NORMAL / HOLD_TAG / BULK_TAG
4. Pick & stage → vehicle loading → loading sheet
5. Status: IN_TRANSIT (shown separately in dashboard)
6. 3PL receives → confirms → stock at 3PL
7. If HOLD_TAG: 3PL QC must release before dispatch
8. Full traceability: batch history across warehouses
```

---

## 6. WORKFLOW / STATE MACHINE MODEL

### 6.1 Pallet Status State Machine

```
                    ┌──────────┐
     Receiving ─────>│ QC_HOLD  │
     Sheet            └────┬─────┘
                           │ QC Release
                           ▼
                    ┌──────────┐
                    │    OK    │<──────────┐
                    │(Available)│          │
                    └────┬─────┘           │
                         │                  │
          ┌──────────────┼──────────────┐   │
          │              │              │   │
          ▼              ▼              ▼   │
    ┌──────────┐  ┌──────────┐  ┌──────────┐│
    │   HOLD   │  │DISPATCHED│  │IN_TRANSIT││
    └────┬─────┘  └──────────┘  └────┬─────┘│
         │                           │      │
         │ QC Release                │ Receive│
         └───────────────────────────┘      │
              (from HOLD → OK)               │
                                            │
    ┌──────────┐  ┌──────────┐              │
    │   BULK   │  │ REJECTED │              │
    └────┬─────┘  └──────────┘              │
         │ Repack done                       │
         ▼                                    │
    New Receiving Sheet ─────────────────────┘
    (new pallets, QC_HOLD)
```

### 6.2 Receiving Sheet State Machine

```
DRAFT → PENDING_PACKING → LOCKED
DRAFT → PENDING_WAREHOUSE → LOCKED
PENDING_PACKING → CANCELLED (if rejected by packing)
```

**INVALID TRANSITIONS:**
- LOCKED → DRAFT (cannot unlock a confirmed sheet)
- LOCKED → PENDING_PACKING (cannot un-confirm)
- DRAFT → LOCKED (must go through pending states)

### 6.3 Transfer Order State Machine

```
DRAFT → PICKED → LOADED → IN_TRANSIT → RECEIVED → COMPLETED
                                              ↗
ANY → CANCELLED (before LOADED only)
```

### 6.4 Maintenance Ticket State Machine

```
OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED → CLOSED
                                   ↗
RESOLVED → REOPENED → IN_PROGRESS → RESOLVED → CLOSED
```

---

## 7. ROLE & PERMISSION MATRIX

### 7.1 Action Permission Matrix

| Action | R01 W.Exec | R02 W.Oper | R03 W.Inch | R04 QC | R06 Pack Sup | R09 Logistics | R10 Security | R12 Admin |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Create Receiving Sheet | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Confirm Receiving (Warehouse) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Confirm Receiving (Packing) | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Assign Putaway Location | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Place Hold | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Release Hold | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Reject Material | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Create Transfer Order | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Create Dispatch Order | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Generate Pick List | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Create Loading Sheet | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Approve Export Container | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Generate Gate Pass | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| FIFO Override | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Raise Maintenance Ticket | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Resolve Maintenance | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Verify Maintenance Fix | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Edit Masters | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| View Stock Ledger | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| Export Reports | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Manage Users | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 7.2 Server-Side Enforcement Rules

**All permissions MUST be enforced server-side. UI hiding is NOT security.**

Every API endpoint must:
1. Verify user is authenticated
2. Verify user's role has permission for the action
3. Verify the business rule preconditions (e.g., status allows action)
4. Log to audit trail
5. Return 403 Forbidden if unauthorized

---

## 8. DATA LINEAGE

### 8.1 Receiving Sheet Data Lineage

```
USER INPUT (Receiving Sheet form)
  → FORM FIELD (pallet_number, qty, batch_number, carton_condition, temperature)
  → DOMAIN ENTITY (Receiving Sheet + Receiving Sheet Pallets)
  → API / COMMAND (POST /api/receiving-sheets)
  → BUSINESS RULE (validate batch format, check dual confirmation, auto-set QC_HOLD)
  → DATABASE (receiving_sheets, receiving_sheet_pallets, pallets, pallet_batches)
  → EVENT / AUDIT (stock_ledger entry: INWARD)
  → NOTIFICATION (QC dashboard: new FG received)
  → NEXT SCREEN / STATE (Putaway Queue for warehouse operator)
  → DASHBOARD / REPORT (Stock snapshot, QC pending queue, In-Out summary)
```

### 8.2 Hold Data Lineage

```
USER INPUT (QC places hold)
  → FORM FIELD (material, batch, pallets, reason from dropdown)
  → DOMAIN ENTITY (Hold Record)
  → API / COMMAND (POST /api/holds)
  → BUSINESS RULE (verify user is QC role, update pallet status to HOLD)
  → DATABASE (hold_records, pallets.status = HOLD)
  → EVENT / AUDIT (stock_ledger: HOLD, status_history entry)
  → NOTIFICATION (Warehouse dashboard: material on hold, Production: hold reason)
  → NEXT SCREEN / STATE (Hold Management dashboard with aging timer)
  → DASHBOARD / REPORT (Hold tracking panel, aging alerts)
```

### 8.3 Dispatch Data Lineage

```
USER INPUT (Dispatch order / loading sheet)
  → FORM FIELD (vehicle, party, materials, pallets, container details)
  → BUSINESS RULE (verify ALL materials are OK status — HARD BLOCK if not)
  → BUSINESS RULE (verify FIFO — warn if older batch exists, allow override with reason)
  → API / COMMAND (POST /api/loading-sheets)
  → DATABASE (loading_sheets, pallets.status = DISPATCHED, stock_ledger: DISPATCH)
  → NOTIFICATION (Gate pass for security, dispatch confirmation for logistics)
  → DASHBOARD / REPORT (Dispatch status, stock reduction, ledger update)
```

---

## 9. API CONTRACT (REST)

### 9.1 Core Endpoints

```
AUTH
  POST   /api/auth/login          → { token, user, role }
  POST   /api/auth/logout
  GET    /api/auth/me              → { user, role, permissions }

RECEIVING SHEETS
  GET    /api/receiving-sheets              → list (filterable)
  GET    /api/receiving-sheets/:id           → detail with pallets
  POST   /api/receiving-sheets               → create (R01, R03)
  PATCH  /api/receiving-sheets/:id           → update (DRAFT only)
  POST   /api/receiving-sheets/:id/confirm-warehouse  → confirm (R01, R03)
  POST   /api/receiving-sheets/:id/confirm-packing    → confirm (R06, R07)
  POST   /api/receiving-sheets/:id/lock       → lock (system, both confirmed)

PALLETS
  GET    /api/pallets                        → list (filterable by status, material, warehouse)
  GET    /api/pallets/:id                     → detail with batches, location, history
  PATCH  /api/pallets/:id/location            → move (R02, R03)
  GET    /api/pallets/:id/history             → location + status history

LOCATIONS
  GET    /api/locations                       → list (filterable by warehouse, cold_room, status)
  GET    /api/locations/rack-map/:warehouse   → full rack grid with occupancy
  PATCH  /api/locations/:id/assign            → assign pallet (R02, R03)

HOLDS
  GET    /api/holds                           → list (filterable: active/released, reason, aging)
  POST   /api/holds                           → create (R04 only)
  POST   /api/holds/:id/release               → release (R04 only)
  POST   /api/holds/:id/reject                → reject (R04 only)
  POST   /api/holds/:id/followup              → nudge QC (R03)

TRANSFERS
  GET    /api/transfers                       → list
  POST   /api/transfers                       → create (R03, R09)
  POST   /api/transfers/:id/dispatch          → mark in-transit
  POST   /api/transfers/:id/receive           → confirm receipt

LOADING SHEETS
  GET    /api/loading-sheets                  → list
  POST   /api/loading-sheets                  → create (R01, R03, R09)
  POST   /api/loading-sheets/:id/qc-approve   → approve export (R04)
  POST   /api/loading-sheets/:id/gate-pass    → generate gate pass (R10)
  POST   /api/loading-sheets/:id/dispatch      → finalize dispatch

MAINTENANCE
  GET    /api/maintenance                     → list
  POST   /api/maintenance                     → create (any warehouse role)
  POST   /api/maintenance/:id/acknowledge      → acknowledge (R11)
  POST   /api/maintenance/:id/resolve          → resolve (R11)
  POST   /api/maintenance/:id/close            → close (creator)

STOCK
  GET    /api/stock/summary                   → current stock by material/warehouse/status
  GET    /api/stock/ledger                     → transaction log (paginated, filterable)
  GET    /api/stock/aging                      → FIFO aging buckets
  GET    /api/stock/in-out                     → daily summary (DSR IN-OUT format)
  GET    /api/stock/export                     → Excel export (DSR format)

MASTERS (R12 only)
  GET/POST/PATCH /api/materials
  GET/POST/PATCH /api/warehouses
  GET/POST/PATCH /api/sap-codes
  GET/POST/PATCH /api/users
  GET /api/statuses                           → status master (read-only after seed)
```

---

## 10. DASHBOARD SPECIFICATION

### 10.1 Dashboard Panels (SCREEN-001 detail)

| Panel ID | Name | KPIs | Refresh | Role |
|----------|------|------|---------|------|
| D-01 | Stock Snapshot | Total stock, status breakdown, aging buckets | 30s | R03 |
| D-02 | Hold Tracking | Active holds, aging (amber >3d, red >7d), reasons | 30s | R03, R04 |
| D-03 | Bulk Tracking | Bulk stock pending, aging, packing queue | 60s | R03 |
| D-04 | QC Pending Queue | New inwards awaiting inspection, SLA timers | 30s | R04 |
| D-05 | Dispatch Status | Today's dispatches, pending, FIFO suggestions | 60s | R03, R09 |
| D-06 | Transfers | In-transit, pending receipts | 60s | R03, R09 |
| D-07 | Maintenance | Open issues by severity, age | 60s | R03 |
| D-08 | Rack Map (mini) | CR1/CR2 occupancy %, color-coded | 30s | R03 |
| D-09 | Stock Ledger (recent) | Latest 10 transactions | 30s | R03 |
| D-10 | In-Out Summary | Daily IN/OUT by shift, material | 60s | R03 |

---

## 11. DESIGN SYSTEM

### 11.1 Foundations

**Typography:** System fonts (San Francisco / Roboto) — readable in -18°C with gloves
**Base font:** 16px (minimum — warehouse floor readability)
**Touch targets:** Minimum 48×48px (glove-friendly)
**Color palette:**

| Color | Hex | Usage |
|-------|-----|-------|
| Primary Blue | #1a56db | Primary actions, navigation |
| Success Green | #16a34a | OK status, empty locations |
| Warning Amber | #d97706 | Amber alerts, aging >3d |
| Danger Red | #dc2626 | Hard blocks, critical, aging >7d |
| Hold Orange | #ea580c | Hold status |
| Partial Blue | #2563eb | Partial locations |
| Multi-batch Yellow | #ca8a04 | Multi-batch locations |
| Blocked Grey | #6b7280 | Blocked/unavailable |
| Background | #f8fafc | App background |
| Surface White | #ffffff | Cards, panels |

### 11.2 Component Patterns

- **Forms:** Large dropdowns, auto-save, sticky submit button on mobile
- **Tables:** Sortable, filterable, pagination at 50 rows, export button
- **Rack Map:** Grid layout, click-to-detail, color legend always visible
- **Dashboards:** Card-based, 2-column on tablet, 1-column on mobile
- **Modals:** Only for confirmations and quick view — never for full forms
- **Notifications:** Toast (success/error), badge counts on nav items

---

## 12. RESPONSIVE / MOBILE SPECIFICATION

**Implementation requirement:** The bundled `reference/IBF_FG_Warehouse_Frontend_Design_v5.html` is reference-only. The actual product must be a mobile-first Next.js application; the HTML preview is not behavioral proof.

### Critical Constraint

Warehouse operators work in -18°C cold storage with gloves. The interface MUST be:
- Large buttons (min 48×48px touch target)
- Minimal typing — dropdowns and search-selects
- High contrast
- Works in landscape (tablet on forklift mount) and portrait (phone)
- Offline-capable (PWA with service worker)

### Breakpoints

| Width | Layout | Primary Device |
|-------|--------|---------------|
| < 640px | Single column, bottom nav, sticky CTA | Phone (cold storage) |
| 640-1024px | Two column, collapsible sidebar | Tablet (forklift mount) |
| > 1024px | Multi-column, full sidebar | Desktop (office) |

### Mobile-Specific Behaviors

- Receiving Sheet: one pallet row visible at a time on phone, swipe to next
- Rack Map: simplified grid on phone, full grid on tablet/desktop
- Dashboard: stacked cards on phone, grid on tablet/desktop
- Forms: sticky "Save" button always visible at bottom
- All data entry: numeric keypads for qty/temp fields, dropdowns for everything else

---

## 13. SECURITY SPECIFICATION

### 13.1 Authentication

- Username/password login (Clerk managed authentication)
- Session-based with JWT tokens
- Session timeout: 8 hours (warehouse shift duration)
- All API endpoints require valid session

### 13.2 Authorization

- Role-based access control (RBAC) — 12 roles defined
- **Server-side enforcement on EVERY API endpoint** — UI hiding is NOT security
- Permission check: user → role → permission → action → resource
- Export container approval requires QC role specifically
- Hold release requires QC role specifically

### 13.3 Data Protection

- Receiving Sheet is a legal document — once LOCKED, immutable
- Stock Ledger is append-only — no UPDATE or DELETE
- Status history is append-only
- Location history is append-only
- No bulk delete operations on transactional data

### 13.4 Input Validation

- All inputs validated server-side (never trust client)
- Batch number format validation (regex)
- Pallet weight limit enforcement (server-side calculation)
- Status values from fixed enum (no free text)
- Hold reason from fixed dropdown (no free text except "Other" with approval)

---

## 14. PERFORMANCE SPECIFICATION

| Metric | Target | Verification |
|--------|--------|-------------|
| Dashboard initial load | < 2s | Lighthouse / manual |
| API response (P95) | < 500ms | API monitoring |
| Receiving Sheet submit | < 1s | Manual / automated test |
| Rack Map render (full grid) | < 1.5s | Manual |
| Stock Ledger query (1000 rows) | < 1s | Query EXPLAIN |
| Excel export (DSR format) | < 5s | Manual |
| Search (material/batch/pallet) | < 300ms | Search latency test |
| Mobile page load (3G) | < 3s | Lighthouse mobile |

**Key Performance Risks:**
- N+1 queries on stock summary (join pallets → batches → materials → locations)
- Unbounded ledger queries (must paginate, default 50, max 500)
- Rack Map full grid (36 blocks × 5 positions × 4 floors = 720 cells) — cache or precompute
- Multi-warehouse stock aggregation — consider materialized view or cache

---

## 15. OBSERVABILITY SPECIFICATION

### 15.1 Audit Trail

Every status-changing operation logs:
- WHO (user_id, name, role)
- WHEN (timestamp)
- WHAT (action, entity, before/after values)
- WHY (reason, reference)
- WHERE (IP, device type optional)

### 15.2 Business Metrics

- Receiving disputes per month (target: trending to 0)
- QC release turnaround time (avg, P90)
- Hold aging (avg, max, count by bucket)
- FIFO compliance rate (% dispatches following FIFO)
- Stock accuracy (physical count vs system)
- Dispatch documentation completeness
- Maintenance resolution time (avg by severity)

### 15.3 System Metrics

- API error rate (target: < 1%)
- API response time P50/P95/P99
- Database query performance
- Offline sync queue depth (when offline features active)

---

## 16. INVARIANT REGISTER

| ID | Rule | Severity | Detection | Enforcement |
|----|------|----------|-----------|-------------|
| INV-001 | HOLD material CANNOT be dispatched to party | CRITICAL | Unit test + API guard | H4 Runtime |
| INV-002 | REJECTED material CANNOT be dispatched | CRITICAL | Unit test + API guard | H4 Runtime |
| INV-003 | QC HOLD (new inward) CANNOT be dispatched | CRITICAL | Unit test + API guard | H4 Runtime |
| INV-004 | BULK material CANNOT be dispatched | CRITICAL | Unit test + API guard | H4 Runtime |
| INV-005 | Only QC role can release a hold | CRITICAL | Unit test + API guard | H4 Runtime |
| INV-006 | One pallet = one material (no mixing) | CRITICAL | Unit test + API guard | H4 Runtime |
| INV-007 | Pallet weight must not exceed limit | HIGH | Unit test + API guard | H4 Runtime |
| INV-008 | Receiving Sheet once LOCKED is immutable | CRITICAL | Integration test | H4 Runtime |
| INV-009 | Stock Ledger is append-only (no UPDATE/DELETE) | CRITICAL | DB constraint + test | H3 Static + H4 Runtime |
| INV-010 | FIFO violation requires logged override with reason | HIGH | Unit test | H4 Runtime |
| INV-011 | Gate pass required for every vehicle exit | HIGH | Integration test | H4 Runtime |
| INV-012 | Loading sheet required for every vehicle loading | HIGH | Integration test | H4 Runtime |
| INV-013 | Receiving Sheet requires dual confirmation | HIGH | Integration test | H4 Runtime |
| INV-014 | Status values are FIXED (no free text) | HIGH | Enum constraint + test | H3 Static + H4 Runtime |
| INV-015 | Hold reason from fixed dropdown (no free text) | HIGH | Enum constraint + test | H3 Static + H4 Runtime |
| INV-016 | Batch traceability across warehouse transfers | HIGH | Integration test | H4 Runtime |
| INV-017 | Hold materials CAN transfer with hold tag | MEDIUM | Integration test | H4 Runtime |
| INV-018 | Export containers need QC approval before loading | HIGH | Integration test | H4 Runtime |
| INV-019 | Temperature at loading must be recorded | MEDIUM | Integration test | H4 Runtime |
| INV-020 | SAP code ≠ physical location (both maintained separately) | MEDIUM | Architecture review | H1 Agent |

---

## 17. EVALUATION PLAN

### 17.1 Evaluation Dimensions

| Dimension | Weight | Coverage |
|-----------|--------|----------|
| Functional correctness | 25% | All 10 flows work end-to-end |
| Authorization correctness | 20% | Permission matrix enforced server-side |
| Data integrity | 15% | Invariants hold, ledger is append-only |
| Business rules | 15% | Hard blocks prevent violations |
| UX / User journey | 10% | Key journeys complete without dead-ends |
| Visual fidelity | 5% | Screens match wireframes |
| Performance | 5% | Meets performance targets |
| Accessibility | 5% | Keyboard nav, contrast, touch targets |

### 17.2 Evaluation Methods

Each requirement gets at least one evaluation:
- **Functional:** Run golden scenarios end-to-end
- **Authorization:** Negative tests (unauthorized user attempts action)
- **Data integrity:** Check ledger immutability, pallet constraints
- **Business rules:** Attempt to dispatch HOLD material (must fail)
- **UX:** Walk through each journey, check for dead-ends
- **Visual:** Compare rendered screens to wireframes
- **Performance:** Measure API response times
- **Accessibility:** Check touch targets, contrast, keyboard nav

---

## 18. GOLDEN SCENARIOS

(Detailed in golden-scenarios.yaml contract file — 10 scenarios from the flow document)

1. GS-001: Normal FG Inward & Dispatch
2. GS-002: Hold & Release
3. GS-003: Inter-Warehouse Transfer of Hold Material
4. GS-004: Bulk Material Flow (over-production → repack → dispatch)
5. GS-005: Export Container Dispatch
6. GS-006: Maintenance Critical Issue
7. GS-007: FIFO Override
8. GS-008: Receiving Dispute Prevention
9. GS-009: Multiple Batches on Same Pallet
10. GS-010: 3PL Inward from Other Plant

---

## 19. NEGATIVE TESTS

(Detailed in negative-tests.yaml contract file)

1. NS-001: Attempt to dispatch HOLD material → must fail
2. NS-002: Attempt to dispatch REJECTED material → must fail
3. NS-003: Non-QC user attempts to release hold → must fail (403)
4. NS-004: Attempt to mix materials on one pallet → must fail
5. NS-005: Pallet weight exceeds limit → must fail
6. NS-006: Attempt to unlock a LOCKED receiving sheet → must fail
7. NS-007: Attempt to DELETE a stock ledger entry → must fail
8. NS-008: Attempt dispatch with newer batch while older available (no override reason) → must warn/block
9. NS-009: Attempt gate pass without loading sheet → must fail
10. NS-010: Attempt loading sheet with non-OK status material → must fail
11. NS-011: Concurrent dual-confirmation race condition → must handle correctly
12. NS-012: Duplicate receiving sheet (same material+batch+shift) → must warn
13. NS-013: Export container loading without QC approval → must fail
14. NS-014: Free-text status entry → must be rejected (enum only)
15. NS-015: Free-text hold reason → must be rejected (dropdown only)

---

## 20. DECISION REGISTER

| ID | Decision | Status | Reason |
|----|----------|--------|--------|
| DEC-001 | Next.js + Cloudflare D1 (SQLite) + Drizzle ORM | LOCKED | Approved stack: D1 + Clerk + R2 + Drizzle |
| DEC-002 | Module is standalone (no existing module integration in v1) | LOCKED | Flow document Part 8 specifies independence |
| DEC-003 | Shared notification queue for future integration (Option A) | PROPOSED | Lowest cost, lowest risk per flow document |
| DEC-004 | No barcode/QR scanning in v1 | LOCKED | Flow document Part 9 item 2 |
| DEC-005 | Offline/PWA sync | DEFERRED / PENDING HUMAN DECISION | Source flow requests offline resilience, but v1 locked scope defers offline synchronization; mobile-friendly online UX remains mandatory. Do not implement offline mutation sync unless explicitly approved. |
| DEC-006 | Excel export matching DSR format | LOCKED | Flow document Part 9 item 10 |
| DEC-007 | Status values as fixed enum (no free text) | LOCKED | Fixes DSR remark chaos |
| DEC-008 | Hold reason as fixed dropdown (20 items + Other) | LOCKED | Flow document Flow 3 |
| DEC-009 | Batch number format: L+YY+Month+Day+Seq | LOCKED | Flow document Part 9 item 3 |
| DEC-010 | Location code: CR+Room+Block+Position+Floor | LOCKED | Flow document Part 1.3 |

---

## 21. PENDING ITEMS

| ID | Item | Status | Blocking? |
|----|------|--------|-----------|
| PEN-001 | Technology stack approval from Alpesh | PENDING | No (can start with proposed) |
| PEN-002 | SAP integration scope (deep two-way sync) | DEFERRED | No (v1 uses SAP codes as reference data only) |
| PEN-003 | Barcode/QR scanning implementation | DEFERRED | No (v1 manual entry, model supports scanner later) |
| PEN-004 | Shelf life / FEFO implementation | DEFERRED | No (FIFO in v1, FEFO configurable later) |
| PEN-005 | Photo attachment for receiving disputes | DEFERRED | No (v1 uses remarks, model supports photos later) |
| PEN-006 | Offline sync conflict resolution strategy | PENDING | No (PWA with queue, sync on reconnect) |
| PEN-007 | Exact material master data (seed data) | PENDING | Yes — need DSR FG CODE sheet data for seed |
| PEN-008 | Exact warehouse location grid (blocks/positions/floors) | PENDING | Yes — need exact grid configuration |

---

## 22. DEFINITION OF DONE

A feature/task is DONE when ALL of the following are true:

1. ✅ Code implements the frozen specification
2. ✅ All hard blocks (INV-001 through INV-004) enforced server-side
3. ✅ Permission checks on every API endpoint
4. ✅ Unit tests pass (> 80% coverage on business logic)
5. ✅ Integration tests pass for relevant golden scenario
6. ✅ Negative tests pass (unauthorized actions rejected)
7. ✅ Stock ledger entry created for every status change
8. ✅ UI works on mobile (320px width test)
9. ✅ No console errors in browser
10. ✅ API response < 500ms (P95)
11. ✅ Excel export works (where applicable)
12. ✅ Code reviewed and merged to main branch
13. ✅ No TODO/FIXME comments in production code
14. ✅ Documentation updated (API docs, screen docs)

---

## ARCHITECTURE COVERAGE SUMMARY

| Area | Status |
|------|--------|
| Product Architecture | ✅ Confirmed |
| Domain Model | ✅ Confirmed (16 entities) |
| Screen Inventory | ✅ Confirmed (14 screens) |
| Navigation Map | ✅ Confirmed |
| User Journeys | ✅ Confirmed (4 critical journeys) |
| Workflow / State Machines | ✅ Confirmed (4 state machines) |
| Permission Matrix | ✅ Confirmed (12 roles, 20+ actions) |
| Data Lineage | ✅ Confirmed (3 critical paths) |
| API Contract | ✅ Confirmed (40+ endpoints) |
| Dashboard Specification | ✅ Confirmed (10 panels) |
| Design System | ✅ Proposed |
| Responsive Spec | ✅ Confirmed (cold-storage constraint) |
| Security Spec | ✅ Confirmed |
| Performance Spec | ✅ Confirmed |
| Observability Spec | ✅ Confirmed |
| Invariant Register | ✅ Confirmed (20 invariants) |
| Evaluation Plan | ✅ Confirmed |
| Golden Scenarios | ✅ Confirmed (10 scenarios) |
| Negative Tests | ✅ Confirmed (15 tests) |
| Decision Register | ✅ Confirmed (10 decisions) |
| Pending Items | ✅ Confirmed (8 items) |

**OVERALL: Architecture is 90% complete. 10% pending = technology approval + seed data + location grid config.**

---

*This blueprint is the construction drawing for the IBF FG Warehouse Module. Claude Code must implement according to this specification. Any deviation must be justified against the source flow document and this blueprint.*
