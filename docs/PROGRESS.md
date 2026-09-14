# Project Progress Tracker
## IBF FG Warehouse Module
## Last updated: 2026-09-14 (Loop 13 checkpoint)

## Reading this document's "loop" numbering (PEN-016 clarification)

Two different, non-interchangeable counters both use the word "loop" in this project - do not conflate them:

- **`.harness/loop-state.json`'s `completed_loops`** is a raw, mechanical counter incremented once per Claude Code turn that reaches the Stop hook - by the harness engineering documentation's own stated definition ("a loop is one Claude Code work turn reaching Stop"). It increments on every turn, including pure report/clarification turns with zero engineering work, and it is not, and cannot be, aware of what work (if any) happened in that turn. Verified behavior, unmodified: tests/unit/harness-loop-gate.test.ts.
- **The "Loop N" numbering used in this document's checkpoint tables and in commit messages** (Loop 1, Loop 2, ... ) is a human-facing, task-oriented count of bounded engineering units, each with its own objective/commit/evidence. This is the number that answers "how much of the approved batch is done."

**These two numbers will not match**, because a single approved engineering "Loop N" can span multiple Claude Code turns (a paused loop awaiting a decision, a forensic-review turn, an evidence-supplement turn, etc. all increment the raw counter without being their own engineering loop). Treat the checkpoint tables below - not the raw `completed_loops` value - as authoritative for "how many approved loops have been completed."

## Architecture Status: ✅ v1.1 (Cloudflare D1 + Clerk stack approved by Alpesh)
## Harness Package: ✅ v1.3 — executable loop/payment/integrity controls added; implementation remains pending

## Tech Stack: LOCKED
- Database: Cloudflare D1 (serverless SQLite)
- Auth: Clerk (managed, role-based R01-R12)
- ORM: Drizzle ORM
- File Storage: Cloudflare R2
- Hosting: Cloudflare Pages
- Frontend: Next.js 14+ (TypeScript, Tailwind CSS)

## Task Status

| Task | Description | Status | Completed On | Notes |
|------|-------------|--------|-------------|-------|
| TASK-001 | Project Scaffolding + D1 Schema + Clerk | 🟨 Partial | Loops 2-9 | Next.js/TS/Tailwind scaffold, core 6-entity schema, local D1 migration verified, Clerk stub scaffold all done. NOT done: remaining 10 entities (PEN-014), real cloud D1/R2/Clerk resources, seed script |
| TASK-002 | Clerk Auth + Roles | 🟨 Partial | Loop 9 | Middleware/provider/role-check utility scaffolded in stub mode; real account, webhook sync, and Clerk-dashboard role setup still pending (PEN-010) |
| TASK-003 | Masters CRUD | ⬜ Pending | - | Needs material seed data |
| TASK-004 | Receiving Sheet Flow | ⬜ Pending | - | CRITICAL PATH |
| TASK-005 | Putaway + Rack Map | ⬜ Pending | - | Needs location grid |
| TASK-006 | Hold Management | ⬜ Pending | - | CRITICAL PATH |
| TASK-007 | Bulk Management | ⬜ Pending | - | - |
| TASK-008 | Dispatch + Loading Sheet | ⬜ Pending | - | CRITICAL PATH |
| TASK-009 | Inter-Warehouse Transfers | ⬜ Pending | - | - |
| TASK-010 | Maintenance Module | ⬜ Pending | - | - |
| TASK-011 | Stock Ledger + Reports + R2 Export | ⬜ Pending | - | - |
| TASK-012 | Dashboard | ⬜ Pending | - | - |
| TASK-013 | FIFO Stock Maintenance | ⬜ Pending | - | - |
| TASK-014 | Integration Tests + E2E | ⬜ Pending | - | After all features |

## Loop 1 Status — Governance Commit (Boss-approved)

- Governance package (execution contract, business docs, machine-readable business contracts, harness scripts and hooks, CI workflow, visual-reference HTML) copied into this repository on branch `claude/monarch-warehouse-readiness-ug8flp`.
- README merged (original one-liner preserved, package status/rules content added).
- Harness checks executed against this actual repository (not the ZIP): contract check PASS, YAML lexical check PASS (9 contract files), static architecture check NOT APPLICABLE (no application source yet, as expected at this stage), protected-file integrity check PASS.
- Package self-integrity check: 1 expected/intentional mismatch — README.md (content deliberately merged this loop, per approved scope). All other tracked files match their recorded hashes.
- SKFG material-code wording correction (approved for the architecture blueprint document): **NOT applied this loop.** The moment the harness hooks went live in this repository, the project's own protected-file-mutation control denied the edit attempt on that guarded file, because it is one of the explicitly protected paths. This is the harness behaving as designed; it was not bypassed or weakened. Applying this specific one-line correction now needs a change process outside Claude Code's own tool-mediated edits (e.g. a direct edit by Alpesh, or an explicit, separately-approved exception to that guard for this one change).
- No application code, no `package.json`, no database, no cloud account action, and no billing-adjacent action of any kind occurred this loop.

