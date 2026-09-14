# Monarch-Warehouse-Module

IBF FG Warehouse Module — Iscon Balaji Foods. Cloudflare D1 + Clerk + R2 + Drizzle ORM + Next.js. Digital warehouse operations replacing WhatsApp/paper/Excel.

## Status

Architecture and harness governance package committed to this repository (Loop 1, Boss-approved). Application implementation has not started yet.

## Read before any change

This project is developed under a locked, Claude-facing execution contract and a set of machine-readable business contracts held in this repository. Read the top-level entrypoint memory file and the full execution contract completely before touching anything, then use the task-routing map inside it to load only what a specific bounded task needs.

## Governance controls in this repository

- A ten-loop human checkpoint: work stops every ten loops until an exact approval token is given.
- A free-only spending gate: no paid plan, subscription, upgrade, or billing action is ever permitted, even with human approval.
- Protected-file integrity guards over the locked business source, the architecture and implementation specs, the machine-readable business contracts, and the enforcement scripts/hooks themselves.
- A bundled visual-reference-only frontend design file — not behavioral proof of the real mobile-first application.

Do not weaken, disable, or route around any of the above.

## Known intentional deviation from the original package hash manifest

One business-invariant wording line inside the architecture blueprint doc under the Material Master entity was found to incorrectly list a SAP/warehouse-storage-location code family alongside the two real material-code prefixes. A one-line correction was proposed and Boss-approved. As of this commit that correction has **not yet been applied**, because the repository's own protected-file integrity hook denies any edit tool call touching that guarded file — see `docs/PENDING_ITEMS.md` for the exact pending item and the exact text of the proposed correction.
