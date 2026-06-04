---
phase: 114-stage-2-resolver-reuse-cross-swarm-generality-proof
plan: 04
subsystem: api
tags: [stage-2, resolver, nxt-rest, inngest, supabase, registry-driven, sales-email, resolution-config]

# Dependency graph
requires:
  - phase: 114-01
    provides: generic resolveEntity engine + loadStage2Resolver dispatch + debtor config+adapter refactor (RESL-03 seam transplanted verbatim)
  - phase: 114-02
    provides: generic email_pipeline.resolution_audit table + stage_2_resolution fail-closed gate key
  - phase: 114-03
    provides: hardened Outlook ingest (sender fallback + has_attachments) + data-driven identifier-mining frequency report (D-04)
provides:
  - Sales resolve-customer adapter (resolveEntity) wiring offerte/order/Sites lookups via nxtRequest, delegating to the generic engine
  - Sales offerte/order/Sites lookups with regex identifier-format validation before any NXT call (V5)
  - One bundler-mandated dispatch line registering sales in STAGE2_RESOLVER_MODULES (the sole Engine-adjacent touch)
  - Real sales resolution_config on remote (replaces inert_placeholder); precedence data-driven from the Plan 03 mining report (D-04)
  - Sales Stage 2 swarm_dispatch event seeded on sales-email/unknown (Pitfall 6 — sales rows now reach Stage 2)
  - Registry-driven Stage 2 worker: dispatches via loadStage2Resolver, writes non-debtor swarms to resolution_audit, gated fail-closed, second Inngest trigger for the sales event
