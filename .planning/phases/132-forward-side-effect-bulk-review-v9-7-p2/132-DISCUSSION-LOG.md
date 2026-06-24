# Phase 132 — Discussion Log

**Date:** 2026-06-17
**Mode:** discuss (default)

> Human-reference record of the discussion. Not consumed by downstream agents — they read CONTEXT.md.

## Pre-step: ROADMAP phase section added

Phase 132 existed only as a checklist item + progress-table row (no `### Phase 132` detail section), so `init.phase-op` could not resolve it. Added the detail section transcribing the already-locked P2 scope (charter §scope 3+6, checklist) + the `algemeen`=no-forward disposition. No new capabilities introduced.

## Areas selected to discuss

All four: Forward-vorm · Release/dry-run-gating · Category stamp-back · Bulk Review-surface.

## Questions, options, selections

### 1. Forward-vorm
- Options: **Inline, reply-to = klant** / Inline, reply → info@ / Als .eml-bijlage
- **Selected:** Inline, reply-to = klant — department replies directly to the customer. (Flagged: research must validate Graph reply-to feasibility.)

### 2. Release / dry-run-gating
- Options: **Per-bucket gefaseerd** / Globaal aan/uit / Per-merk
- **Selected:** Per-bucket graduated release; default held/observe.

### 3. Category stamp-back
- Options: **Routed-status → bucket** / Alleen bestemmingscategorie / Alleen bij forward
- **Selected:** Single category encoding routed-status + bucket (`AI: routed → <bucket>`); distinct markers for held/unrouted/algemeen. Stable parseable vocabulary (V10 signal).

### 4. Bulk Review-surface
- Options: **Hergebruik + override** / Hergebruik, read-only / Eigen routing-view
- **Selected:** Reuse `[swarm]/review` + routing detail pane + manual override/re-route + forward-now/don't-forward; algemeen/unrouted surface for human handling.

## Carry-forward applied (not re-asked)
Swarm-agnostic / zero swarm_type literal (SWARM-02); held gate = ROUTE-07; dedup = ROUTE-05; algemeen=no-forward, unrouted=triage (this session's gap-closure).

## Deferred ideas captured
Phase 133 (NL config + verkoop→order), Phase 134 + V10 (ambient loop, mis-forward feedback), cross-swarm routing spike, coordinator rename. algemeen@ verification resolved (no-forward).

## Claude's discretion
Idempotency-key storage, Inngest step structure, exact category string, UI component reuse, per-bucket release-flag storage.
