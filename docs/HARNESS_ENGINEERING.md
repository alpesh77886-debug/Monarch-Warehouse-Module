# IBF FG Warehouse Module — Harness Engineering Specification
## Enforcement Classes, CI Gates, and Evaluation Strategy
### Technology Stack: Cloudflare D1 + Clerk + R2 + Drizzle ORM + Next.js

---

## 0. HARNESS VERSION & EXECUTION CONTRACT

**Harness package version:** v1.3

The harness is not documentation-only. The repository package contains executable Claude Code hooks and deterministic Node scripts under `scripts/harness/`, plus project-level hook configuration under `.claude/settings.json`.

**Important limitation:** the harness can enforce project-level tool/turn controls and CI preconditions, but it cannot make an external human approve a payment; it can only force a permission prompt and block continuation until the human approves.

### Human-controlled 10-loop gate
- A loop is one Claude Code work turn reaching `Stop`.
- The Stop hook persists a counter in `.harness/loop-state.json`.
- At loop 10 the turn is allowed to end, but `permission_required=true` is persisted.
- The next user prompt is blocked unless it is exactly `APPROVE_NEXT_10_LOOPS`.
- Approval resets the block and starts the next 10-loop window.
- This is intentionally external to model instructions: Claude cannot self-authorize another block.

### Protected truth / integrity gate
The package includes a baseline hash manifest and runtime integrity script. Protected architecture/contracts/reference files are fail-closed if they are changed outside an approved update process.

### Free-only payment gate
A PreToolUse hook inspects tool inputs for purchase/billing/upgrade signals and returns `permissionDecision: "ask"`; destructive or protected-harness mutation attempts are denied. This is defense-in-depth, not a substitute for human judgment.

### Mobile acceptance gate
The frontend reference is non-authoritative for behavior. The implementation must satisfy architecture mobile requirements and browser-test the critical workflows at phone/tablet breakpoints.

---

## 1. ENFORCEMENT CLASS MODEL

Every critical rule is assigned an enforcement class:

| Class | Name | Meaning | Trust Level |
|-------|------|---------|-------------|
| H0 | HUMAN GOVERNANCE | Human must approve | Highest |
| H1 | AGENT INSTRUCTION | Claude Code must follow (in CLAUDE.md) | Low |
| H2 | AUTOMATED TEST | Repeatable test detects violation | Medium |
| H3 | STRUCTURAL / STATIC | Linter, schema check, CI rule rejects violation | High |
| H4 | RUNTIME | Running system rejects invalid action | Highest |
| H5 | HARNESS CONTROL | Agent runtime prevents unsafe continuation | Highest |

### Enforcement Class Assignment for All 20 Invariants

| Invariant | Class | Implementation |
|-----------|-------|----------------|
| INV-001 (No HOLD dispatch) | H4 + H2 | API guard (Drizzle query) + unit test |
| INV-002 (No REJECTED dispatch) | H4 + H2 | API guard + unit test |
| INV-003 (No QC_HOLD dispatch) | H4 + H2 | API guard + unit test |
| INV-004 (No BULK dispatch) | H4 + H2 | API guard + unit test |
| INV-005 (QC-only release) | H4 + H2 | Clerk role check + unit test |
| INV-006 (One pallet = one material) | H4 + H2 | API validation + unit test |
| INV-007 (Pallet weight limit) | H4 + H2 | API calculation + unit test |
| INV-008 (Locked sheet immutable) | H4 + H2 | API status check + integration test |
| INV-009 (Ledger append-only) | H3 + H4 + H2 | D1 SQLite trigger + no endpoint + test |
| INV-010 (FIFO override logged) | H4 + H2 | API validation + unit test |
| INV-011 (Gate pass required) | H4 + H2 | API validation + integration test |
| INV-012 (Loading sheet required) | H4 + H2 | API validation + integration test |
| INV-013 (Dual confirmation) | H4 + H2 | API validation + integration test |
| INV-014 (Status = enum only) | H3 + H4 + H2 | Drizzle enum (CHECK constraint) + test |
| INV-015 (Hold reason = enum) | H3 + H4 + H2 | Drizzle enum (CHECK constraint) + test |
| INV-016 (Batch traceability) | H4 + H2 | Ledger records + integration test |
| INV-017 (Hold tag transfer) | H4 + H2 | Transfer API + integration test |
| INV-018 (Export QC approval) | H4 + H2 | API validation + integration test |
| INV-019 (Temperature recorded) | H4 + H2 | API validation + integration test |
| INV-020 (SAP ≠ physical location) | H1 + H2 | Architecture review + data model test |

---

## 2. CI PIPELINE (GitHub Actions)

