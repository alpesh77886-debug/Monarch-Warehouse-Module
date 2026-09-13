# IBF FG WAREHOUSE MODULE — CLAUDE CODE MEMORY FILE
## Project Context, Rules, and Implementation Guardrails
### This file is the primary Claude-facing execution contract; it does not override the canonical business source of truth.

---

## ⚠️ MANDATORY FIRST READ — READ THIS COMPLETELY BEFORE ANY CODE CHANGE

This is the master execution/control document. It contains:
1. What this project is
2. What is LOCKED (cannot change without human approval)
3. What technology stack is used
4. How to work on this codebase safely
5. What tests must pass
6. Where to find specifications

**If you are a new AI agent session, read this file FIRST. Do not load every project file by default; use the task-routing map below to open only what the active task needs.**

---

## 📋 PROJECT IDENTITY

| Field | Value |
|-------|-------|
| Project Name | IBF FG Warehouse Module (Iscon Balaji Foods) |
| Owner | Alpesh Parmar (alpesh77886@gmail.com) |
| Company | Iscon Balaji Foods Pvt. Ltd. — Asia's largest potato flakes manufacturer |
| Plant | Limbasi (primary), Sabarkantha/Himmatnagar, + 22 3PL cold storages |
| Purpose | Replace WhatsApp/paper/Excel FG warehouse operations with a digital system |
| Source Document | `docs/IBF_FG_Warehouse_Flow_Document_v3_FINAL_Complete.md` |
| Architecture | `docs/ARCHITECTURE_BLUEPRINT.md` (v1.1 active) |
| Package | v1.3 — Hybrid Architecture + Harness Package |
| Status | Architecture/harness handoff — application implementation pending |

---

## 🔒 LOCKED RULES — NEVER VIOLATE (without explicit human approval from Alpesh)

These are business-critical hard blocks. They come from the source flow document and are LOCKED.

### Business Invariants (INV-001 through INV-020)

**Harnessed rule:** these invariants are locked contracts. Do not weaken, rename, silently reinterpret, or remove them to make tests pass.

1. **HOLD material CANNOT be dispatched to party** — loading sheet generation must reject any non-OK status material
2. **REJECTED material CANNOT be dispatched** — same hard block
3. **QC HOLD (new inward) CANNOT be dispatched** — must be released first
4. **BULK material CANNOT be dispatched** — must be repacked first
5. **Only QC role (R04) can release a hold** — warehouse/production cannot self-release
6. **One pallet = one material** (no mixing materials on same pallet) — system must reject mixed pallets
7. **Pallet weight must not exceed material's configured limit** (e.g., 1000 kg) — system must block
8. **Receiving Sheet once LOCKED (dual-confirmed) is immutable** — it is a legal document
9. **Stock Ledger is APPEND-ONLY** — never UPDATE or DELETE a ledger entry
10. **FIFO violation requires logged override with reason** — no silent FIFO bypass
11. **Gate pass required for every vehicle exit**
12. **Loading sheet required for every vehicle loading**
13. **Receiving Sheet requires dual confirmation** (packing side + warehouse side) before lock
14. **Status values are FIXED enums** — no free text for material status (fixes DSR remark chaos)
15. **Hold reason from fixed dropdown** (20 predefined reasons) — no free text except "Other" with supervisor approval
16. **Batch traceability must be preserved across warehouse transfers**
17. **Hold materials CAN transfer to 3PL with hold tag** — receiving 3PL must re-inspect
18. **Export containers need QC approval before loading** ("Ok for loading" required)
19. **Temperature at loading must be recorded** for cold chain compliance
20. **SAP storage location ≠ physical location** — both must be maintained separately

### Locked Design Decisions

| Decision | Detail |
|----------|--------|
| Module independence | This module is STANDALONE — no integration with Production/Quality/Maintenance/Store Register modules in v1 |
| No scanning in v1 | Barcode/QR scanning deferred — data model supports it for future |
| Excel export | Stock ledger must export in DSR Excel format (SEPT-2026 sheet columns) |
| Status as enum | Material status is a fixed dropdown — never free text |
| Batch format | `L` + Year(2) + Month(letter A-L) + Day(2) + Sequence(3-4 digits) |
| Location format | `CR + Room + Block + Position + Floor` (e.g., CR1-01-A-4) |
| FIFO basis | Production date derived from batch number — NOT inward date |
| Hold is status-based | No physical movement on hold — material stays where it is |