## Loops 2-10 Checkpoint (window 1, Boss-approved batch)

| Loop | Objective | Commit | Result |
|---|---|---|---|
| 2 | Next.js/TypeScript/Tailwind scaffold | `8e210e9`, `9fa1d36` | Done. Paused mid-loop for a P0 security finding (Next.js CVEs); Boss chose Option A (accept, re-check before deployment) |
| 3 | HTML design-token + component extraction | `7c4d4e5` | Done. Tokens + component inventory documented, no components built yet |
| 4 | Mobile-first App Shell | `2ee2dba` | Done. Real Tailwind breakpoints, not the reference file's scale-transform |
| 5 | Entity dependency/relation map | `d40b0f7` | Done. Found and recorded PEN-014 (10 of 16 entities lack a formal contract) instead of guessing |
| 6 | Reviewed core Drizzle schema slice | `65466ba` | Done. 6 contract-defined entities + minimal warehouses table; DB-level CHECK constraints including the SKFG-rejecting material-code prefix check |
| 7 | Local D1 migration + tests | `98bf8b3` | Done. Migrations applied to local D1 only; manually verified SKFG rejection and stock_ledger append-only triggers against a real local D1 engine, plus an automated Vitest regression suite (5/5 pass) |
| 8 | Actual-repo harness integration + execution | `0e84207` | Done. All 5 harness scripts re-run against this repo; static-guard now genuinely applicable and passes. Found PEN-015 (harness-script npm-alias blocked by the protected-file hook) instead of routing around it |
| 9 | Clerk auth architecture/scaffold | `e3358b2` | Done. Stub mode only, zero real Clerk account/keys. Found and resolved a real compatibility conflict (latest @clerk/nextjs needs Next 15/16) by pinning to the newest Next-14-compatible release |
| 10 | Regression + evidence + checkpoint | (this commit) | Full regression re-run clean; this checkpoint |

**No paid action occurred in any of loops 2-10. No cloud account, D1/R2/Clerk resource, or deployment action was performed — everything above is local-only or npm-registry installs.**

## Blockers
| ID | Blocker | Impact | Resolution |
|----|---------|--------|-----------|
| PEN-007 | Material master seed data | Blocks TASK-003 | Need DSR FG CODE sheet from Alpesh |
| PEN-008 | Warehouse location grid config | Blocks TASK-005 | Need exact CR1/CR2 grid |
| PEN-009 | Real Cloudflare D1/R2 resources | Blocks real deployment | Cloudflare connector is connected, but no D1 database or R2 bucket has been created for this project pending explicit approval |
| PEN-010 | Real Clerk application/keys | Blocks real login testing | Alpesh to create the Clerk app; code already scaffolded in stub mode |
| PEN-012 | Approved SKFG wording correction (architecture blueprint doc) still cannot be applied via a normal edit | Cosmetic-doc only, does not block schema/code (schema enforces the rule at the DB level already) | The repository's own protected-file guard denies edits to that document; needs a human-applied or separately-approved exception process |
| PEN-013 | Dev-dependency known-CVE risk (Next.js, vitest/vite/esbuild chain) | Accepted risk for pre-deployment stage | Boss-approved Option A; must be re-resolved before any real deployment |
| PEN-014 | 10 of 16 domain entities lack a formal machine-readable contract | Will block TASK-004/006/007/008/009/010 when they start | Needs formal contract entries before those tasks begin |
| PEN-015 | Harness scripts cannot be aliased as package.json npm scripts | Cosmetic only — scripts still run directly | Protected-file hook false positive; not fixed or routed around per instruction |

## Loops 11-20 Checkpoint (window 2, Boss-approved batch "APPROVE LOOPS 11-20")

Loop numbers below are the human-facing, task-oriented count (per the PEN-016 note above), matching commit-message titles. Several loops carry a "(resequenced from N)" label because an earlier loop in this window hit a genuine structural blocker (not missing evidence) and the batch moved to the next independent objective rather than halting - each resequencing is called out inline in that loop's own commit and PENDING_ITEMS entry, never silently.

