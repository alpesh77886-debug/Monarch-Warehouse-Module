# v1.3 Hybrid Harness Upgrade Changelog

This package is the v1.3 hybrid hardening release built from Sarvam's 16-file v1.1 architecture package. The original package files were copied first; changes below are intentional and auditable.

## Intentional corrections / additions

- Added bundled canonical business source document so `CLAUDE.md` no longer references a missing required source file.
- Added bundled frontend HTML reference; explicitly marked visual/reference-only, not behavioral proof.
- Added `contracts/screens.yaml` for the 14 architecture screens; HTML reference mapping is explicit and does not pretend the HTML covers all screens.
- Corrected stale `PostgreSQL` wording in `IMPLEMENTATION_SPEC.md` to Cloudflare D1.
- Corrected `Prisma` decision-register residue to Drizzle ORM.
- Corrected the 15-vs-20 negative-test mismatch: 20 is the locked count.
- Added executable 10-loop human checkpoint hooks.
- Added free-only payment/billing tool gate.
- Added protected-project/config mutation guards.
- Added contract-count, static, integrity, and package self-check scripts.
- Strengthened CI pseudocode with install + contract/integrity preflight and executable E2E startup steps.
- Replaced hard-coded provider pricing/free-tier claims with a free-only policy and human escalation rule.
- Recorded the offline/PWA conflict as `PEN-011`; mobile-friendly online UX is mandatory, offline mutation/sync remains deferred until explicit human decision.
- Updated GitHub repository target to `alpesh77886-debug/Monarch-Warehouse-Module`.

## Not silently changed

The 20 business invariants, 20 negative-test IDs, 10 golden-scenario IDs, 12 roles, and four state machines were preserved.

## Verification status

The package was rehashed after construction. `UPGRADE_FILE_MANIFEST.sha256` is the final manifest for this v1.3 package.


## v1.2.1 — Release hardening (2026-09-13)

Additional hardening performed after the first v1.2 forensic pass:

- Added a checked-in `.github/workflows/ci.yml` so harness preflight is an actual CI artifact, not merely a YAML example in documentation.
- Removed `npx --yes wait-on` from the documented CI flow; the browser job now uses a bounded `curl` readiness loop to avoid an unnecessary package/network dependency.
- Added `contracts/mobile.yaml` and made its 320px, 48px touch-target, and no-horizontal-scroll rules machine-checked by `contract-guard.mjs`.
- Extended protected-integrity coverage to the Claude hooks, harness scripts, and checked-in CI workflow.
- Enhanced the 10-loop gate to generate `.harness/loop-checkpoint.md` containing current PROGRESS/PENDING evidence and the exact approval token.
- Re-verified the original 16-file package inventory and created `UPGRADE_DIFF_REPORT.md` mapping every original file to its final path/hash.

Release rule: this package is an architecture/harness handoff package. It is **not** a claim that the application implementation, backend runtime, or deployed environment is already production-ready.


## v1.3 — Hybrid control-plane hardening (2026-09-13)

- Added the single `MASTER_EXECUTION_CONTRACT.md` as the Claude Code control plane while preserving modular contracts/harness files underneath it.
- Added a task-routing map so Claude loads only the minimum relevant source/contract files instead of reading the entire package on every task.
- Corrected invalid YAML regex escaping in `contracts/entities.yaml`.
- Corrected the material-code contract to the canonical `LFG` / `SFG` prefixes; `SKFG*` remains a SAP warehouse-code family, not the material-master prefix.
- Added an executable YAML lexical safety gate and CI step so invalid backslash escapes/tabs in contract YAML are caught before implementation.
- Normalized the release identity to v1.3 across package-level documentation.

Release rule remains unchanged: this is an architecture/harness handoff package, not proof of a production implementation.
