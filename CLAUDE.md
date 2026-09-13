# MONARCH WAREHOUSE — CLAUDE CODE ENTRYPOINT
## Master Execution Contract + Engineering Package

**This file is an entrypoint, not a replacement for the full execution contract.**

### MANDATORY FIRST ACTION
Before any implementation, test, commit, deployment, or tool action:

1. Read `MASTER_EXECUTION_CONTRACT.md` completely.
2. Then read the source-of-truth flow and the contracts relevant to the current bounded task.
3. Check the real repository state before changing anything.

### AUTHORITY ORDER
1. Human-approved / locked business requirements: `docs/IBF_FG_Warehouse_Flow_Document_v3_FINAL_Complete.md`
2. Architecture: `docs/ARCHITECTURE_BLUEPRINT.md`
3. Machine-readable contracts: `contracts/*.yaml`
4. Bounded implementation scope: `docs/IMPLEMENTATION_SPEC.md`
5. Harness and enforcement: `docs/HARNESS_ENGINEERING.md`, `.claude/`, `scripts/harness/`
6. Actual implementation + tests + deployed/runtime evidence
7. AI explanations/screenshots are never proof by themselves

### HARD HUMAN GATES
- **10-loop gate:** after loop 10, Claude Code must stop and obtain the exact token `APPROVE_NEXT_10_LOOPS` before loop 11.
- **FREE-ONLY gate:** no purchase, subscription, upgrade, paid credits, paid resource, domain purchase, or billing action without explicit Alpesh approval for that specific action.
- **Protected-truth gate:** do not mutate locked contracts/harness/config to make tests pass.

### IMPLEMENTATION STANDARD
“Done” means evidence-backed acceptance. A green UI, generated HTML, agent claim, or screenshot is insufficient.

Required evidence is determined by the master contract and applicable harness gates. Failures are fixed at the smallest safe layer and regression-tested.

### CURRENT TASK DISCIPLINE
Work only on the bounded task explicitly active in `docs/IMPLEMENTATION_SPEC.md`. Never invent scope, business rules, roles, statuses, workflow transitions, or integrations.

### STOP RULE
When a requirement is ambiguous or contradictory, STOP guessing. Record it in `docs/PENDING_ITEMS.md` and surface the human decision required.

### PACKAGE MAP
- `MASTER_EXECUTION_CONTRACT.md` — single Claude-facing control plane
- `docs/IBF_FG_Warehouse_Flow_Document_v3_FINAL_Complete.md` — business source of truth
- `docs/ARCHITECTURE_BLUEPRINT.md` — architecture
- `docs/IMPLEMENTATION_SPEC.md` — bounded tasks
- `docs/HARNESS_ENGINEERING.md` — enforcement model
- `contracts/` — machine-readable contracts
- `.claude/` + `scripts/harness/` — executable safety/harness
- `reference/` — visual reference only

**Claude Code MUST NOT begin implementation until `MASTER_EXECUTION_CONTRACT.md` has been read.**
