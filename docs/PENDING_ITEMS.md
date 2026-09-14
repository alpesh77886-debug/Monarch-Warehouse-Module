# Pending Items
## IBF FG Warehouse Module
## Last updated: 2026-09-13

## CRITICAL (blocks implementation)
| ID | Item | Status | Blocking | Notes |
|----|------|--------|----------|-------|
| PEN-013 | Next.js version / known-CVE risk decision | ACCEPTED RISK (Boss: Option A, 2026-09-14) | None — unblocked | Latest available 14.2.x line (14.2.35) still carries 2 critical + 2 high advisories per `npm audit`; the only fix path npm offers is a major-version jump (next 16.x). Boss explicitly accepted staying on `next@14.2.35` for the pre-deployment/local-dev stage. **This must be re-checked and re-resolved (patch or major upgrade) before any real Cloudflare deployment or internet exposure** — do not carry this acceptance forward silently into a production-readiness claim. |
| PEN-014 | 10 of 16 domain entities lack a formal machine-readable attribute contract | RECORDED, non-blocking for now | Future TASK-004/006/007/008/009/010 | Entities.yaml only formally defines Material Master, Batch, Pallet, Location, Stock Ledger and User with attribute-level validation. Receiving Sheet, Hold Record, Transfer Order, Loading Sheet, Maintenance Ticket, Pallet-Batch, Warehouse Master, SAP Warehouse Master and Status Master are documented only in prose in the architecture blueprint. See docs/ENTITY_RELATIONSHIP_MAP.md. Must be written as formal contract entries before the tasks that implement them begin. |
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
