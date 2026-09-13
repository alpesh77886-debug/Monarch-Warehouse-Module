# IBF FG Warehouse Module — Implementation Specification
## Bounded Tasks for Claude Code
### Each task is self-contained: read the contract, implement, test, verify.

---

## HOW TO USE THIS DOCUMENT

**Loop control:** Claude Code must stop after each 10-loop block and obtain `APPROVE_NEXT_10_LOOPS` from Alpesh before further implementation. Payment/billing/upgrade actions always require explicit human approval and the application must remain on free resources unless Alpesh explicitly approves otherwise.

**Frontend:** Use the bundled HTML only as reference. Implement mobile-first responsive Next.js UI according to the architecture mobile specification.

Each task below is a bounded implementation unit. Claude Code should:
1. Read the task completely
2. Read the referenced contract files
3. Implement only what is IN SCOPE
4. Write tests FIRST
5. Run all tests
6. Run the harness integrity gate
7. Commit with message format: `TASK-XXX: description`

---

## TASK-001: Project Scaffolding & Database Schema

**Objective:** Set up Next.js project, Drizzle schema, Cloudflare D1 connection, and base folder structure.

**MUST READ:**
- `CLAUDE.md` (entire file)
- `contracts/entities.yaml` (all 16 entities)
- `docs/ARCHITECTURE_BLUEPRINT.md` Section 2 (Domain Model)

**SOURCE OF TRUTH:** `contracts/entities.yaml`

**IN SCOPE:**
- Next.js 14+ project with TypeScript + Tailwind CSS
- Drizzle ORM schema (drizzle/schema.ts) with all 16 entities from entities.yaml
- Cloudflare D1 database setup (wrangler.toml + D1 binding)
- Cloudflare R2 bucket setup (for file storage)
- Folder structure per CLAUDE.md repository structure
- Clerk authentication setup (Clerk provider, sign-in/sign-up pages)
- Role metadata mapping (Clerk custom roles → R01-R12)
- Seed script for: statuses (10 values), SAP codes (44 FG-relevant from Appendix D), sample warehouses
- wrangler.toml with D1 binding + R2 binding + Clerk env vars

**OUT OF SCOPE:**
- Any UI pages (beyond minimal sign-in)
- Any API routes beyond auth webhook
- Offline/PWA features
- Excel export

**ACCEPTANCE TESTS:**
- `npx wrangler d1 migrations apply ibf-fg-warehouse --local` succeeds
- `npm run db:seed` populates statuses + SAP codes + warehouses
- `npm run dev` starts without errors
- Clerk sign-in page loads and login works
- D1 database accessible via `npx wrangler d1 execute` 
- R2 bucket accessible via `npx wrangler r2 object put/list`

**STOP CONDITIONS:**
- If Drizzle schema cannot represent an entity from entities.yaml → STOP, create issue

---

## TASK-002: Authentication & Authorization Infrastructure

**Objective:** Role-based auth system with server-side permission enforcement.

**MUST READ:**
- `contracts/permissions.yaml` (entire file)
- `docs/ARCHITECTURE_BLUEPRINT.md` Section 7 (Permission Matrix)

**SOURCE OF TRUTH:** `contracts/permissions.yaml`