---

### TASK-ROUTING MAP — KEEP CONTEXT SMALL

Claude Code must **not** read the whole repository at the start of every task. After this master contract, load only the smallest relevant set:

| Task | Read next | Usually not needed |
|---|---|---|
| TASK-001 setup/schema | `docs/IMPLEMENTATION_SPEC.md`, `docs/BACKEND_STACK.md`, `contracts/entities.yaml`, `contracts/invariants.yaml`, `contracts/permissions.yaml` | UI/reference, unrelated flows |
| Auth/RBAC | `docs/IMPLEMENTATION_SPEC.md`, `docs/ARCHITECTURE_BLUEPRINT.md` auth section, `contracts/permissions.yaml`, relevant negative tests | Receiving/storage details |
| Receiving/inward | relevant flow section, `contracts/workflows.yaml`, `contracts/entities.yaml`, `contracts/invariants.yaml`, `contracts/screens.yaml`, relevant golden/negative tests | Dispatch/transfer sections unless linked |
| Storage/putaway | relevant flow section, `contracts/entities.yaml`, `contracts/workflows.yaml`, `contracts/invariants.yaml`, `contracts/screens.yaml` | Outward details |
| Holds/QC | relevant flow section, `contracts/workflows.yaml`, `contracts/permissions.yaml`, `contracts/invariants.yaml`, hold negative tests | Unrelated UI |
| Bulk/repack | relevant flow section, `contracts/workflows.yaml`, `contracts/entities.yaml`, relevant golden/negative tests | Auth setup if unchanged |
| Outward/dispatch | relevant flow section, `contracts/workflows.yaml`, `contracts/permissions.yaml`, `contracts/invariants.yaml`, `contracts/screens.yaml`, dispatch tests | Unrelated masters |
| Transfers/3PL | relevant flow section, `contracts/workflows.yaml`, `contracts/entities.yaml`, `contracts/permissions.yaml`, transfer tests | UI unrelated to transfers |
| Ledger/reports | relevant flow section, `contracts/entities.yaml`, `contracts/invariants.yaml`, `contracts/screens.yaml`, export requirements | Receiving UI |
| Mobile UI | `contracts/mobile.yaml`, `contracts/screens.yaml`, relevant screen section in architecture | Backend files not touched |
| Any bug/failure | failing test + owning contract + smallest relevant architecture section | Whole repository |

**Rule:** canonical flow first for business meaning; contracts next for exact machine rules; architecture next for implementation shape; tests next for acceptance. Read broader material only when the task is cross-module.

## 🛠️ TECHNOLOGY STACK

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14+ (App Router, TypeScript) | UI, pages, components |
| Backend | Next.js API Routes (Edge Runtime) | API endpoints, business logic |
| Database | Cloudflare D1 (serverless SQLite) | All data storage — materials, pallets, locations, transactions |
| ORM | Drizzle ORM (drizzle-orm/d1) | TypeScript database queries — replaces raw SQL |
| Auth | Clerk | Login, logout, user management, roles, session management |
| File Storage | Cloudflare R2 | Photo uploads (future), Excel exports, documents |
| Hosting | Cloudflare Pages | Frontend + API routes deployed on Cloudflare edge |
| Charts | Recharts | Dashboard visualizations |
| Export | SheetJS (Excel) | DSR format Excel export |
| Offline | PWA + Service Worker (deferred) | Cold storage connectivity resilience |
| Testing | Vitest + React Testing Library + Playwright | Unit, integration, E2E tests |
| Styling | Tailwind CSS | Responsive design, cold-storage-friendly UI |

