# MONARCH Warehouse v1.3 — Harness Bootstrap

This package contains project-level Claude Code hooks. Claude Code reads `.claude/settings.json` from the repository; these project hooks are shareable and can be committed with the repo.

## Required behavior

- Loop window = 10 work turns.
- After loop 10 the next user prompt is blocked until `APPROVE_NEXT_10_LOOPS`.
- Payment-like actions require human confirmation.
- Protected harness/contract/config mutations are denied.
- Contract and integrity preflight must pass before release.

## Files

- `.claude/settings.json` — hook registration
- `.claude/hooks/loop-stop-gate.mjs` — counts Stop events
- `.claude/hooks/user-prompt-gate.mjs` — blocks loop 11 without approval
- `.claude/hooks/pretool-safety.mjs` — payment + protected mutation gate
- `.claude/hooks/config-protection.mjs` — protects project hook settings
- `scripts/harness/loop-gate.mjs` — persistent state machine
- `scripts/harness/contract-guard.mjs` — contract completeness checks
- `scripts/harness/static-guard.mjs` — architecture pattern checks once source exists
- `scripts/harness/protected-integrity.mjs` — runtime protected-file hash check
- `scripts/harness/package-integrity.mjs` — package self-integrity check
- `scripts/harness/yaml-lexical-guard.mjs` — dependency-free YAML contract hazard check

The harness is defense-in-depth; it does not authorize spending. A human remains the final authority for any payment.
