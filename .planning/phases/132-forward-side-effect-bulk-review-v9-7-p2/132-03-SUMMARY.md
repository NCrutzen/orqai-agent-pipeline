---
phase: 132-forward-side-effect-bulk-review-v9-7-p2
plan: 03
subsystem: ui
tags: [bulk-review, info-routing, forward, operator-actions, hydrate, tdd, swarm-generic]

# Dependency graph
requires:
  - phase: 132-01
    provides: buildRoutingCategory / routing-category vocabulary (D-05); RoutingVerdict shape
  - phase: 132-02
    provides: info_routing_forwards store (forward-state.ts) + pipeline/forward.requested event + Stage-4 forward worker
  - phase: 131-info-routing-stage3-routing
    provides: persisted 6-field RoutingVerdict in coordinator_runs.decision_details.routing + resolveRoutingDestination/loadRoutingDestinations + DESTINATION_KEYS_BY_SWARM codegen
provides:
  - "BulkReviewRoutingSlot — flattened 6-field verdict + derived forward_status (held/forwarded/unrouted/dedup-skipped/stays) + run_id, hydrated data-gated on decision_details.routing"
  - "hydrate.ts routing projection — reads info_routing_forwards mirror + coordinator_runs.run_id; debtor/sales rows leave routing null (no swarm literal)"
  - "RoutingDetailPane — swarm-generic Stage-4 routing detail pane (6-field verdict + forward-status badge + D-08 re-route/forward-now/don't-forward controls)"
  - "Stage4Decide render-through — data-gated branch renders RoutingDetailPane on row.routing!==null; debtor/sales Stage-4 widget path byte-unchanged"
  - "routing-actions.ts — rerouteBucket (re-resolve+re-verdict) / forwardNow (gate-bypass, dedup-honored) / dontForward (suppress) server actions + per-file no-destructure guard"
affects: [134-v10-ambient-loop, sales-routing-go-live]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bulk Review row slot reuse (D-07): a new BulkReviewRoutingSlot hydrated alongside the existing stage_* slots, data-gated on the persisted verdict key — NO new view, NO swarm_type literal"
    - "forward_status DERIVED at hydration (verdict-first: unrouted→stays→dedup-skipped, else info_routing_forwards.status mirror) — not a stored column"
    - "Operator routing actions clone the override-actions Axis-2 pattern (auth gate → validate → write → {ok}); forward-now inline-emits pipeline/forward.requested via the never-aliased DynamicSend cast (learning dae6276) with its OWN per-file no-destructure guard"
    - "swarm-generic Stage4Decide shell renders the routing pane on row.routing!==null (after all hooks → hook-order-safe); debtor/sales fall through unchanged"

key-files:
  created:
    - web/lib/bulk-review/__tests__/hydrate-routing.test.ts
    - web/app/(dashboard)/automations/[swarm]/_shell/components/routing-detail-pane.tsx
    - web/app/(dashboard)/automations/[swarm]/_shell/components/routing-detail-pane.module.css
    - web/app/(dashboard)/automations/[swarm]/_shell/components/__tests__/routing-detail-pane.test.tsx
    - web/app/(dashboard)/automations/[swarm]/_shell/actions/routing-actions.ts
    - web/app/(dashboard)/automations/[swarm]/_shell/actions/__tests__/routing-actions.test.ts
  modified:
    - web/lib/bulk-review/types.ts
    - web/lib/bulk-review/hydrate.ts
    - web/lib/bulk-review/__tests__/hydrate.test.ts
    - web/app/(dashboard)/automations/[swarm]/_shell/components/stage-4-decide.tsx

key-decisions:
  - "routing slot is OPTIONAL (`routing?`) not strictly non-optional — mirrors the established `attachments?` / RankedIntent precedent so the 18 pre-existing inline BulkReviewRow fixtures stay assignable without churn; the hydrator (the ONE read path) ALWAYS projects it (null when no routing key). Consumers treat absent === null."
  - "Added run_id to BulkReviewRoutingSlot (not in the original Task-1 interface): the operator actions key coordinator_runs by run_id, so the pane must supply it. Hydrated by a coordinator_runs lookup by email_id ONLY when a routing verdict is present (non-routing swarms add no round-trip)."
  - "Stage4Decide render-through branch sits AFTER all hooks (not as a top-of-function early return) to satisfy react-hooks/rules-of-hooks — a row's routing identity is stable for its whole mount (keyed by email_label_id upstream), so consistent hook order holds."

requirements-completed: [FWD-08, FWD-09]

# Metrics
duration: ~95min (active; ~160min wall-clock incl. context reads)
completed: 2026-06-18
---

# Phase 132 Plan 03: Info-routing Bulk Review surface Summary