### Backend Data Flow (kya kahan save hota hai):
```
User Input → Next.js API Route → Drizzle ORM → Cloudflare D1 (database)
                                              ↕
                                     Stock Ledger (append-only table)

File Upload → Next.js API Route → Cloudflare R2 (file storage)
                                 → R2 URL saved in D1 database

Login → Clerk (handles authentication) → JWT token → API verifies token
Logout → Clerk (clears session) → Redirect to login page
```

**If this stack changes, update this file IMMEDIATELY.**

---

## 📁 REPOSITORY STRUCTURE

```
ibf-fg-warehouse/
├── CLAUDE.md                          ← THIS FILE (memory)
├── README.md                          ← Project overview
├── docs/
│   ├── IBF_FG_Warehouse_Flow_Document_v3_FINAL_Complete.md  ← SOURCE OF TRUTH (business)
│   ├── ARCHITECTURE_BLUEPRINT.md      ← System design
│   ├── IMPLEMENTATION_SPEC.md         ← Bounded tasks
│   ├── HARNESS_ENGINEERING.md         ← Enforcement rules
│   ├── BACKEND_STACK.md              ← Login/Data/Files — kya kahan save hota hai
│   └── GITHUB_SETUP_GUIDE.md          ← Repo setup
├── contracts/
│   ├── entities.yaml                  ← Domain entities
│   ├── permissions.yaml               ← Role/action matrix
│   ├── workflows.yaml                 ← State machines
│   ├── invariants.yaml                ← Business rules
│   ├── screens.yaml                   ← Screen contracts
│   ├── golden-scenarios.yaml          ← Acceptance scenarios
│   ├── negative-tests.yaml            ← Adversarial tests
│   └── evaluation-rubric.yaml         ← Evaluation criteria
├── drizzle/
│   ├── schema.ts                      ← Database schema (Drizzle ORM)
│   ├── migrations/                    ← SQL migration files for D1
│   └── seed.ts                        ← Seed data (materials, warehouses, SAP codes, statuses)
├── wrangler.toml                      ← Cloudflare config (D1 binding, R2 binding, env vars)
├── src/
│   ├── app/                           ← Next.js App Router pages
│   │   ├── (auth)/                    ← Clerk handles login UI, this is callback/sign-in page
│   │   ├── dashboard/
│   │   ├── inward/receiving-sheet/
│   │   ├── storage/rack-map/
│   │   ├── holds/
│   │   ├── bulk/
│   │   ├── outward/
│   │   ├── transfers/
│   │   ├── maintenance/
│   │   ├── stock/ledger/
│   │   └── masters/
│   ├── app/api/                       ← API routes
│   │   ├── auth/                      ← Clerk webhook + user sync
│   │   ├── receiving-sheets/
│   │   ├── pallets/
│   │   ├── locations/
│   │   ├── holds/
│   │   ├── transfers/
│   │   ├── loading-sheets/
│   │   ├── maintenance/
│   │   ├── stock/
│   │   └── masters/
│   ├── lib/
│   │   ├── auth.ts                    ← Clerk session + role + permission helpers
│   │   ├── db.ts                      ← Drizzle ORM D1 connection
│   │   ├── validations/               ← Zod schemas
│   │   ├── business-rules/            ← Hard block enforcement
│   │   │   ├── dispatch-guard.ts      ← INV-001 to INV-004
│   │   │   ├── pallet-guard.ts        ← INV-006, INV-007
│   │   │   ├── hold-guard.ts          ← INV-005
│   │   │   └── fifo-guard.ts          ← INV-010
│   │   └── audit.ts                   ← Stock ledger writer
│   └── components/                    ← Shared UI components
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── .github/
    └── workflows/
        └── ci.yml                     ← CI pipeline
```

---

## 👥 ROLES (for permission checks)

