# Pending Items
## IBF FG Warehouse Module
## Last updated: 2026-09-13

## CRITICAL (blocks implementation)
| ID | Item | Status | Blocking | Notes |
|----|------|--------|----------|-------|
| PEN-013 | Next.js version / known-CVE risk decision | PENDING BOSS DECISION | Loop 2 completion | Latest available 14.2.x line (14.2.35) still carries 2 critical + 2 high advisories per `npm audit`; the only fix path npm offers is a major-version jump (next 16.x), which is a bigger change than a scaffold task and has unverified Cloudflare-adapter/hosting-decision implications. Scaffold files below are committed as-is only to keep the working tree clean; the version choice is NOT yet accepted or approved. |
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
