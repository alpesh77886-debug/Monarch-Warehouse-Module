# Original 16-file package vs v1.3 hybrid mapped package

| Original path | Final path | Original SHA256 | Final SHA256 | Status |
|---|---|---|---|---|
| `ARCHITECTURE_BLUEPRINT.md` | `docs/ARCHITECTURE_BLUEPRINT.md` | e39ff96dc4cbf6f9bb1b1f6c50c9156f196b8162f3c5173faf67af3985120212 | 1970f9e33610aa2beb344d088eb80d641e1f4e2f1af559c73b4d5e443b0cd13f | INTENTIONALLY CHANGED |
| `BACKEND_STACK.md` | `docs/BACKEND_STACK.md` | a4d98cf68637f1bfb51d269b069ebf54c4060b58b265f950572dd8eda44fd6da | 82541d67c27320a19ffa17a2fc76b54fd61be6d56b84abc04793c3600562c2be | INTENTIONALLY CHANGED |
| `CLAUDE.md` | `CLAUDE.md` | b7574a091917a5bdb94371a2d9b15d61696a244b7f0086c684ac03b8acff733e | 756d98dae64a74969e93fac722d07084353e01dee5ee0821999a0372514d537e | INTENTIONALLY CHANGED |
| `GITHUB_SETUP_GUIDE.md` | `docs/GITHUB_SETUP_GUIDE.md` | af4aed27454449ad5a4236a356e3e53b0ce49ddb6342d0d5759435818fe8edec | bdb1692d3481a4dc2ce778c7013f56a3042ed9684a50fae0964fce73668dd6ac | INTENTIONALLY CHANGED |
| `HARNESS_ENGINEERING.md` | `docs/HARNESS_ENGINEERING.md` | 43ddd7f21d297d692e0882b42772ff2d5875ca1c7f7ef2d50d80adc2d1ece7f7 | 9b7df2d3d20d288b78313651645330f6c258e4f58d951888f2447bd45700dbeb | INTENTIONALLY CHANGED |
| `IMPLEMENTATION_SPEC.md` | `docs/IMPLEMENTATION_SPEC.md` | 0975c78a480088856fa34dcb331327814d8e5b00c0d976f0e39fcb28969d5e8f | f3098aeee24829b23797af088a2d477b2c71dca5219883e6ef0a681df03291e1 | INTENTIONALLY CHANGED |
| `PENDING_ITEMS.md` | `docs/PENDING_ITEMS.md` | 53ca7fee25416e02300ab67448678489fd0130eb0ab97393770afed7570cff4a | 5ba02ef0fdc3dbb44e71cc90f386d840784857af0205b4fe271ac6dd3ef9e1d7 | INTENTIONALLY CHANGED |
| `PROGRESS.md` | `docs/PROGRESS.md` | 2c84fb8f0d1e07812bbceac98576223f5f8159fd85e50d264a06fdb096af0c88 | 878ba69eb6926c634bd97846f6c12015a3eb320d049ec99b9ebe7a2f42e0107a | INTENTIONALLY CHANGED |
| `README.md` | `README.md` | e838464182112181f5c4e1a2a2ca1e28892a4db21c2123ab7301fc9cf340cb5d | dc0af01fb0755ab93d1519a59a67d0cf22734527704647b221b20c54f691df4f | INTENTIONALLY CHANGED |
| `contracts/entities.yaml` | `contracts/entities.yaml` | f03388c22bf2e59d7410f7ebe0333d8fc4fd0e4d8d3f87a29a00f1ea6478795a | 0d102eafa5632f1af2664afc09c290c0530941eaebfccec9a2546b7f6e961445 | INTENTIONALLY CHANGED |
| `contracts/evaluation-rubric.yaml` | `contracts/evaluation-rubric.yaml` | 06f92d6bb052f9f79dd10712209b2b928690fb60487a58de82264bacc567c668 | 06f92d6bb052f9f79dd10712209b2b928690fb60487a58de82264bacc567c668 | UNCHANGED |
| `contracts/golden-scenarios.yaml` | `contracts/golden-scenarios.yaml` | c13b6783d83bbc1554aa77636711789415a4b85cf077fdb39c09fad6a13938e4 | c13b6783d83bbc1554aa77636711789415a4b85cf077fdb39c09fad6a13938e4 | UNCHANGED |
| `contracts/invariants.yaml` | `contracts/invariants.yaml` | bbab530e57911f46927e5e1019449c3f592ed82d88a07a19e3c85e59565dd8a7 | bbab530e57911f46927e5e1019449c3f592ed82d88a07a19e3c85e59565dd8a7 | UNCHANGED |
| `contracts/negative-tests.yaml` | `contracts/negative-tests.yaml` | b301949a85086c712c36b4399fa4301a7212ec6605105bb8915d9b5ffe592295 | b301949a85086c712c36b4399fa4301a7212ec6605105bb8915d9b5ffe592295 | UNCHANGED |
| `contracts/permissions.yaml` | `contracts/permissions.yaml` | c8825c29b8f17a7611071aab5b6c6982c1dbf218b875825acac5027580628aea | c8825c29b8f17a7611071aab5b6c6982c1dbf218b875825acac5027580628aea | UNCHANGED |
| `contracts/workflows.yaml` | `contracts/workflows.yaml` | 23d11acd79081dcc6ba51b74e08a1b76e0a2b77e24e4a6276b7c40a4be455817 | 23d11acd79081dcc6ba51b74e08a1b76e0a2b77e24e4a6276b7c40a4be455817 | UNCHANGED |

## Added files

- `.claude/hooks/config-protection.mjs`
- `.claude/hooks/loop-stop-gate.mjs`
- `.claude/hooks/pretool-safety.mjs`
- `.claude/hooks/user-prompt-gate.mjs`
- `.claude/settings.json`
- `.github/workflows/ci.yml`
- `.harness/loop-checkpoint.md`
- `.harness/loop-state.json`
- `CLAUDE_BOOTSTRAP_PROMPT.md`
- `HARNESS_BOOTSTRAP.md`
- `MASTER_EXECUTION_CONTRACT.md`
- `ORIGINAL_PACKAGE_SHA256.txt`
- `UPGRADE_CHANGELOG.md`
- `UPGRADE_DIFF_REPORT.md`
- `contracts/mobile.yaml`
- `contracts/screens.yaml`
- `docs/IBF_FG_Warehouse_Flow_Document_v3_FINAL_Complete.md`
- `reference/IBF_FG_Warehouse_Frontend_Design_v5.html`
- `scripts/harness/contract-guard.mjs`
- `scripts/harness/loop-gate.mjs`
- `scripts/harness/package-integrity.mjs`
- `scripts/harness/protected-integrity.mjs`
- `scripts/harness/static-guard.mjs`
- `scripts/harness/yaml-lexical-guard.mjs`

## v1.3 hardening delta

- Hybrid master control plane (`MASTER_EXECUTION_CONTRACT.md`) is the single Claude-facing execution entrypoint above the modular contracts/harness.
- Task-routing guidance explicitly limits context loading to the smallest relevant documents per bounded task.
- `contracts/entities.yaml` YAML escaping is repaired and the material master validation follows the canonical LFG/SFG prefixes.
- `scripts/harness/yaml-lexical-guard.mjs` and the CI step prevent recurrence of the invalid YAML escape class found during forensic review.
- Master control plane, bootstrap files, and integrity manifest are included in protected-artifact enforcement.
- Release identity is normalized to v1.3 at package level.

## Release scope

This package is an architecture/harness handoff. It does not claim that the application, database runtime, authentication, deployment, browser E2E, or production operations are already implemented or production-ready.