| Role ID | Role | Key Permission |
|---------|------|---------------|
| R01 | Warehouse Executive | Create/confirm receiving sheets, create loading sheets |
| R02 | Warehouse Operator | Putaway, moves, pick confirmation |
| R03 | Warehouse Incharge | Full dashboard, transfers, FIFO override |
| R04 | QC Lab Officer | Place/release hold, export approval, reject |
| R05 | QC Head | Escalation, bulk release |
| R06 | Packing Supervisor | Confirm receiving (packing side) |
| R07 | Packing Operator | Confirm receiving (packing side) |
| R08 | Production Executive | Hold acknowledgment, re-inspection request |
| R09 | Logistics Coordinator | Dispatch orders, transfers, pick lists |
| R10 | Security/Gate | Gate pass verification |
| R11 | Maintenance Technician | Resolve maintenance tickets |
| R12 | Admin | Masters, users, system config |

**Full permission matrix: `contracts/permissions.yaml`**

---

## 🧭 HARNESS CONTROL — MANDATORY AGENT OPERATING RULES

## MASTER CONTROL PLANE — READ THIS FIRST

This document is the Claude-facing execution contract for the Warehouse module. It does **not** override the locked business source of truth. Its job is to convert the canonical requirements into a deterministic, auditable implementation process.

### Source-of-truth split
- Business truth: `docs/IBF_FG_Warehouse_Flow_Document_v3_FINAL_Complete.md`
- Architecture truth: `docs/ARCHITECTURE_BLUEPRINT.md`
- Contract truth: `contracts/*.yaml`
- Task truth: `docs/IMPLEMENTATION_SPEC.md`
- Harness truth: `docs/HARNESS_ENGINEERING.md` + `.claude/` + `scripts/harness/`
- Implementation truth: actual repository code, tests, database behavior, deployment/runtime evidence
- Reference-only: `reference/IBF_FG_Warehouse_Frontend_Design_v5.html`

### Agent authority boundary
Claude Code is an implementation agent, not the business owner. It may execute bounded work that is explicitly supported by the source documents. It may not invent missing business rules or silently resolve conflicts. Human approval is required for locked-rule changes, scope expansion, paid/billing actions, and the 10-loop continuation gate.

### Standard execution loop
`READ → TRACE → PLAN → TEST → IMPLEMENT → VERIFY → EVIDENCE → COMMIT → STOP`

Every change must be traceable to a bounded task and applicable contract IDs.

### 1) Ten-loop human checkpoint
A **loop** means one completed Claude Code work turn that reaches the `Stop` lifecycle event. The project harness persistently counts these loops. After **10 loops**, the next loop is locked until Alpesh explicitly grants another block of work.

At the 10-loop checkpoint Claude Code MUST:
- report what was completed, what remains, tests/evidence obtained, and blockers;
- STOP starting further work;
- ask Alpesh for permission to continue;
- wait for the exact human approval token: `APPROVE_NEXT_10_LOOPS`.

The repository-level Claude Code hooks enforce this checkpoint through `.claude/settings.json` and `scripts/harness/`. Do not delete, disable, bypass, or rewrite those hooks without explicit human approval.

### 1A) Mandatory 10-loop checkpoint report
At the end of every tenth loop, the agent must produce a human-readable checkpoint containing:
- loops completed and current harness state
- tasks/features completed
- files changed
- tests executed and pass/fail results
- backend/database/API evidence obtained
- browser/E2E evidence obtained where applicable
- known gaps, blockers, and pending human decisions
- exact proposed next bounded task(s)
- statement confirming no paid action was taken

The agent must then STOP. No implementation work for the next block may begin until the user sends exactly `APPROVE_NEXT_10_LOOPS`.

### 1B) Approval token is not scope expansion
`APPROVE_NEXT_10_LOOPS` authorizes another ten-loop work window only. It does not authorize business-rule changes, new integrations, paid resources, or out-of-scope work. Those require their own explicit approval.

### 2) Free-only / payment safety
The project is **FREE-ONLY by default**. Claude Code must never purchase, subscribe, upgrade, add paid credits, enable a paid resource, buy a domain, or enter billing without explicit approval from Alpesh for that specific action.

Any payment/billing-related tool action is intercepted by the project safety hook and requires a human permission prompt. Do not treat a provider's free-tier assumption as proof that a paid action is safe.

### 2A) Payment safety interpretation
Treat the following as gated actions: entering billing details, enabling a paid feature/resource, changing plan, purchasing credits, registering/purchasing a domain, accepting a charge, or any action that could create a billable obligation. If uncertain whether an action can incur cost, STOP and ask for human approval rather than assume it is free.

