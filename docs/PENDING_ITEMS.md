# Pending Items
## IBF FG Warehouse Module
## Last updated: 2026-09-13

## CRITICAL (blocks implementation)
| ID | Item | Status | Blocking | Notes |
|----|------|--------|----------|-------|
| PEN-013 | Dev-dependency known-CVE risk (Next.js, and now drizzle-kit/vite/vitest chain) | ACCEPTED RISK for pre-deployment stage (Boss: Option A, 2026-09-14) | None — unblocked | `next@14.2.35` (latest available 14.x): 2 critical + 2 high, fixable only by a major-version jump (next 16.x). Adding `drizzle-kit`/`vitest` in Loop 6 additionally surfaced: `vitest` critical (arbitrary file read/execute — only if its UI server is run, which this project does not use), `vite`/`postcss` high, `esbuild`/`@esbuild-kit/*` moderate — all dev-tooling-only, not shipped to production users, same "accept pre-deployment, revisit before real exposure" class as the Next.js item above. **All of these must be re-checked and re-resolved before any real Cloudflare deployment, before running any dev/UI server on an untrusted network, or before a production-readiness claim is made.** |
| PEN-014 | 10 of 16 domain entities lack a formal machine-readable attribute contract | RECORDED, non-blocking for now | Future TASK-004/006/007/008/009/010 | Entities.yaml only formally defines Material Master, Batch, Pallet, Location, Stock Ledger and User with attribute-level validation. Receiving Sheet, Hold Record, Transfer Order, Loading Sheet, Maintenance Ticket, Pallet-Batch, Warehouse Master, SAP Warehouse Master and Status Master are documented only in prose in the architecture blueprint. See docs/ENTITY_RELATIONSHIP_MAP.md. Must be written as formal contract entries before the tasks that implement them begin. |
| PEN-015 | Cannot alias the harness scripts as package.json npm-script shortcuts | RECORDED, non-blocking (scripts still run directly) | None — cosmetic only | The repository's own protected-file-mutation hook denies any Write/Edit tool call whose content contains the harness-scripts path string, even when the target file (package.json) is not itself a protected path. Confirmed in Loop 8. Every harness script (contract/static/protected-integrity/package-integrity/yaml-lexical guards) still runs correctly and was re-verified directly in Loop 8 - only the npm-script convenience alias is affected, not the underlying capability. Not fixed or routed around per instruction; needs a human-applied change if the alias is wanted. |
| PEN-007 | Material master seed data | PENDING | TASK-003 | Need DSR Excel FG CODE sheet |
| PEN-008 | Warehouse location grid config | PENDING | TASK-005 | Need exact CR1/CR2 block/position/floor grid |
| PEN-009 | Cloudflare account creation | PENDING | TASK-001 | Alpesh needs to create Cloudflare account + D1 + R2 |
| PEN-010 | Clerk account creation | PENDING | TASK-001 | Alpesh needs to create Clerk app + get API keys |
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