```yaml
name: CI
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [develop]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Harness contract preflight
        run: node scripts/harness/contract-guard.mjs

      - name: Protected-file integrity
        run: node scripts/harness/protected-integrity.mjs

      # STAGE 1: Static Analysis (H3)
      - name: Lint
        run: npm run lint

      - name: Type Check
        run: npx tsc --noEmit

      # STAGE 2: Unit Tests (H2)
      - name: Unit Tests
        run: npm run test
        env:
          D1_DATABASE_URL: ${{ secrets.TEST_D1_DATABASE_URL }}

      # STAGE 3: Invariant Tests (H2 — CRITICAL)
      - name: Invariant Tests
        run: npm run test:invariants

      # STAGE 4: Negative Tests (H2 — CRITICAL)
      - name: Negative Tests
        run: npm run test:negative

      # STAGE 5: Build
      - name: Build
        run: npm run build

  e2e:
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Start app
        run: npm run dev:test > /tmp/monarch-warehouse.log 2>&1 &
      - name: Wait for app
        shell: bash
        run: |
          for i in {1..60}; do
            if curl -fsS http://127.0.0.1:3000 >/dev/null 2>&1; then exit 0; fi
            sleep 1
          done
          echo 'Application did not become ready within 60 seconds.'
          tail -n 200 /tmp/monarch-warehouse.log || true
          exit 1
      - name: E2E Golden Scenarios
        run: npm run test:e2e
      - name: E2E Negative Tests
        run: npm run test:e2e:negative
```

---

## 2A. CHECKED-IN CI WORKFLOW

The package ships the authoritative GitHub Actions workflow at `.github/workflows/ci.yml`. The workflow always runs the harness preflight. Application-quality jobs become mandatory once `package.json` exists. This prevents the architecture package from being falsely green because application tests are merely absent while still allowing the pre-implementation repository to bootstrap cleanly.

The workflow must run:

1. package self-integrity
2. contract guard
3. mobile contract guard
4. protected-integrity guard
5. static guard
6. application test suite, invariants, negative tests, build, and E2E once implementation files exist

No CI job may weaken or skip a failing harness guard.

## 3. DATABASE-LEVEL ENFORCEMENT (H3 + H4)

### Stock Ledger Immutability (INV-009) — D1 SQLite Trigger

Cloudflare D1 supports SQLite triggers. This trigger prevents any UPDATE or DELETE on the stock_ledger table:

```sql
-- D1 migration: stock_ledger_append_only.sql
CREATE TRIGGER stock_ledger_no_update
  BEFORE UPDATE ON stock_ledger
  FOR EACH ROW
  BEGIN
    SELECT RAISE(ABORT, 'stock_ledger is append-only. UPDATE is not allowed.');
  END;

CREATE TRIGGER stock_ledger_no_delete
  BEFORE DELETE ON stock_ledger
  FOR EACH ROW
  BEGIN
    SELECT RAISE(ABORT, 'stock_ledger is append-only. DELETE is not allowed.');
  END;
```

### Status Enum Enforcement (INV-014, INV-015) — CHECK Constraints

D1 (SQLite) does not have native ENUM types like PostgreSQL. Instead, use CHECK constraints:

```sql
-- Status values enforced at database level
CREATE TABLE pallets (
  id TEXT PRIMARY KEY,
  status_code TEXT NOT NULL CHECK (
    status_code IN (
      'QC_HOLD', 'OK', 'HOLD', 'BULK', 'DISPATCHED',
      'IN_TRANSIT', 'CUSTOMER_SAMPLE', 'SAMPLE', 'REJECTED', 'SCRAP'
    )
  )
);

-- Hold reason enforced at database level
CREATE TABLE hold_records (
  id TEXT PRIMARY KEY,
  hold_reason TEXT NOT NULL CHECK (
    hold_reason IN (
      'HIGH_TEMPERATURE', 'METAL_PIECE_FOUND', 'THREAD_CONTAMINATION',
      'ENZYME_TEST_POSITIVE', 'UNEVEN_COATING_BELT_MARK', 'HIGH_DEFECTS_MAJOR',
      'DULL_APPEARANCE_COLOR_DIFF', 'SHORT_LENGTH', 'BLACK_PARTICLES',
      'WHITE_PATCHES', 'WRONG_BATCH_CODE', 'BATTER_BUBBLES',
      'CARTON_NOT_AVAILABLE', 'LOW_RETENTION_TIME', 'BAD_SMELL',
      'MISSHAPES', 'OVER_PRODUCTION_BULK', 'DEFECTIVE_FRIES_BULK',
      'TRIAL_SAMPLE', 'OTHER_REQUIRES_APPROVAL'
    )
  )
);
```

### Receiving Sheet Immutability (INV-008) — Application + DB Trigger

