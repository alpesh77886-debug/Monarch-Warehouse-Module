# Security / Dependency Baseline (Loop 11)

Status: **PEN-013 remains OPEN (bounded, documented residual risk)** - not closed. This document is the evidence for that status, re-derived independently in this loop rather than reused verbatim from earlier reports.

## 1. Full current vulnerability inventory (`npm audit`, this loop)

| Package | Installed | Severity | Surface | Fixed version offered by npm | Fix is a... |
|---|---|---|---|---|---|
| `next` | 14.2.35 | critical | production runtime (server) | 16.3.5 | major upgrade, 2 majors up |
| `postcss` (nested under next) | 8.4.31 | high | build time only | none independent of the next upgrade | tied to next's own bump |
| `drizzle-kit` | 0.31.10 | moderate | local developer tooling (schema/migration generation CLI) | 0.18.1 (a **downgrade**, not a real fix) | not viable - see 3a |
| `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, `esbuild` | transitive via drizzle-kit | moderate | local developer tooling | tied to drizzle-kit | not viable - see 3a |
| `vitest` | 1.6.1 | critical | test tooling (only when its UI server is run) | 5.0.0 | major upgrade, 4 majors up, has a wider peer-dependency ripple - see 3b |
| `vite`, `vite-node` | 5.4.21 (transitive via vitest) | high / moderate | test tooling | tied to vitest | see 3b |

Zero of these six findings touch code that ships to an end user's browser or that runs unattended in a deployed Worker/Pages function - they are all either the Next.js server binary itself (not yet deployed anywhere), or local CLI/test tooling that never runs outside a developer's own machine or CI.

## 2. Runtime-surface classification

- **Production runtime:** `next` only. This is the one finding with real deployed-app impact once the app is actually deployed (it is not deployed today - see PEN-009).
- **Build time:** the nested `postcss` inside `next`'s own dependency tree - never invoked directly by our code, only by `next build` internally.
- **Test tooling:** `vitest`, `vite`, `vite-node` - invoked only by `npm test` (`vitest run`), never in the request path of the running app.
- **Local developer tooling:** `drizzle-kit` and its `esbuild`/`@esbuild-kit/*` chain - invoked only by `npx drizzle-kit generate`, a one-off command a developer runs by hand, never part of `npm run build`, `npm run dev`, or `npm test`.

## 3. Fixed-version and compatibility findings (this loop's evidence)

### 3a. drizzle-kit / esbuild chain - no safe fix available
`npm audit`'s own suggested fix is `drizzle-kit@0.18.1`, which is **older**, not newer, than what is installed. Checked this loop: `npm view drizzle-kit@latest dependencies` resolves to `1.0.0-rc.5-ab785fc` - a **release-candidate**, not a stable release (`npm view drizzle-kit dist-tags` was not needed once the version string itself showed `-rc.` - a pre-release identifier). Installing a pre-release build to close a moderate-severity, dev-tool-only finding is a worse trade than leaving it documented and open. No stable drizzle-kit release exists yet whose declared `esbuild` dependency is patched.

### 3b. vitest - a major upgrade exists but is not a safe drop-in
`vitest@5.0.0` is confirmed GA (`npm view vitest dist-tags` shows `"latest": "5.0.0"`, not a prerelease tag). However, its `peerDependencies` require `@types/node: ^22.0.0 || >=24.0.0` and `vite: ^6.4.0 || ^7.0.0 || ^8.0.0`. This project's `@types/node` is currently `^20.14.0` (matching the Next.js 14 / Node 20-era toolchain used throughout this project) and would need its own major bump to satisfy vitest 5's peer requirement - a ripple into a package that affects TypeScript types across the entire codebase, not an isolated test-tooling change. Per the instruction not to perform a major upgrade without evidence of safety, and given this is not actually isolated to test tooling once the `@types/node` ripple is accounted for, **this upgrade was evaluated and deliberately not performed this loop.**

### 3c. next - confirmed no safe fix within the major version
Re-confirmed this loop (`npm outdated`): "Wanted" (the newest version satisfying the current semver range) equals "Current" (14.2.35) for `next`. The only version that resolves any of the 24 listed advisories is `16.3.5`, a 2-major-version jump. This is unchanged from the Loop-2 finding and the Boss's Option-A acceptance - re-verified, not re-litigated.

## 4. Decision

**PEN-013 status: OPEN, bounded.** No package in this list gets upgraded in Loop 11. Rationale: every fix path available today is either (a) a major/architecture-relevant framework jump requiring its own separate approval (`next`), (b) a pre-release build unsuitable for a locked project (`drizzle-kit`), or (c) a major upgrade whose peer-dependency ripple is wider than the test-tooling surface it claims to fix (`vitest`). All six findings remain confined to production-server-not-yet-deployed, build-time, test-tooling, or local-CLI-tooling surfaces - none reachable by an end user of the (not yet deployed) application today. This bound must be re-verified before any real Cloudflare deployment (PEN-009) or before running any dev/UI server on an untrusted network, exactly as already recorded.