affects: [114-05, sales-stage-3, stage2-cut-over, d06-corroboration-fast-follow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-swarm Stage 2 onboarding via config + ONE dispatch line + a swarm-specific lookup adapter — ZERO edits to engine.ts/config.ts/resolve/steps/* (STAGE2-01 generality proof)"
    - "Sales adapter wires new lookups as candidate sources, then delegates precedence/short-circuit to the generic resolveEntity (PATTERNS Pattern 3 option b)"
    - "Registry-data-driven audit-target routing in the Stage 2 worker (debtor→email_labels, others→resolution_audit) — no if-swarm literal"
    - "Identifier-format regex validation runs BEFORE any nxtRequest call (untrusted email body — V5 input validation)"

key-files:
  created:
    - web/lib/automations/sales-email/resolve-customer.ts
    - web/lib/automations/sales-email/lookups/offerte.ts
    - web/lib/automations/sales-email/lookups/order.ts
    - web/lib/automations/sales-email/lookups/sites.ts
    - web/lib/automations/sales-email/__tests__/resolve-customer.test.ts
    - supabase/migrations/20260604b_sales_resolution_config.sql
    - .planning/todos/pending/2026-06-04-d06-corroboration-fast-follow.md
  modified:
    - web/lib/swarms/dynamic.ts
    - web/lib/swarms/types.ts
    - web/lib/inngest/events.ts
    - web/lib/inngest/functions/stage-2-customer-resolver.ts

key-decisions:
  - "Iteration 1 ships precedence-only + single-hit short-circuit (RESEARCH OQ-1); no corroborate field (engine would silently ignore it — Pitfall 3)"
  - "D-06 multi-match corroboration DEFERRED to a fast-follow (operator chose option a); tripwire todo asserts the corroboration ENGINE change must land BEFORE the no-Engine-diff measurement is treated as the final STAGE2-01 gate"
  - "Precedence is data-driven from the Plan 03 mining report (D-04): sender_match → offerte_match → postcode_site_match → factuur_match → order_match; case_ref (18%) excluded — no account lookup, corroborating-only"
  - "offerte leads postcode despite lower volume: explicit offerte number is a higher-confidence single-account signal than a multi-Site postcode (confidence ordering WITHIN the data-driven kind set, not hand-curation)"
  - "auto_safe_kinds:[] → self-auth tier is a no-op (STAGE2-02); customer-less prospects fall through to Stage 3 (STAGE2-02)"
  - "Sales Stage 2 audit write fail-closed via dry_run_config.stage_2_resolution=true — blocked / dry-run until cut-over"
  - "Migration applied to remote (mvqjhlxfvtqqubqgdvhz) via Management API (HTTP 201) — schema_push_requirement satisfied, not just written"

patterns-established:
  - "Stage 2 cross-swarm generality: a new swarm resolves with config + one dispatch line + a lookup adapter, no shared-engine diff"
  - "Worker audit-target derived from registry data, not per-swarm branches (SWARM-02-clean)"

requirements-completed: [STAGE2-01, STAGE2-02]

# Metrics
duration: ~4h (spanned a blocking checkpoint + operator decision)
completed: 2026-06-04
---

# Phase 114 Plan 04: Sales Stage 2 Resolver Reuse — Cross-Swarm Generality Proof Summary

**Sales onboards to Stage 2 via config + one dispatch line + a sales lookup adapter (offerte/order/Sites via nxtRequest) with ZERO changes to the resolution engine — real resolution_config live on remote, registry-driven worker writing to the generic audit table, fail-closed until cut-over.**

## Performance

- **Duration:** ~4h (execution spanned the Task 3 blocking checkpoint and the operator's two decisions)
- **Completed:** 2026-06-04
- **Tasks:** 4 of 4 (Task 0 pre-flight gate, Task 1 TDD, Task 2a, Task 2b, Task 3 checkpoint)
- **Files modified:** 11 (7 created, 4 modified)

## Accomplishments

- **STAGE2-01 generality proof in action:** sales resolves at Stage 2 with NO edits to `engine.ts` / `config.ts` / `resolve/steps/*` — only config (migration), one bundler-mandated dispatch line, and a sales-specific lookup adapter.
- **Sales resolve-customer adapter** (`resolveEntity`) wires offerte/order/Sites lookups via `nxtRequest`, reuses debtor factuur + sender lookups (D-11), then delegates precedence/short-circuit to the generic engine (PATTERNS Pattern 3 option b).
- **Real sales `resolution_config` live on remote** (replaces the `inert_placeholder`): data-driven precedence from the Plan 03 mining report (D-04), `auto_safe_kinds:[]` (STAGE2-02 no-op), `llm_tiebreaker:false`.
- **Sales rows now reach Stage 2:** `swarm_dispatch = 'sales-email/stage-2.customer-resolve.requested'` seeded on the sales `unknown` noise category (Pitfall 6); the worker has a second Inngest trigger on that event.
- **Registry-driven Stage 2 worker:** dispatches via `loadStage2Resolver`, routes audit writes by registry data (debtor→`email_labels`, others→`email_pipeline.resolution_audit`), gated fail-closed by `stage_2_resolution`; debtor path behaviour-neutral.
- **Migration applied to remote** (`mvqjhlxfvtqqubqgdvhz`) via the Management API (HTTP 201); `npm run check:supabase` → 0 ERROR.

## Task Commits

1. **Task 1: Sales lookups + resolve-customer adapter + dispatch line** - `e46d4c28` (feat) — offerte/order/sites lookups, resolve-customer adapter, one STAGE2_RESOLVER_MODULES line, TDD test suite (offerte hit / unresolved fall-through / self-auth no-op / identifier-format rejection).
2. **Task 2a: Seed real sales resolution_config migration** - `ce5f3167` (feat) — replaces inert placeholder with data-driven precedence (D-04), seeds `stage_2_resolution=true` fail-closed + the sales Stage 2 `swarm_dispatch` event (Pitfall 6).
3. **Task 2b: Rewire Stage 2 worker to the registry path** - `71886dfa` (feat) — `loadStage2Resolver` dispatch, generic `resolution_audit` write for non-debtor swarms, second Inngest trigger for the sales event, coordinator.requested for resolved + unresolved; debtor behaviour-neutral.
4. **D-06 corroboration fast-follow tripwire** - `d0e06bc8` (docs) — `.planning/todos/pending/2026-06-04-d06-corroboration-fast-follow.md` capturing the CTO corroboration requirement + the hard constraint that the corroboration ENGINE change lands before the no-Engine-diff gate is final.

**Task 0 (pre-flight gate):** PR #63 (nxtRequest REST proxy) merged + prod-deployed and the Plan 03 mining report committed — confirmed before Task 1.

**Plan metadata:** this commit (docs: complete plan).

## Files Created/Modified

- `web/lib/automations/sales-email/resolve-customer.ts` — sales `resolveEntity` adapter; wires lookups + delegates to engine.
- `web/lib/automations/sales-email/lookups/offerte.ts` — offertenummer → account via nxtRequest, regex-validated.
- `web/lib/automations/sales-email/lookups/order.ts` — ordernummer/werkorder → account, regex-validated.
- `web/lib/automations/sales-email/lookups/sites.ts` — postcode/adres → Site → account via listSites.
- `web/lib/automations/sales-email/__tests__/resolve-customer.test.ts` — four behavior-case tests.
- `supabase/migrations/20260604b_sales_resolution_config.sql` — real sales resolution_config + dry_run gate + Stage 2 swarm_dispatch.
- `web/lib/swarms/dynamic.ts` — one sales entry in STAGE2_RESOLVER_MODULES (sole Engine-adjacent touch).
- `web/lib/swarms/types.ts`, `web/lib/inngest/events.ts` — types + event name for the sales Stage 2 trigger.
- `web/lib/inngest/functions/stage-2-customer-resolver.ts` — registry-driven dispatch + generic audit write + second trigger.
- `.planning/todos/pending/2026-06-04-d06-corroboration-fast-follow.md` — D-06 tripwire.

## Decisions Made

- **Checkpoint decision 1 — migration applied:** the operator (via orchestrator) applied `20260604b_sales_resolution_config.sql` to remote `mvqjhlxfvtqqubqgdvhz` via the Management API (HTTP 201). Verified on remote: sales-email `resolution_config->>'version'` = `2026-06-04.v1`, `precedence` = `["sender_match","offerte_match","postcode_site_match","factuur_match","order_match"]`, `llm_tiebreaker` = false; `dry_run_config->>'stage_2_resolution'` = `true` (fail-closed); sales-email/unknown `swarm_dispatch` = `sales-email/stage-2.customer-resolve.requested`. `npm run check:supabase` → 0 ERROR, 6 WARN, 23 INFO. OK.
- **Checkpoint decision 2 — D-06 corroboration DEFERRED with tripwire (operator chose option a):** iteration 1 ships precedence-only; multi-match corroboration ("multi matchen om de zekerheid te verhogen") is deferred to a fast-follow. The tripwire todo at `.planning/todos/pending/2026-06-04-d06-corroboration-fast-follow.md` records the hard constraint that any corroboration ENGINE change must land BEFORE the no-Engine-diff measurement is treated as the final STAGE2-01 gate. Plan 05 Task 3 asserts this file exists when the defer path is taken.
- Precedence ordering rationale (offerte ahead of higher-volume postcode) documented inline in the migration header — confidence ordering within the data-driven candidate set, not hand-curation (D-04 honored).

## Deviations from Plan

None - plan executed exactly as written. Iteration-1 scope (precedence-only, D-06 deferred) was the planned-and-checkpointed path, not a deviation.

## Issues Encountered

- **Task 3 was a blocking checkpoint by design** (migration apply + D-06 path confirmation). Execution paused; the orchestrator applied the migration and the operator confirmed both decisions ("applied + corroboration deferred"). This summary records the cleared checkpoint and its two decisions.

## User Setup Required

None - no external service configuration required. (Remote migration apply was performed by the orchestrator during the checkpoint.)

## Next Phase Readiness

- **Plan 05** (no-Engine-diff measurement / STAGE2-01 formal gate) is unblocked: sales dispatches through the seam, resolution_config is real on remote, the worker is registry-driven, debtor is behaviour-neutral.
- **Gate dependency for Plan 05:** the D-06 corroboration tripwire todo MUST be honored — the corroboration engine change has to land before the no-Engine-diff claim is treated as final. Plan 05 Task 3 checks the tripwire file exists.
- Sales Stage 2 remains **fail-closed** (`stage_2_resolution=true` → dry-run) until an explicit cut-over; no live sales audit side effects yet.

## Self-Check: PASSED

- `114-04-SUMMARY.md` — FOUND
- Task commits `e46d4c28`, `ce5f3167`, `71886dfa`, `d0e06bc8` — FOUND
- Metadata commit `3dc96c4e` — FOUND

---
*Phase: 114-stage-2-resolver-reuse-cross-swarm-generality-proof*
*Completed: 2026-06-04*
