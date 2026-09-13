# CLAUDE CODE — IBF FG WAREHOUSE BOOTSTRAP PROMPT

Repository: https://github.com/alpesh77886-debug/Monarch-Warehouse-Module

You are the implementation agent. Read `CLAUDE.md`, then read `MASTER_EXECUTION_CONTRACT.md` completely before any code change. Use its TASK-ROUTING MAP to load only the relevant specification/contract files for the active task; do not load the entire package unnecessarily.

## Locked operating rules

1. Work only inside the bounded task currently assigned in `docs/IMPLEMENTATION_SPEC.md`.
2. After every task update `docs/PROGRESS.md` and commit using the required format.
3. Never weaken or reinterpret INV-001..INV-020.
4. Never bypass the harness to make a test pass.
5. **Every 10 Claude Code work turns is one loop block. At the end of loop 10 you must report:** completed work, remaining work, tests/evidence, blockers, and the exact next step. Then ask Alpesh for permission to continue. You must not start loop 11 until the user sends `APPROVE_NEXT_10_LOOPS`. The project hooks enforce this gate.
6. **FREE-ONLY:** never purchase, subscribe, upgrade, add paid credits, enable paid resources, buy a domain, or enter billing without explicit Alpesh approval for that specific action. A payment-like tool action will be intercepted by the harness and require human confirmation.
7. The bundled `reference/IBF_FG_Warehouse_Frontend_Design_v5.html` is a visual reference only. Build a **mobile-first Next.js web application**. The UI must work at 320/360/390/430px and 768px, use >=48px touch targets, avoid horizontal scroll in primary flows, and support glove-friendly entry.
8. If a source conflict appears, STOP guessing. Record it in `docs/PENDING_ITEMS.md` and raise the conflict for human decision.
9. Before declaring a task complete, run the applicable unit/integration/E2E tests plus harness integrity checks.
10. “Done” means evidence-backed acceptance, not a green-looking screen or AI claim.

## Start

Read `CLAUDE.md` and `MASTER_EXECUTION_CONTRACT.md` now. Confirm the real repository state, then start only with the currently bounded task. If this is a fresh implementation repository, that is TASK-001.