**IN SCOPE:**
- Clerk authentication integration (middleware, sign-in/sign-up pages via Clerk components)
- Clerk webhook handler to sync users → D1 users table
- Role assignment in Clerk dashboard (R01-R12 as custom metadata)
- Server-side permission check utility (`src/lib/auth.ts` — uses Clerk's `auth()` function)
- Middleware for API routes: `requireRole(roles)` using Clerk session claims
- User management CRUD (R12 only) — syncs with Clerk via Clerk API
- Clerk organization setup for IBF

**OUT OF SCOPE:**
- Dashboard
- Any business logic
- Password reset flow (Clerk handles built-in)

**ACCEPTANCE TESTS:**
- Login via Clerk returns authenticated session
- API endpoint with `requireRole(['R04'])` returns 403 for R01 user (Clerk role check)
- API endpoint without Clerk session returns 401
- Clerk webhook creates user in D1 users table on signup
- NS-016 and NS-017 pass

---

## TASK-003: Material Master & Warehouse Master CRUD

**Objective:** Admin can manage material master, warehouse master, SAP codes.

**MUST READ:**
- `contracts/entities.yaml` (ENTITY-001, ENTITY-005, ENTITY-006, ENTITY-007, ENTITY-008)
- `docs/ARCHITECTURE_BLUEPRINT.md` Section 2

**SOURCE OF TRUTH:** `contracts/entities.yaml`

**IN SCOPE:**
- Material Master CRUD (R12 only)
- Warehouse Master CRUD (R12 only)
- SAP Warehouse Master (read-only after seed, R12 edit)
- Status Master (read-only, seeded)
- Material code validation (LFG/SFG prefix regex)
- Seed data for 44 FG-relevant SAP codes

**ACCEPTANCE TESTS:**
- Create material with invalid code → validation error
- Non-admin attempting create → 403
- SAP codes seeded correctly (44 FG-relevant)
- Statuses seeded (10 values)

---

## TASK-004: Receiving Sheet Flow (Flow 1)

**Objective:** Complete digital receiving sheet — create, edit, dual-confirm, lock.

**MUST READ:**
- `contracts/entities.yaml` (ENTITY-009, ENTITY-010)
- `contracts/workflows.yaml` (receiving_sheet_status state machine)
- `contracts/invariants.yaml` (INV-008, INV-013)
- `docs/ARCHITECTURE_BLUEPRINT.md` Section 4 (SCREEN-002), Section 6.2

**SOURCE OF TRUTH:** `contracts/entities.yaml` + `contracts/workflows.yaml`

**IN SCOPE:**
- Receiving Sheet API: create, update (DRAFT only), confirm-warehouse, confirm-packing, lock
- Receiving Sheet UI: header form, pallet table (up to 35 rows), confirmation section
- Batch number format validation (regex)
- Carton condition dropdown (OK/BULGING/DAMAGED/WET/SHORT_QUANTITY/OTHER)
- Temperature warning (> -15°C → amber)
- Auto-calculate total_qty, total_boxes, total_weight_kg
- Auto-generate sheet_number (RS-YYYY-MMDD-NNN)
- Auto-assign pallet status (QC_HOLD or BULK) on lock
- Stock ledger entry on lock (INWARD transaction)
- Notification to QC dashboard on lock

**OUT OF SCOPE:**
- Putaway (TASK-005)
- QC inspection UI (TASK-006)
- Photo attachments (deferred)

**ACCEPTANCE TESTS:**
- GS-008 passes (receiving dispute prevention)
- NS-006 passes (cannot unlock LOCKED sheet)
- NS-011 passes (concurrent confirmation handled)
- NS-012 passes (duplicate detection)
- NS-018 passes (batch format validation)
- NS-019 passes (max 35 pallets)
- INV-008 enforced (LOCKED = immutable)
- INV-013 enforced (dual confirmation required)

---

## TASK-005: Putaway & Rack Map (Flow 2)

**Objective:** Location assignment and visual rack map.

**MUST READ:**
- `contracts/entities.yaml` (ENTITY-003, ENTITY-004, ENTITY-005)
- `docs/ARCHITECTURE_BLUEPRINT.md` Section 4 (SCREEN-003), Section 6.1

**IN SCOPE:**
- Location CRUD (admin)
- Rack Map API: GET rack grid with occupancy
- Rack Map UI: color-coded grid (green/red/blue/yellow/orange/purple/grey)
- Click cell → pallet detail popup
- Search: highlight all locations of a material/batch/pallet
- Putaway assignment: select pallet → select location → confirm
- Location validation: empty check, pallet type check, weight capacity check
- Move operation: select pallet → select new location → confirm + reason
- Location history per pallet (audit trail)

**ACCEPTANCE TESTS:**
- Rack Map renders in < 1.5s
- Click shows correct pallet details
- Move creates history entry
- Cannot assign to occupied location (unless partial — same material)
- Color coding correct per status

---

## TASK-006: Hold Management (Flow 3)

**Objective:** Place hold, track aging, release/reject, follow-up nudges.

**MUST READ:**
- `contracts/entities.yaml` (ENTITY-011)
- `contracts/workflows.yaml` (pallet_status transitions for HOLD)
- `contracts/invariants.yaml` (INV-005, INV-015)
- `docs/ARCHITECTURE_BLUEPRINT.md` Section 4 (SCREEN-004)

**IN SCOPE:**
- Hold API: create (R04 only), release (R04 only), reject (R04 only)
- Hold reason dropdown (20 fixed values from entities.yaml)
- Hold dashboard: active holds, aging (amber >3d, red >7d), group/filter
- Follow-up nudge (R03 → sends notification to QC)
- Daily digest notification to QC for aged holds
- Production notification on hold
- Stock ledger entries (HOLD, RELEASE)
- Pallet status update on hold/release

**ACCEPTANCE TESTS:**
- GS-002 passes (hold & release)
- NS-003 passes (non-QC cannot release)
- NS-015 passes (free-text reason rejected)
- INV-005 enforced
- INV-015 enforced
- Aging calculated correctly

---

## TASK-007: Bulk Management (Flow 3, Step 7)

**Objective:** Track bulk stock, aging, packing queue, repack receipt.

**MUST READ:**
- `contracts/entities.yaml` (BULK status)
- `docs/ARCHITECTURE_BLUEPRINT.md` Section 5 (JOURNEY-003)

**IN SCOPE:**
- Bulk stock dashboard: pending repacking, aging, quantity, reason
- Bulk → Packing transfer record
- Packing team queue
- Repack receipt: new receiving sheet linked to original bulk
- Bulk aging alerts

**ACCEPTANCE TESTS:**
- GS-004 passes (bulk flow)

---

## TASK-008: Dispatch & Loading Sheet (Flows 5, 6)

**Objective:** Dispatch order, FIFO pick list, loading sheet, gate pass.

**MUST READ:**
- `contracts/entities.yaml` (ENTITY-013)
- `contracts/workflows.yaml`
- `contracts/invariants.yaml` (INV-001 through INV-004, INV-010, INV-011, INV-012, INV-018, INV-019)
- `docs/ARCHITECTURE_BLUEPRINT.md` Section 4 (SCREEN-005)

**IN SCOPE:**
- Dispatch order creation (R03, R09)
- Pick list generation: FILTER status=OK, FIFO sort, location-aware
- Loading sheet API: create, qc-approve (R04), gate-pass (R10), dispatch
- Loading sheet UI with vehicle/party/container fields
- Export container: container_no, seal_no, bolt_no, QC approval
- Gate pass generation and verification
- FIFO override with mandatory reason + logging
- Stock ledger entries (DISPATCH)
- Pallet status update to DISPATCHED

**ACCEPTANCE TESTS:**
- GS-001 passes (normal inward & dispatch)
- GS-005 passes (export container)
- GS-007 passes (FIFO override)
- NS-001 through NS-004 pass (hard blocks)
- NS-008 passes (FIFO without reason)
- NS-009 passes (gate pass without loading sheet)
- NS-013 passes (export without QC approval)
- INV-001 through INV-004, INV-010, INV-011, INV-012, INV-018, INV-019 all enforced

---

## TASK-009: Inter-Warehouse Transfers (Flow 4)

**Objective:** Transfer orders, 3PL transfers with hold/bulk tags.

**MUST READ:**
- `contracts/entities.yaml` (ENTITY-012)
- `contracts/workflows.yaml` (transfer_order_status)
- `contracts/invariants.yaml` (INV-016, INV-017)

**IN SCOPE:**
- Transfer order API: create, pick, load, dispatch, receive, complete
- Transfer types: NORMAL, HOLD_TAG, BULK_TAG
- 3PL inward register (DSR-3PL INWARD format)
- In-transit stock shown separately
- Batch traceability across warehouses
- Stock ledger entries (TRANSFER_OUT, TRANSFER_IN)

**ACCEPTANCE TESTS:**
- GS-003 passes (hold material transfer)
- GS-010 passes (3PL inward)
- INV-016 enforced (traceability)
- INV-017 enforced (hold tag transfer allowed)

---

## TASK-010: Maintenance Module (Flow 9)

**Objective:** Issue reporting, routing, resolution, verification.

**MUST READ:**
- `contracts/entities.yaml` (ENTITY-014)
- `contracts/workflows.yaml` (maintenance_ticket_status)

**IN SCOPE:**
- Maintenance ticket API: create, acknowledge, resolve, close, reopen
- Categories: DOOR, FORKLIFT, RACKING, ELECTRICAL, REFRIGERATION, PPE, OTHER
- Severity: LOW, MEDIUM, HIGH, CRITICAL
- CRITICAL escalation to plant head
- Status trail with timestamps
- Maintenance dashboard: open issues by severity/age/category

**ACCEPTANCE TESTS:**
- GS-006 passes (critical maintenance)

---

## TASK-011: Stock Ledger & Reports (Flow 8, 10)

**Objective:** Full transaction log, In-Out summary, Excel export, FIFO aging.

**MUST READ:**
- `contracts/entities.yaml` (ENTITY-015)
- `contracts/invariants.yaml` (INV-009)
- `docs/ARCHITECTURE_BLUEPRINT.md` Section 4 (SCREEN-010, SCREEN-011, SCREEN-013)

**IN SCOPE:**
- Stock ledger API: list (paginated, filterable)
- Stock ledger UI: table matching DSR SEPT-2026 columns
- In-Out summary: daily summary matching DSR IN-OUT sheet
- Excel export (SheetJS) in DSR format
- FIFO aging report: 0-30/31-60/61-90/90+ buckets
- Multi-warehouse stock view
- Append-only enforcement (no UPDATE/DELETE endpoint)

**ACCEPTANCE TESTS:**
- NS-007 passes (cannot DELETE ledger entry)
- INV-009 enforced
- Excel export matches DSR column structure
- Aging buckets correct

---

## TASK-012: Dashboard (Flow 10)

**Objective:** Warehouse Incharge dashboard with all 10 panels.

**MUST READ:**
- `docs/ARCHITECTURE_BLUEPRINT.md` Section 4 (SCREEN-001), Section 10

**IN SCOPE:**
- All 10 dashboard panels (D-01 through D-10)
- Real-time refresh (30s/60s intervals)
- Role-based dashboard variants
- Mobile-responsive stacking
- Mini rack map
- Recent stock ledger feed
- Color-coded indicators

**ACCEPTANCE TESTS:**
- Dashboard loads < 2s
- All panels show data
- Mobile stacking works
- Role variants correct

---

## TASK-013: FIFO Stock Maintenance (Flow 7)

**Objective:** FIFO logic, aging dashboard, compliance reporting.

**MUST READ:**
- `docs/ARCHITECTURE_BLUEPRINT.md` Section 5 (JOURNEY-001)

**IN SCOPE:**
- FIFO pick suggestion in pick list generation
- FIFO violation warning with override
- FIFO compliance report (% dispatches following FIFO)
- Stock aging dashboard with buckets
- Shelf-life awareness (FEFO configurable flag — not implemented in v1)

**ACCEPTANCE TESTS:**
- GS-007 passes (FIFO override)
- NS-008 passes (override without reason fails)

---

## TASK-014: Integration Tests & E2E

**Objective:** Run all golden scenarios and negative tests end-to-end.

**MUST READ:**
- `contracts/golden-scenarios.yaml` (all 10)
- `contracts/negative-tests.yaml` (all 20)

**IN SCOPE:**
- Playwright E2E tests for GS-001 through GS-010
- Playwright E2E tests for NS-001 through NS-020
- Test data setup/teardown
- CI pipeline integration

**ACCEPTANCE TESTS:**
- ALL golden scenarios pass
- ALL negative tests return expected errors
- CI pipeline runs all tests on PR

---

## TASK SEQUENCE (recommended order)

```
TASK-001 (scaffolding)
  ↓
TASK-002 (auth)
  ↓
TASK-003 (masters)
  ↓
TASK-004 (receiving sheet) ← CRITICAL PATH
  ↓
TASK-005 (putaway/rack map)
  ↓
TASK-006 (hold management) ← CRITICAL PATH
  ↓
TASK-007 (bulk management)
  ↓
TASK-008 (dispatch/loading) ← CRITICAL PATH
  ↓
TASK-009 (transfers)
  ↓
TASK-010 (maintenance)
  ↓
TASK-011 (stock ledger/reports)
  ↓
TASK-012 (dashboard)
  ↓
TASK-013 (FIFO)
  ↓
TASK-014 (integration tests)
```

**CRITICAL PATH:** Tasks 4, 6, 8 are the core business flows. These MUST be rock-solid.
