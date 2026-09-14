# Pending Items
## IBF FG Warehouse Module
## Last updated: 2026-09-13

## CRITICAL (blocks implementation)
| ID | Item | Status | Blocking | Notes |
|----|------|--------|----------|-------|
| PEN-013 | Dev-dependency known-CVE risk (Next.js, and drizzle-kit/vite/vitest chain) | **OPEN** — bounded, documented residual risk (re-verified Loop 11, see docs/SECURITY_BASELINE.md) | Blocks any real Cloudflare deployment or dev/UI server on an untrusted network | `next@14.2.35`: fix requires a 2-major jump (16.x), architecture-relevant, no safe patch exists in the 14.x line (confirmed again this loop). `drizzle-kit`: npm's only offered fix is an older, not newer, version (not a real fix); the only fixed release is an unstable release-candidate (1.0.0-rc.5) — not installed. `vitest`: a stable fixed major (5.0.0) exists but its peer dependencies require `@types/node` ^22, a wider ripple than test-tooling alone — evaluated and deliberately not performed this loop. None of the six findings reach production runtime, browser-shipped code, or an end user of the (not yet deployed) app today. **Not CLOSED — requires a coordinated major-upgrade decision or continued documented acceptance before deployment.** |
| PEN-014 | 10 of 16 domain entities lack a formal machine-readable attribute contract | **BLOCKED** (Loop 12 — see PEN-017) | Future TASK-004/006/007/008/009/010, and Loop 18's core-workflow scope | Entities.yaml only formally defines Material Master, Batch, Pallet, Location, Stock Ledger and User with attribute-level validation. The other 10 are documented only in prose in the architecture blueprint (see docs/ENTITY_RELATIONSHIP_MAP.md). Ready-to-apply proposed contract text for the 4 highest-priority ones (Warehouse Master, SAP Warehouse Master, Status Master, Pallet-Batch) is drafted in docs/PROPOSED_CONTRACTS_PEN014.md, but cannot be applied - see PEN-017. |
| PEN-017 | The contract folder is a hardcoded protected path - no new file can be created there without a human-applied change or an explicit exception | **BLOCKED**, needs Boss decision | Blocks PEN-014 closure and any future task that needs a new formal contract entry | Discovered in Loop 12: a `Write` tool call targeting a new file under the contract folder was denied by the same protected-file-mutation hook already documented for PEN-012 (SKFG wording). This is working as designed, not a false positive - the contract folder is meant to be protected. Not routed around. Needs one of: (a) Alpesh applies proposed contract additions directly outside Claude Code's tool-mediated edits, or (b) a separate, explicit, per-change exception process. |
| PEN-015 | Cannot alias the harness scripts as package.json npm-script shortcuts | RECORDED, non-blocking (scripts still run directly) | None — cosmetic only | The repository's own protected-file-mutation hook denies any Write/Edit tool call whose content contains the harness-scripts path string, even when the target file (package.json) is not itself a protected path. Confirmed in Loop 8. Every harness script (contract/static/protected-integrity/package-integrity/yaml-lexical guards) still runs correctly and was re-verified directly in Loop 8 - only the npm-script convenience alias is affected, not the underlying capability. Not fixed or routed around per instruction; needs a human-applied change if the alias is wanted. |
| PEN-007 | Material master seed data | PENDING | TASK-003 | Need DSR Excel FG CODE sheet |
| PEN-008 | Warehouse location grid config | PENDING | TASK-005 | Need exact CR1/CR2 block/position/floor grid |
| PEN-009 | Cloudflare account creation | PENDING | TASK-001 | Alpesh needs to create Cloudflare account + D1 + R2 |
| PEN-010 | Clerk account creation | PENDING | TASK-001/002 | Alpesh needs to create Clerk app + get API keys. Code scaffold (middleware, provider, sign-in/up pages, role-check utility) is committed in stub mode: with no keys set it no-ops instead of crashing the build. Pinned to `@clerk/nextjs@6.39.6` specifically because the current latest major (7.x) requires Next.js 15/16 and would conflict with the accepted Next 14.2.35 decision (PEN-013) - re-check this pin if that Next decision ever changes. |
| PEN-011 | Offline/PWA scope conflict | PENDING | TASK-001 | Source flow requests offline resilience; v1 architecture defers offline sync. Mobile-friendly online UX is mandatory. Explicit human decision required before offline mutation/sync is implemented. |

## IMPORTANT
| ID | Item | Status | Notes |
|----|------|--------|-------|
| - | Technology stack | RESOLVED | Cloudflare D1 + Clerk approved 2026-09-13 |

## DEFERRED
| ID | Item | Notes |
|----|------|-------|
| PEN-002 | SAP deep integration (two-way sync) | v1 uses SAP codes as reference only |
| PEN-003 | Barcode/QR scanning | v1 manual entry — model supports scanner later |
| PEN-004 | Shelf life / FEFO | FIFO in v1, FEFO configurable later |
| PEN-005 | Photo attachments for receiving | v1 uses remarks — R2 ready for photos later |
| PEN-006 | Offline sync conflict resolution | PWA deferred — D1 + Cloudflare edge is fast enough for v1 |