| Loop | Objective | Commit | Result |
|---|---|---|---|
| 11 | Dependency/CVE forensic review + security baseline | `0c01e03` | Done. Full CVE inventory by runtime surface in docs/SECURITY_BASELINE.md; re-confirmed PEN-013's `next@14.2.35` residual risk (Boss Option A) still current, no safe in-line fix exists |
| 12 | Contract completion for highest-priority PEN-014 entities | `cfb9d8b` | **Blocked, resequenced.** A new file inside the contract folder was denied by the protected-file governance hook - working as designed, not a false positive. Recorded as PEN-017; ready-to-apply YAML staged instead in docs/PROPOSED_CONTRACTS_PEN014.md, pending a Boss decision on how to apply it |
| 13 | Harness loop-state semantics investigation (resequenced from 14, since 13 itself was blocked by PEN-017) | `a65b59d` | Done. Read the loop-gate script directly; added tests/unit/harness-loop-gate.test.ts (4 tests) proving the raw `completed_loops` counter's real semantics; closed as PEN-016 VERIFIED |
| 14 | Material master + Status/SAP-code seed-data architecture (resequenced from 15) | `13d3b12` | Done. Statuses (10 rows) and SAP codes (45 rows) seeded from verified canonical Appendix D source data (tests/unit/seed-data.test.ts, 9 tests); Material Master itself stays a validated loader interface only - no source file exists yet (PEN-007 still IN PROGRESS). Found and recorded PEN-018 (Appendix D.6 24-vs-25 count mismatch; missing SALES sap_code type) |
| 15 | Warehouse location-grid architecture (resequenced from 16) | `26d5e3e` | Done. Deterministic rack/floor-staging grid generator (drizzle/seed/location-grid.ts) using deliberately fake identifiers, never the real 36-block shape, since the flow document itself says the real grid has unenumerated exceptions; found and fixed a genuine missing unique constraint on `locations.full_code` along the way (migration 0003, tested against a real duplicate-rejection case) |
| 16 | Auth/RBAC hardening in stub/local mode (resequenced from 17) | `b7ec850` | Done. src/lib/permissions.ts (full R01-R12 matrix, R05 inheritance, R12 wildcard), requirePermission() in src/lib/auth.ts, src/lib/clerk-config.ts (fails loudly on a half-configured Clerk env instead of guessing). 21 new tests, all Clerk calls mocked - zero live Clerk session used or possible |
| 17 | Core pallet-status workflow, contract-bounded (resequenced from 18) | `2a96f26` | Done. src/lib/workflows/pallet-status.ts implements only the already-fully-contracted `pallet_status` state machine (workflows.yaml) over the already-contracted Pallet/Stock Ledger entities - the one slice of "core workflow" not blocked by PEN-014. 12 tests proving INV-001/003/004/005 by name plus role-gating on every transition. Receiving Sheet/Hold Record/Transfer Order/Loading Sheet/Maintenance Ticket remain blocked by PEN-014 |
| 18 | Browser/E2E verification of implemented scope (resequenced from 19) | `a5bdfbb` | Done. Added Playwright (`@playwright/test@^1.63.0`, devDependency only) plus tests/e2e/app-shell.spec.ts (9 tests) run against a real `next build && next start` on the pre-installed Chromium - see the Loop 18 evidence section below for the full command/output record |
| 19 | Full regression + traceability + release checkpoint (resequenced from 20 - the last loop of this window) | (this commit) | Done. Full command/output record in the Loop 19 evidence section below. **No Loop 21 will follow - this window stops completely per Boss's instruction.** |

**No paid action occurred in any of loops 11-19. No cloud account, D1/R2/Clerk resource, or deployment action was performed - everything above is local-only, npm-registry installs, or a local production build served on a local port for the E2E run.**

### Loop 18 evidence (Browser/E2E verification)

Implemented scope actually exercised (nothing beyond it was tested, since nothing beyond it exists yet): homepage (`/`), the mobile-first App Shell demo page (`/dashboard`), the stub-mode `/sign-in` and `/sign-up` pages, and Next.js's own 404 handling. Nav items pointing at not-yet-built screens (`/inward`, `/storage`, `/holds`, `/bulk`, `/outward`, `/transfers`, `/maintenance`, `/stock`, `/masters`, `/reports`) were intentionally not navigated to - at this scaffold stage they are placeholder links only (src/lib/nav-items.ts), and following them would 404 for "not built yet," which is not the same fact as the dedicated error-state test below.

Commands run, in order, with results:

1. `npm run typecheck` -> exit 0.
2. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm run test:e2e` -> **9/9 passed** (chromium, via `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, against a real `next build && next start -p 3100`):
   - homepage loads, shows the scaffold-stage heading
   - dashboard shell page loads, shows the page header
   - mobile (375x667): bottom nav visible, sidebar hidden, no horizontal scroll (`document.documentElement.scrollWidth <= window.innerWidth`)
   - mobile: all 5 bottom-nav links are >=48px-tall touch targets
   - mobile: exactly the 5 `primary: true` nav items appear in the bottom nav
   - desktop (1280x800, at the `lg` breakpoint): full sidebar with labels visible, bottom nav hidden, no horizontal scroll
   - `/sign-in` shows the Clerk-stub-mode message, not a live widget (auth boundary - no real Clerk keys exist)
   - `/sign-up` shows the Clerk-stub-mode message, not a live widget
   - an unknown route (`/this-route-does-not-exist-e2e-check`) returns HTTP 404 and renders Next.js's "This page could not be found" (error state)
