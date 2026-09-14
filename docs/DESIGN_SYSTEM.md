# Design System Extraction (Loop 3)

Source: the bundled visual-reference-only frontend design file (10 screens). This document extracts its visual language into reusable tokens and a component inventory for the real mobile-first application. It is not itself a business-rule or screen-scope source — that authority stays with the architecture blueprint and screen contract.

## 1. Color tokens (wired into the Tailwind theme)

| Token | Hex | Usage in the reference design |
|---|---|---|
| `ink` | #0B1F3A | primary text |
| `ink2` | #334155 | secondary text |
| `muted` / `muted2` | #64748B / #94A3B8 | tertiary text, placeholders |
| `canvas` | #F0F4F8 | page background |
| `surface` | #FFFFFF | card/panel background |
| `line` | #E2E8F0 | borders, dividers |
| `navy` / `navy-2` / `navy-3` | #0B1F3A / #13294B / #1C3A66 | sidebar, primary buttons, headings |
| `teal` / `teal-2` / `teal-light` | #0D9488 / #0F766E / #CCFBF1 | brand accent, OK status, primary CTA |
| `sky` / `sky-light` | #0284C7 / #E0F2FE | QC-hold status, info |
| `gold` / `gold-light` | #D97706 / #FEF3C7 | warning accent |
| `success` / `success-light` | #059669 / #D1FAE5 | OK/available, resolved states |
| `danger` / `danger-light` | #DC2626 / #FEE2E2 | hard-block, critical, rejected |
| `warning` / `warning-light` | #F59E0B / #FEF3C7 | hold/amber-aging states |
| `accent` / `accent-light` | #7C3AED / #EDE9FE | bulk status |
| `slate` | #475569 | transfer/neutral tag |

## 2. Typography and elevation

- Font: Plus Jakarta Sans, loaded via `next/font/google` (self-hosted at build time — no runtime external font CDN call, zero ongoing cost, works offline after build). This replaces the reference file's live Google Fonts `<link>`.
- Shadows: `card` (resting card elevation) and `elevated` (modal/CTA-band elevation) — both wired into `tailwind.config.ts`.

## 3. Component inventory (reference selector -> planned component)

| Reference pattern | Planned component | Notes |
|---|---|---|
| `.side`, sidebar nav groups | `AppShell` / `SidebarNav` | Loop 4 — real breakpoints, not scale-transform |
| `.top` header bar | `PageHeader` | breadcrumb + title + actions slot |
| `.kpi` cards | `KpiCard` | dashboard metric tile |
| `table` + `.pl-*` badges | `DataTable` + `StatusBadge` | badge variants: ok, hold, qc, bulk, rejected, transfer |
| `.steps` / `.st` | `Stepper` | receiving-sheet 3-step flow |
| `.cf` / `.sigr` | `ConfirmationPanel` | dual-confirmation (packing side / warehouse side) |
| `.rack` / `.rc` grid cells | `RackGridCell` | color states: empty, full, partial, mix, hold, blocked |
| `.tl` / `.dot` / `.bar` | `StatusTimeline` | maintenance-ticket lifecycle |
| `.ls` printable block | `DocumentCard` | loading-sheet / gate-pass print view |
| `.note` callouts | `InlineNotice` | warning/info banners |
| (not in reference) | `EmptyState`, `ErrorState`, `LoadingState`, `PermissionDeniedState` | required by the architecture's mobile/UX spec but absent from the reference file — designed fresh |

## 4. Explicit non-goal

The reference file's `.fit-wrap` / `.fit-inner` / `fitAll()` mechanism (a fixed 1240px layout scaled down with CSS `transform: scale()`) is **not reused**. The real application uses genuine Tailwind responsive breakpoints (320/360/390/430/768px) with content reflow, per the mobile contract. No component in this inventory should be implemented as a scaled-down desktop layout.