**The operator-facing info-routing Bulk Review surface — a swarm-generic routing detail pane (6-field verdict + forward-status badge + the three D-08 operator controls) hydrated from the persisted verdict + forward-state mirror and rendered from the existing Stage4Decide shell, plus the re-route / forward-now / don't-forward server actions — built by REUSING the swarm-generic bulk-review primitives (D-07), no fork, no new view.**

## Performance

- **Duration:** ~95 min active (TDD RED→GREEN one assertion at a time under the tdd-guard hook)
- **Tasks:** 3, all autonomous
- **Files:** 10 (6 created, 4 modified)

## Accomplishments

- **Task 1 — routing slot hydration** (`dba9e795` + `6c6bfc81`): `BulkReviewRoutingSlot` (bucket/brand/target_mailbox/confidence/dedup_status/dedup_layer/unrouted + derived `forward_status` + `run_id`) added to `types.ts`; `hydrate.ts` reads the `info_routing_forwards` status mirror + projects `decision_details.routing` into the slot, deriving `forward_status` (unrouted → stays → dedup-skipped, else the forwards-mirror: sent→forwarded / else held). DATA-GATED on the presence of `decision_details.routing` — debtor/sales rows leave the slot null with NO swarm_type literal. `run_id` looked up from `coordinator_runs` by email_id (only when a verdict is present). 7 hydrate-routing tests (all 6 forward_status derivations + debtor-null + run_id).
- **Task 3 — routing-actions** (`2dae5274`): three server actions cloning the override-actions auth-gate + validation + `{ok}` shape. `rerouteBucket` re-resolves the target via `resolveRoutingDestination(loadRoutingDestinations(...))` and writes a NEW operator-sourced verdict to `coordinator_runs.decision_details.routing` (OQ-3 — new verdict, not a patch). `forwardNow` HARD-REFUSES unrouted / null-target / already_addressed BEFORE any send (OQ-3 / T-132-10 + T-132-12), then inline-emits `pipeline/forward.requested {operator_forced:true}` via the never-aliased `DynamicSend` cast — bypassing only the per-bucket gate (worker dedup + forward_state idempotency still apply). `dontForward` records forward_state `skipped`. A dedicated per-file no-destructure guard preserves the dae6276 contract; override-actions.ts guard untouched. 8 tests.
- **Task 2 — RoutingDetailPane + Stage4Decide wiring** (`d29b5582`): a `"use client"` pane rendering the 6 verdict fields + a `data-testid="routing-forward-status"` badge whose text contains the status token, plus the three D-08 controls (re-route `<select>` sourced from `DESTINATION_KEYS_BY_SWARM` codegen — NOT hardcoded — + audit-note + Re-route / Forward-now / Don't-forward buttons) wired through `useTransition` + the Task-3 actions + `markPendingRemoval`. Forward-now is absent whenever target is null / unrouted / already forwarded / no run_id (algemeen + unrouted surface for human handling). Wired into `stage-4-decide.tsx` via a data-gated branch (after all hooks) so info-routing rows get the pane and debtor/sales rows keep the existing Stage-4 widget unchanged. 11 RTL tests incl. the render-through + debtor-null shell-parity assertions.

## Task Commits

1. **Task 1: routing slot hydration** — `dba9e795` (feat) — 6 forward_status derivations + debtor-null; Test-7 ceiling bumped 7→8.
2. **Task 1 follow-up: run_id threading** — `6c6bfc81` (feat) — coordinator_runs.run_id into the slot for the operator actions.
3. **Task 3: routing-actions** — `2dae5274` (feat) — reroute/forward-now/dont-forward + per-file no-destructure guard.
4. **Task 2: RoutingDetailPane + Stage4Decide wiring** — `d29b5582` (feat) — pane + 11 RTL tests incl. render-through.

_TDD discipline enforced by the tdd-guard hook — every function/element was driven stub→RED→GREEN one assertion at a time._

## Decisions Made

- **Optional `routing?` slot (not strictly non-optional):** the plan's Task-1 interface wrote `routing: BulkReviewRoutingSlot | null`, but 18 pre-existing inline `BulkReviewRow` fixtures across the test suite construct rows without it. Following the established `attachments?` / `RankedIntent` precedent (documented in types.ts as the explicit low-churn choice), the field is `routing?` so those fixtures stay assignable; the hydrator (the single read path) always projects it. Functionally identical to the plan intent (null for non-routing swarms).
- **`run_id` added to the slot (beyond the Task-1 spec):** the D-08 operator actions key `coordinator_runs` by `run_id`, so the pane must carry it. Hydrated by a single coordinator_runs-by-email_id lookup, gated on the routing verdict's presence (non-routing swarms unaffected). This is a Rule-2 critical addition — the actions cannot function without it.
- **Render-through branch placed after all hooks:** to keep `react-hooks/rules-of-hooks` happy (the pre-push lint enforces it), the `row.routing!==null` branch sits after Stage4Decide's `useState`/`useMemo`/`useTransition` calls. A row's routing identity is stable for its mount lifetime (the parent keys each row by email_label_id), so hook order is consistent across renders.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test] Bumped hydrate Test-7 unique-table ceiling 7 → 8**
- **Found during:** Task 1
- **Issue:** `hydrate.test.ts` "Test 7" asserts the hydrator makes at most 7 distinct table queries. My new `info_routing_forwards` read (a deliberate, bounded addition) made it 8.
- **Fix:** Bumped the ceiling to 8 and documented the new read in the test comment + the second-hydrate assertion comment.
- **Files modified:** web/lib/bulk-review/__tests__/hydrate.test.ts
- **Committed in:** dba9e795