```sql
CREATE TRIGGER receiving_sheet_no_update_when_locked
  BEFORE UPDATE ON receiving_sheets
  FOR EACH ROW
  WHEN OLD.status = 'LOCKED'
  BEGIN
    SELECT RAISE(ABORT, 'LOCKED receiving sheets are immutable.');
  END;
```

---

## 4. API-LEVEL ENFORCEMENT (H4)

### Dispatch Guard (INV-001 through INV-004)

```typescript
// src/lib/business-rules/dispatch-guard.ts
import { db } from '@/lib/db';
import { pallets } from '@/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';

export async function validateDispatchPallets(palletIds: string[]) {
  const palletList = await db.select()
    .from(pallets)
    .where(inArray(pallets.id, palletIds));

  for (const pallet of palletList) {
    if (pallet.statusCode !== 'OK') {
      throw new ValidationError(
        `Cannot include ${pallet.statusCode} material in loading sheet. ` +
        `Pallet ${pallet.palletNumber} must be OK status.`
      );
    }
  }
  return palletList;
}
```

### QC-Only Hold Release (INV-005) — Clerk Role Check

```typescript
// src/lib/business-rules/hold-guard.ts
import { auth } from '@clerk/nextjs';

export async function releaseHold(holdId: string) {
  const { sessionClaims } = auth();
  const userRole = sessionClaims?.metadata?.role;

  if (userRole !== 'R04' && userRole !== 'R05') {
    throw new ForbiddenError(
      'Only QC Lab Officer (R04) or QC Head (R05) can release holds.'
    );
  }
  // ... proceed with release via Drizzle
}
```

### Pallet Weight Guard (INV-007)

```typescript
// src/lib/business-rules/pallet-guard.ts
export async function validatePalletWeight(palletId: string, additionalKg: number) {
  const pallet = await db.query.pallets.findFirst({
    where: eq(pallets.id, palletId),
    with: { material: true, batches: true }
  });

  if (!pallet) throw new NotFoundError('Pallet not found');

  const newTotal = pallet.totalWeightKg + additionalKg;
  if (newTotal > pallet.material.palletWeightLimitKg) {
    throw new ValidationError(
      `Pallet booked — ${pallet.material.palletWeightLimitKg} kg already loaded.`
    );
  }
}
```

### Clerk Middleware — Route Protection

```typescript
// src/middleware.ts
import { authMiddleware } from '@clerk/nextjs';

export default authMiddleware({
  publicRoutes: ['/sign-in', '/sign-up'],
  // All other routes require authentication
});

// Role-based protection in API routes:
// src/lib/auth.ts
import { auth } from '@clerk/nextjs';

export function requireRole(allowedRoles: string[]) {
  const { sessionClaims } = auth();
  const userRole = sessionClaims?.metadata?.role;

  if (!userRole || !allowedRoles.includes(userRole)) {
    throw new ForbiddenError(
      `Role ${userRole} is not authorized for this action. ` +
      `Required: ${allowedRoles.join(' or ')}`
    );
  }
  return userRole;
}

// Usage in API route:
// requireRole(['R04', 'R05']); // Only QC can release holds
```

---

## 5. TEST STRUCTURE (H2)

```
tests/
├── unit/
│   └── business-rules/
│       ├── dispatch-guard.test.ts      ← INV-001 to INV-004
│       ├── pallet-guard.test.ts        ← INV-006, INV-007
│       ├── hold-guard.test.ts          ← INV-005, INV-015
│       └── fifo-guard.test.ts          ← INV-010
├── integration/
│   ├── golden-scenarios/               ← GS-001 to GS-010
│   └── negative-tests/                 ← NS-001 to NS-020
└── e2e/
    ├── golden-scenarios/               ← Playwright E2E
    └── negative-tests/
```

### Test Commands (package.json):

```json
{
  "scripts": {
    "test": "vitest",
    "test:invariants": "vitest tests/unit/business-rules",
    "test:integration": "vitest tests/integration",
    "test:negative": "vitest tests/integration/negative-tests",
    "test:e2e": "playwright test tests/e2e/golden-scenarios",
    "test:e2e:negative": "playwright test tests/e2e/negative-tests",
    "db:migrate": "wrangler d1 migrations apply ibf-fg-warehouse --local",
    "db:seed": "tsx drizzle/seed.ts",
    "db:studio": "drizzle-kit studio"
  }
}
```

---

## 6. ARCHITECTURE RULE REGISTRY (H3)