### 3) Mobile-first frontend
The supplied `reference/IBF_FG_Warehouse_Frontend_Design_v5.html` is a **visual/reference artifact only**. The deliverable is a **mobile-first Next.js web application**, not a desktop-only UI and not a proof that the HTML itself works.

Minimum frontend verification:
- 320, 360, 390, and 430px phone widths;
- 768px tablet width;
- portrait and landscape where applicable;
- touch targets >= 48×48px;
- no horizontal scroll on primary workflows;
- sticky primary CTA for data-entry flows on phone;
- large glove-friendly controls and numeric input modes for quantity/temperature;
- loading, empty, error, and permission-denied states.

### 4) Protected package truth
The following are protected design/contract artifacts and must remain hash-stable unless Alpesh explicitly approves a change:
`CLAUDE.md`, `docs/BACKEND_STACK.md`, `docs/ARCHITECTURE_BLUEPRINT.md`, `docs/IMPLEMENTATION_SPEC.md`, `docs/HARNESS_ENGINEERING.md`, `contracts/*.yaml`, `docs/IBF_FG_Warehouse_Flow_Document_v3_FINAL_Complete.md`, and `reference/IBF_FG_Warehouse_Frontend_Design_v5.html`.

Run `npm run harness:integrity` after scaffolding exists and before declaring a task or release complete.

### 5) Harness failure means STOP
If a harness gate fails, do not weaken the rule, delete the test, change the expected result, or bypass the hook. Record the failure, identify root cause, fix the smallest safe layer, and add/retain regression coverage.

## 🧪 TESTING REQUIREMENTS

### Before ANY merge to main:
1. `npm run build` — must succeed with zero errors
2. `npm run test` — all unit + integration tests pass
3. `npm run test:e2e` — all golden scenarios pass
4. `npm run lint` — zero lint errors
5. No console.log() in production code (use proper logging)
6. No TODO/FIXME without a linked issue

### Critical test files (must ALWAYS pass):
- `tests/unit/business-rules/dispatch-guard.test.ts` — hard blocks
- `tests/unit/business-rules/pallet-guard.test.ts` — pallet constraints
- `tests/integration/golden-scenarios/*.test.ts` — all 10 scenarios
- `tests/integration/negative-tests/*.test.ts` — all 20 adversarial tests

---

## 🚦 HOW TO WORK ON THIS CODEBASE (for AI agents)

### Before starting any task:
1. Read `CLAUDE.md` and this master contract (this file)
2. Identify the exact bounded task in `docs/IMPLEMENTATION_SPEC.md`
3. Use the TASK-ROUTING MAP above; read only relevant source/contract files
4. Check the current branch and actual code state

### When implementing a feature:
1. Find the bounded task in `docs/IMPLEMENTATION_SPEC.md`
2. Check what is IN SCOPE and OUT OF SCOPE
3. Implement according to the screen contract and API contract
4. Write tests FIRST, then implement
5. Run all tests before committing
6. Ensure all hard blocks (INV-001 to INV-004) are enforced server-side

### When you encounter ambiguity:
1. Check the source flow document first
2. Check the architecture blueprint
3. Check the contract YAML files
4. If still unclear — STOP and note it in `docs/PENDING_ITEMS.md` — do NOT guess

### When you find a bug or contradiction:
1. Create an issue in GitHub describing it
2. Add label `bug` or `spec-conflict`
3. Do NOT silently reinterpret the architecture
4. If spec conflict: note in issue, wait for human decision

### Never do:
- ❌ Never modify locked rules without Alpesh's explicit approval
- ❌ Never make UI-only security (all permission checks server-side)
- ❌ Never allow free-text status values
- ❌ Never UPDATE or DELETE stock ledger entries
- ❌ Never skip dual confirmation on receiving sheets
- ❌ Never dispatch non-OK materials (loading sheet must hard-fail)
- ❌ Never mix materials on a pallet
- ❌ Never exceed pallet weight limits
- ❌ Never create a second source of truth (all authoritative operational data lives in Cloudflare D1; files belong in R2)
- ❌ Never bypass the 10-loop human checkpoint
- ❌ Never perform a payment/upgrade/billing action without explicit Alpesh approval
- ❌ Never disable or mutate the project harness to make CI/tests pass