3. `npm run build` -> exit 0, `next build` production build succeeds, 5 routes generated.
4. `npm test` (Vitest, unit suite) -> exit 0, **57/57 passed across 8 files** (unchanged from Loop 17 - Loop 18 added no unit-level code, only the E2E harness).
5. Harness checks: contract-guard PASS, static-guard PASS, protected-integrity PASS, yaml-lexical-guard PASS (9 contract files). The package-integrity check reports the same 4 pre-existing mismatches already recorded under PEN-015 (the harness loop-state file, README.md, this document, and docs/PENDING_ITEMS.md - all legitimate content that has evolved since the original file-manifest snapshot; a plain repository status check confirms those three docs carried no *new* uncommitted change from this loop beyond what this loop itself is now adding) - not a new regression.

Not tested (does not exist yet, so cannot be exercised): forms, data validation, real database interaction from the browser (no CRUD screens are built yet - PEN-014 still blocks Receiving Sheet/Hold Record/Transfer Order/Loading Sheet/Maintenance Ticket), and real Clerk authentication (still stub-only, per PEN-010).

### Loop 19 evidence (full regression + traceability + release checkpoint - final loop of this window)

Commands run, in order, with results:

1. `npm run typecheck` -> exit 0.
2. `npm run build` -> exit 0, 5 routes generated (`/`, `/_not-found`, `/dashboard`, `/sign-in/[[...sign-in]]`, `/sign-up/[[...sign-up]]`).
3. `npm test` (Vitest) -> exit 0, **57/57 passed across 8 files**.
4. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm run test:e2e` -> **9/9 passed** (re-confirmed unchanged from Loop 19's own commit).
5. `npm run lint` (`next lint`) -> **new finding, not silently resolved.** This script has existed in package.json since Loop 2 but no loop before this one had actually completed a run: `next lint` requires an interactive first-run ESLint setup prompt ("Strict" / "Base" / "Cancel") that has never been answered in this non-interactive environment, so the command exits 1 without linting anything. This is not a regression from this loop - it is a pre-existing gap surfacing for the first time because this is the first loop to actually invoke `npm run lint` as part of a full-regression pass. Not resolved here: choosing an ESLint preset is a tooling decision outside this loop's "run the existing checks and report" scope, and the STOP RULE calls for recording an ambiguous gap rather than guessing a config on Alpesh's behalf. Recorded as PEN-019.
6. Harness checks: all 4 guard scripts pass with the same result pattern as every prior loop in this window (contract, static, protected-file, and yaml-lexical checks all PASS; the package-integrity check shows the same 4 pre-existing mismatches already recorded under PEN-015, no new ones).
7. `npx wrangler d1 migrations list DB --local` -> "No migrations to apply!" - all 4 local migrations (0000-0003) are applied and the local D1 schema is current; no migration drift.
8. `npm audit` -> unchanged from Loop 11's security baseline: **9 vulnerabilities (5 moderate, 2 high, 2 critical)**, all against the pinned Next.js release and its build-tooling dependency chain (PEN-013, Boss-approved Option A), none newly introduced by any change in this window including the Playwright devDependency addition.
9. `git status` -> clean tree after this loop's own commit; `git log` shows 9 commits in this window.
10. Changed-file audit for this whole window (`git diff --stat` against the Loop-10 checkpoint commit): 36 files changed, 4071 insertions, 29 deletions - entirely new contract-bounded application code, tests, seed-data architecture, docs, and harness housekeeping; zero changes to any protected package document or the canonical business source.
11. Pending-item audit (PEN-007 through PEN-019): see docs/PENDING_ITEMS.md, unchanged conclusions from each item's own loop except PEN-019 (new, this loop). No item was closed without objective evidence; no item was silently dropped.

**No paid action occurred in this loop. No cloud account, D1/R2/Clerk resource, or deployment action was performed.**

## Architecture Decisions Log
| Date | Decision | Status |
|------|----------|--------|
| 2026-09-12 | Architecture Blueprint v1.0 created | SUPERSEDED |
| 2026-09-13 | Stack changed: Cloudflare D1 + Clerk + R2 + Drizzle | LOCKED (Alpesh approved) |
| 2026-09-13 | Architecture Blueprint v1.1 (D1 + Clerk) | ACTIVE |