| Rule ID | Rule | Detector | CI Behavior | Severity |
|---------|------|----------|-------------|----------|
| AR-001 | No raw SQL outside Drizzle ORM | ESLint import rule | Fail CI | CRITICAL |
| AR-002 | All API routes must use Clerk auth middleware | Route inspection | Fail CI | CRITICAL |
| AR-003 | No free-text status — must use CHECK-constrained values | Drizzle schema + type check | Fail CI | HIGH |
| AR-004 | Stock ledger writes only via audit.ts utility | Import boundary check | Fail CI | CRITICAL |
| AR-005 | No UI component makes direct DB queries | ESLint boundary rule | Fail CI | HIGH |
| AR-006 | Business rules live in src/lib/business-rules/ only | Directory check | Fail CI | HIGH |
| AR-007 | All mutations create ledger entries | Integration test | Fail test | CRITICAL |

---

## 6A. EXECUTABLE H3 / H5 CONTROL MAP

| Control | Executable implementation | Failure behavior |
|---|---|---|
| 10-loop checkpoint | `.claude/hooks/loop-stop-gate.mjs` + `scripts/harness/loop-gate.mjs` | Next user prompt blocked until `APPROVE_NEXT_10_LOOPS` |
| Payment safety | `.claude/hooks/pretool-safety.mjs` | Payment-like action requires human confirmation |
| Protected harness mutation | `.claude/hooks/pretool-safety.mjs` | Tool call denied |
| Project settings protection | `.claude/hooks/config-protection.mjs` | Config change blocked |
| Contract counts/IDs | `scripts/harness/contract-guard.mjs` | Non-zero exit / CI fail |
| Protected file integrity | `scripts/harness/protected-integrity.mjs` | Non-zero exit / STOP acceptance |
| Harness configuration / code integrity | `scripts/harness/protected-integrity.mjs` | Non-zero exit / acceptance block |
| Package self-integrity | `scripts/harness/package-integrity.mjs` | Non-zero exit |
| Static architecture scan | `scripts/harness/static-guard.mjs` | Non-zero exit / CI fail |

**Fail-closed principle:** a required control that cannot be executed is **NOT VERIFIED**, not PASS.

---

## 7. INDEPENDENT EVALUATOR PROTOCOL

The implementer (Claude Code) must NOT be the sole judge of correctness.

```
HUMAN (Alpesh) → approves → ARCHITECT (spec) → defines → CODING AGENT (Claude Code) → implements → INDEPENDENT EVALUATOR → verifies → HARNESS (CI + runtime)
```

### Evaluator checklist (run from a FRESH session):

1. Read `contracts/golden-scenarios.yaml` — run all 10 scenarios
2. Read `contracts/negative-tests.yaml` — attempt all 20 attacks
3. Read `contracts/invariants.yaml` — verify all 20 enforcement points
4. Read `contracts/permissions.yaml` — verify Clerk role checks
5. Check D1: stock_ledger trigger blocks UPDATE/DELETE
6. Check receiving sheet: LOCKED sheets are truly immutable
7. Check dispatch: non-OK materials cannot be loaded
8. Check Clerk: non-QC role gets 403 on hold release
9. Check FIFO: override requires logged reason
10. Check mobile: works at 320px

---

## 8. FEEDBACK LOOP — FIX THE HARNESS

```
FAILURE → ROOT CAUSE → HARNESS GAP → HARNESS IMPROVEMENT → NEW REGRESSION TEST
```

Questions:
- Was spec ambiguous? → Fix contract YAML
- Was rule not enforceable? → Add structural enforcement
- Was test missing? → Add to negative-tests.yaml
- Was agent instruction insufficient? → Update CLAUDE.md
- Was a tool missing? → Add to CI pipeline

---

## 9. FREE-ONLY OPERATING POLICY (NO UNSANCTIONED SPEND)

This project must be developed and operated on free resources by default. Provider pricing/limits are intentionally **not hard-coded here as permanent facts** because they can change.

Rules:
- Never purchase, upgrade, subscribe, add paid credits, buy domains, or enable paid resources without Alpesh's explicit approval for that specific action.
- When a provider limit is reached, status is **BLOCKED / NEEDS HUMAN DECISION**. Do not silently switch to a paid plan.
- Do not claim “₹0 forever” or “free tier sufficient” without current evidence.
- The implementation should minimize usage and record any capacity risk in `docs/PENDING_ITEMS.md`.

---

## 10. EVIDENCE REQUIREMENTS

Every "done" claim must come with evidence:

| Claim | Required Evidence |
|-------|------------------|
| "Tests pass" | CI run link + Vitest output |
| "Screen implemented" | Screenshot + route exists + acceptance test |
| "Permission enforced" | Negative test result (403 response from Clerk) |
| "Hard block works" | NS-001 through NS-004 test outputs |
| "Ledger append-only" | D1 trigger test — UPDATE raises ABORT |
| "No regression" | Full test suite output |

**Agent self-report is NEVER sufficient proof on its own.**