---

## 🧰 REQUIRED HARNESS COMMANDS AFTER SCAFFOLDING

The implementation repo should expose these package scripts (or equivalent commands):
- `npm run harness:contracts` → contract guard
- `npm run harness:static` → structural guard
- `npm run harness:integrity` → protected-file integrity
- `npm run test:negative` → all 20 negative tests
- `npm run test:e2e` → all golden scenarios

## 🔄 GIT WORKFLOW

```
main (protected — only via PR from develop)
  ↑
develop (integration branch)
  ↑
feature/TASK-XXX-description (work branches)
```

- Always work on a feature branch from `develop`
- PR to `develop` requires: passing CI + code review
- PR to `main` requires: passing CI + human review (Alpesh or designated reviewer)
- Never force-push to `main` or `develop`
- Commit message format: `TASK-XXX: description` or `FIX-XXX: description`

---

## 📊 PROJECT STATUS TRACKING

Check `docs/PROGRESS.md` for current status of all implementation tasks. Update it after completing any task.

| Task Area | Status |
|-----------|--------|
| Project setup + database schema | Pending |
| Auth + roles | Pending |
| Masters (material, warehouse, SAP, status) | Pending |
| Receiving Sheet flow | Pending |
| Putaway + Rack Map | Pending |
| Hold Management | Pending |
| Bulk Management | Pending |
| Dispatch + Loading Sheet | Pending |
| Transfers (3PL) | Pending |
| Maintenance | Pending |
| Stock Ledger + Reports | Pending |
| Dashboard | Pending |

---

## 🤝 HANDOFF PROTOCOL (for future AI sessions)

If you are a new AI agent (Claude Code session, ChatGPT, or other) picking up this project:

1. **Read this file completely** — you now know the project context
2. **Read `docs/PROGRESS.md`** — you know what's done and what's pending
3. **Read the task you're assigned** from `docs/IMPLEMENTATION_SPEC.md`
4. **Check `git log --oneline -20`** — you know recent changes
5. **Check open issues** — you know known problems
6. **Ask Alpesh** if anything is still unclear

**Memory rules:**
- After completing a task: update `docs/PROGRESS.md` + commit
- After making an architectural decision: update this CLAUDE.md + `docs/ARCHITECTURE_BLUEPRINT.md`
- After discovering a spec conflict: create GitHub issue + update `docs/PENDING_ITEMS.md`
- Keep this file as the single entry point — never let it become stale

---

## 📞 ESCALATION

When to stop and escalate to Alpesh:
- Any spec conflict that affects business meaning
- Any change to locked rules
- Security vulnerabilities
- Data migration decisions
- Technology stack changes
- Performance degradation beyond targets

---

*Last updated: 2026-09-12 by Architect Agent (Sarvam)*
*Next review: After first implementation milestone*


---

## HYBRID PACKAGE OPERATING CHECKLIST

Before each implementation task:
1. Read this master contract.
2. Read the canonical flow section and relevant contracts.
3. Confirm bounded task, scope, invariants, permissions, and acceptance tests.
4. Inspect actual code and current branch state.
5. Write/extend tests before behavior changes where practical.
6. Implement server-side enforcement first for critical business rules.
7. Verify unit + integration + adversarial + E2E + harness gates applicable to the task.
8. Capture evidence before declaring completion.
9. Update `docs/PROGRESS.md`.
10. Commit using the required message convention.
11. Respect the 10-loop and free-only human gates.

### Final release rule
A module is not production-ready until requirements, implementation, backend behavior, authorization, adversarial behavior, concurrency/idempotency where applicable, failure/recovery, auditability, mobile execution, deployment/runtime behavior, regression status, and evidence traceability are all verified at the appropriate evidence level. Missing evidence is **NOT VERIFIED**, not PASS.
