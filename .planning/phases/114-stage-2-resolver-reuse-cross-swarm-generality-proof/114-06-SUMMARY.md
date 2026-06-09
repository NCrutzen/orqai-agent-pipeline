---
phase: 114-stage-2-resolver-reuse-cross-swarm-generality-proof
plan: 06
subsystem: agentic-pipeline / stage-2-resolver
tags: [stage-2, sales-email, cross-swarm, gap-closure, brand-scope, entity-brand]
gap_closure: true
requires:
  - "Phase 114-04 generic Stage 2 dispatch path (usesGenericPath, loadStage2Resolver, resolution_audit write)"
  - "Live sales resolution_config (migration 20260604b_sales_resolution_config.sql) with scope.brand_scope=['SB']"
provides:
  - "Generic-path brand_id sourced from resolution_config.scope.brand_scope[0] — sender_match + factuur_match reachable for sales (CR-01)"
  - "Generic-path nxt_database sourced from config.source.nxt_database, literal 'nxt' only as documented absent-key default (WR-01)"
  - "entity_brand normalized to a scalar code for both registry shapes — no '[object Object]' in resolution_audit or the Stage 2→3 hand-off (CR-02)"
affects:
  - "web/lib/inngest/functions/stage-2-customer-resolver.ts (generic path only; debtor path byte-neutral)"
tech-stack:
  added: []
  patterns:
    - "Inline type-guard normalization of operator-seeded jsonb (string | object → scalar code) instead of an async brand-register load (replay-safe inside step.run)"
    - "Config-as-source-of-truth for per-swarm Stage 2 context (brand_id, nxt_database from resolution_config), not per-mailbox debtor labeling_settings"
key-files:
  created: []
  modified:
    - "web/lib/inngest/functions/stage-2-customer-resolver.ts"
    - "web/lib/inngest/functions/__tests__/stage-2-customer-resolver.test.ts"
decisions:
  - "CR-02 fixed with an inline guard (string passthrough / object→.code), NOT loadBrandRegister — async load would need a nested step.run inside the already-wrapped resolve step (replay-unsafe); the inline guard is sufficient."
  - "WR-01 keeps the literal 'nxt' as the documented absent-key default (config.source.nxt_database read first), justified because every currently-onboarded NXT swarm shares the single 'nxt' database handle."
metrics:
  duration: 4m
  tasks: 2
  files: 2
  completed: "2026-06-04T16:10:39Z"
---

# Phase 114 Plan 06: Stage 2 Sales-Path Gap Closure (CR-01 / CR-02 / WR-01) Summary

Closed the two SC-1 blockers (CR-01 dead brand_id, CR-02 `[object Object]` entity_brand) and the related WR-01 nxt_database warning entirely inside the Stage 2 worker — the engine/config/steps files stayed byte-identical (no-engine-diff guard exit 0).

## What Changed

Three confined edits to `stage-2-customer-resolver.ts`, all on the generic (sales) dispatch path:

- **CR-01 — generic-path brand_id.** `effectiveBrandId = usesGenericPath ? resolutionConfig.scope.brand_scope[0] : brandId`. The sales mailbox has no `debtor.labeling_settings` row, so the prior `settingsRow.brand_id` was always null, leaving the brand-scoped `sender_match` and `factuur_match` permanently dead. The brand now comes from config (`'SB'`) and is passed to `resolver.resolveEntity`.
- **WR-01 — generic-path nxt_database.** `effectiveNxtDatabase = usesGenericPath ? (config.source.nxt_database ?? "nxt") : nxtDatabase`. Config-sourced first; the literal `"nxt"` remains only as the documented absent-key default (inline comment added).
- **CR-02 — entity_brand type guard.** Replaced the blind `[0] as string` cast with a guard: `string` passthrough, `object` → `.code`, else `null`. The result (`string | null`) flows unchanged to `resolution_audit.entity_brand` and to both `entity` + `entity_brand` on `coordinator.requested`.

The legacy `resolveDebtor(...)` call still receives `nxtDatabase as string` and `brandId` verbatim — debtor behaviour is byte-neutral (on that path `usesGenericPath` is false, so `effective*` === the legacy values).

Added a `describe("sales generic path — gap closure (Phase 114-06)")` block with three tests (A: brand_id reaches resolveEntity; B: string-shape entity_brand; C: object-shape entity_brand), mocking `loadStage2Resolver` and a sales swarm gate.

## Verification

- `npx vitest run lib/inngest/functions/__tests__/stage-2-customer-resolver.test.ts` → 23 passed (20 existing debtor + 3 new sales).
- Falsification check: reverting the CR-02 guard makes Test C fail (object → `[object Object]`), then restored → 23/23 green.
- `bash scripts/no-engine-diff-check.sh` → exit 0 (engine/config/steps byte-identical; dynamic.ts scoped-ok).
- `npm test` → 2461 passed, 0 failed, 22 files / 40 tests skipped (debtor neutrality + the existing 20/20 worker tests).
- `tsc --noEmit` → no errors in the worker or test files.

## Acceptance Criteria

- `grep "brand_scope"` → hits the `effectiveBrandId` derivation. ✓
- `grep "effectiveBrandId"` → passed as the generic-path `brand_id` argument. ✓
- blind `[0] as string` cast removed (only a comment mentions `brand_scope[0]`). ✓
- entity_brand guard reads `.code` for the object shape. ✓
- debtor-path tests green (neutrality). ✓
- no-engine-diff guard exit 0. ✓

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The fix wires real config data into the resolver; no placeholder values introduced.

## Self-Check: PASSED

- `web/lib/inngest/functions/stage-2-customer-resolver.ts` — FOUND (modified, committed a56cce82)
- `web/lib/inngest/functions/__tests__/stage-2-customer-resolver.test.ts` — FOUND (modified, committed 88bde9f0)
- Commit a56cce82 — FOUND
- Commit 88bde9f0 — FOUND