**2. [Rule 2 - Missing critical] Added `run_id` to the routing slot**
- **Found during:** Task 2 (wiring the pane to the actions)
- **Issue:** The Task-1 slot interface had no `run_id`, but the D-08 operator actions key coordinator_runs by run_id — the pane could not call them.
- **Fix:** Added `run_id: string | null` to `BulkReviewRoutingSlot`; hydrate it from coordinator_runs by email_id (verdict-gated). Driven by a dedicated RED test.
- **Files modified:** web/lib/bulk-review/types.ts, web/lib/bulk-review/hydrate.ts, web/lib/bulk-review/__tests__/hydrate-routing.test.ts
- **Committed in:** 6c6bfc81

**3. [Rule 3 - Non-blocking adjustment] `routing?` optional instead of strictly non-optional**
- **Found during:** Task 1
- **Issue:** A strictly non-optional `routing` field would break 18 pre-existing inline BulkReviewRow fixtures across the suite (tsc errors).
- **Fix:** Made the field optional (`routing?`) per the established `attachments?` precedent; the hydrator always projects it. Documented in types.ts.
- **Files modified:** web/lib/bulk-review/types.ts
- **Committed in:** dba9e795

---

**Total deviations:** 3 (1 test-ceiling bump my change caused, 1 Rule-2 critical run_id addition, 1 low-churn optionality choice). No scope creep. The unrelated parallel-session files (`20260618_info_routing_stage1_archive_golive.sql`, `info-routing-backlog-reprocess.ts`) were left untouched; OUTLOOK_CONNECTION_ID / client.ts untouched.

## Issues Encountered

- The tdd-guard hook enforced strict one-test-at-a-time + minimal-implementation-per-RED. Several edits were rejected for adding multiple tests or over-implementing past the single failing assertion; each was split into the minimal RED→GREEN increment. The vitest reporter wired in 132-01 fed the guard correctly throughout (no "no test data" stalls).
- One false-positive GREEN during RED (a refusal test whose loose `res.ok===false` assertion was satisfied by the stub's "not implemented" return). Per the fail-fast rule, the test was strengthened to assert the specific refusal code (`refused_unrouted`) before implementing — yielding a real RED.

## Threat Flags

None — no new security surface beyond the plan's threat model. T-132-09 (auth gate on every action: getUser→401), T-132-10 + T-132-12 (forwardNow hard-refuses unrouted/null-target/already_addressed before any send; only the per-bucket gate is bypassed, dedup + forward_state idempotency still apply), T-132-11 (rerouteBucket re-resolves via the registry → unmatched bucket yields null target, not forwardable), T-132-15 (swarm_type carried as data only — 0 `===` branches in routing-actions.ts; per-file no-destructure guard added) all mitigated. No new packages (T-132-SC).

## User Setup Required

None — the surface is observe-and-act for operators; no external configuration. (Per-bucket go-live remains a Plan-04 migration-apply + operator dry_run_config flip.)

## Next Phase Readiness

- **Plan 04 (migration apply)** is unaffected by this UI plan; it still owns applying `20260618c_phase132_forward_buckets_and_state.sql` + `npm run check:supabase`. The operator surface reads `info_routing_forwards` (authenticated FOR SELECT) once that table is applied.
- **Phase 134 (V10 ambient loop)** can consume operator corrections via the new operator-sourced verdict (`operator_sourced:true` + `operator_id` on the re-routed verdict) and the `skipped` forward-state rows.

## Self-Check: PASSED

- All 6 created files + 4 modified files verified present on disk (see below).
- All 4 task commits (dba9e795, 6c6bfc81, 2dae5274, d29b5582) verified in git log.
- Full verification: `npx vitest run lib/bulk-review "app/(dashboard)/automations/[swarm]/_shell"` → 614 passed / 56 files; override-actions.test.ts + routing-actions.test.ts + SWARM-02 guard all green; `npx tsc --noEmit` → 0 errors; no swarm_type literal added to hydrate.ts (1 pre-existing isDebtor line) or routing-actions.ts (0); re-route options sourced from DESTINATION_KEYS_BY_SWARM codegen (0 hardcoded bucket literals).

---
*Phase: 132-forward-side-effect-bulk-review-v9-7-p2*
*Completed: 2026-06-18*
