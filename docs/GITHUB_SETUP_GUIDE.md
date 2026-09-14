# IBF FG Warehouse Module — GitHub Repository Setup Guide
## How to create the project in GitHub with proper AI memory

---

## STEP 1: GitHub Repository Create Karo

1. GitHub par jao → **New Repository**
2. Repository name: `Monarch-Warehouse-Module`
3. Visibility: **Private** (company data — never public)
4. Initialize with: README (minimal), .gitignore for Node.js

---

## STEP 2: Files Copy Karo (is package se)

| File in this package | Copy to repo location |
|---------------------|---------------------|
| `CLAUDE.md` | `CLAUDE.md` (root) |
| `BACKEND_STACK.md` | `docs/BACKEND_STACK.md` |
| `ARCHITECTURE_BLUEPRINT.md` | `docs/ARCHITECTURE_BLUEPRINT.md` |
| `IMPLEMENTATION_SPEC.md` | `docs/IMPLEMENTATION_SPEC.md` |
| `HARNESS_ENGINEERING.md` | `docs/HARNESS_ENGINEERING.md` |
| `GITHUB_SETUP_GUIDE.md` | `docs/GITHUB_SETUP_GUIDE.md` |
| `PROGRESS.md` | `docs/PROGRESS.md` |
| `PENDING_ITEMS.md` | `docs/PENDING_ITEMS.md` |
| `contracts/*.yaml` (all 7 files) | `contracts/` |
| Your original flow document | `docs/IBF_FG_Warehouse_Flow_Document_v3_FINAL_Complete.md` |

---

## STEP 3: Cloudflare + Clerk Accounts Setup Karo

### Cloudflare:
1. cloudflare.com par account banao (free)
2. Dashboard → Workers & Pages → D1 → Create database → "ibf-fg-warehouse"
3. Dashboard → R2 → Create bucket → "ibf-fg-warehouse-files"
4. Database ID note karo (wrangler.toml me chahiye)

### Clerk:
1. clerk.com par account banao (free)
2. Create Application → "IBF FG Warehouse"
3. API keys copy karo:
   - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
   - CLERK_SECRET_KEY
4. Custom roles setup karo (R01 through R12)

---

## STEP 4: Branch Protection Setup Karo

GitHub → Settings → Branches:
- **main**: Require PR + 1 approval + CI pass + no force push
- **develop**: Require PR + CI pass + no force push

---

## STEP 5: Claude Code ko First Prompt Do

Use the bundled `CLAUDE_BOOTSTRAP_PROMPT.md` verbatim. It contains the locked 10-loop checkpoint, free-only payment rule, and mobile-first requirement.

```
I have set up a GitHub repository for the IBF FG Warehouse Module at [repo URL].

Accounts ready:
- Cloudflare: D1 database created, R2 bucket created
- Clerk: Application created, API keys available

The repository contains:
- CLAUDE.md — project memory (READ THIS FIRST)
- docs/BACKEND_STACK.md — backend architecture (D1 + Clerk + R2)
- docs/ARCHITECTURE_BLUEPRINT.md — complete system design
- docs/IMPLEMENTATION_SPEC.md — 14 bounded tasks
- contracts/ — machine-readable business rules
- docs/PROGRESS.md — current task status

Your job:
1. Read CLAUDE.md completely
2. Read docs/BACKEND_STACK.md for backend setup details
3. Read docs/IMPLEMENTATION_SPEC.md
4. Check docs/PROGRESS.md
5. Start with TASK-001 (scaffolding + D1 schema + Clerk setup)
6. Follow all LOCKED RULES in CLAUDE.md
7. Do not continue after the 10-loop checkpoint without `APPROVE_NEXT_10_LOOPS`.
8. Do not perform payment/upgrade/billing actions without explicit Alpesh approval.
9. Use the bundled HTML only as a visual reference; implement mobile-first UI.

I will provide:
- Cloudflare account access
- Clerk API keys
- Material master seed data (when needed for TASK-003)
- Warehouse location grid (when needed for TASK-005)
```

---

## STEP 6: Ongoing Memory Protocol

- Task complete → update PROGRESS.md + commit
- Architectural decision → update CLAUDE.md + commit
- Spec conflict → GitHub issue + PENDING_ITEMS.md
- Bug fix → add regression test + update HARNESS_ENGINEERING.md

---

## STEP 7: ChatGPT ya dusre AI ke liye

1. CLAUDE.md content paste karo (project context)
2. BACKEND_STACK.md content paste karo (backend details)
3. Specific task from IMPLEMENTATION_SPEC.md paste karo
4. Relevant contract YAML paste karo

---

*Guide updated: 2026-09-13 for Cloudflare D1 + Clerk stack*
