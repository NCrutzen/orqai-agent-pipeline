---
phase: 132-forward-side-effect-bulk-review-v9-7-p2
plan: 02
subsystem: api
tags: [inngest, outlook, graph, forward, info-routing, dry-run-gate, idempotency, tdd]

# Dependency graph
requires:
  - phase: 132-01
    provides: forwardMessage + mergeRoutingCategory + isForwardBucketReleased + Wave-0 RED forward scaffold
  - phase: 131-info-routing-stage3-routing
    provides: RoutingVerdict (bucket/brand/target_mailbox/dedup/unrouted) persisted in coordinator_runs.decision_details.routing
  - phase: 117-outlook-intent-categories
    provides: swarm-agnostic gated worker skeleton + written-category-store CRUD shape
provides:
  - "stage4InfoRoutingForwardWorker — swarm-agnostic Stage-4 forward worker on pipeline/forward.requested (3 hard skips + per-bucket gate + D-02 idempotency, side-effect in step.run, replay-isolated stamp)"
  - "forward-state.ts — info_routing_forwards idempotency store (recordForwardState/readForwardState, upsert-on-conflict email_id, read-null-absent)"
  - "coordinator pipeline/forward.requested emit (gated on forwardable verdict + isForwardBucketReleased; stage_3_routing held untouched)"
  - "pipeline/forward.requested typed Events key"
  - "20260618c migration — stage_4_forward_buckets seed (all held) + info_routing_forwards RLS table (NOT applied)"
affects: [132-03-bulk-review-pane, 132-04-migration-apply, 134-v10-ambient-loop]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stage-4 forward worker = Phase-117 gated-worker skeleton clone; verdict read from coordinator_runs.decision_details.routing keyed by replay-safe run_id"
    - "D-02 replay isolation: forwardMessage and the category-stamp PATCH live in SEPARATE step.run boundaries so a replay after a successful send re-runs only the stamp"
    - "Dedicated pipeline/forward.requested event decouples the forward side-effect from the permanently-held stage_3_routing intent-dispatch gate (RESEARCH A4)"

key-files:
  created:
    - web/lib/inngest/functions/stage-4-info-routing-forward.ts
    - web/lib/automations/info-routing/forward-state.ts
    - web/lib/automations/info-routing/__tests__/forward-state.test.ts
    - web/lib/inngest/functions/__tests__/coordinator-forward-request-emit.test.ts
    - supabase/migrations/20260618c_phase132_forward_buckets_and_state.sql
  modified:
    - web/lib/inngest/functions/__tests__/stage-4-info-routing-forward.test.ts
    - web/lib/inngest/functions/debtor-email-coordinator.ts
    - web/lib/inngest/functions/__tests__/coordinator-swarm-branch-guard.test.ts
    - web/app/api/inngest/route.ts
    - web/lib/inngest/events.ts

key-decisions:
  - "Followed the PLAN <behavior>/<acceptance_criteria> over the earlier Wave-0 scaffold prose: the three skips AND a held bucket make ZERO Graph calls (no held/dedup category stamp); only a successful forward stamps the category. This satisfies every acceptance criterion ('held-bucket no-call', 'three skips no Graph call')."
  - "Added pipeline/forward.requested to the typed Events record so the worker's createFunction trigger typechecks; kept the coordinator's inline SendFn cast as the emit mechanism per the plan (cast is harmless once the key is typed and preserves the dynamic-name pattern)."
  - "forward-state records draft_id=null on the sent row — forwardMessage (132-01, 2-call flow) does not surface the Graph draft id; D-02 only needs status='sent'."

requirements-completed: [FWD-01, FWD-02, FWD-04, FWD-05, FWD-06, FWD-07, FWD-10]

# Metrics
duration: ~45min
completed: 2026-06-18
---

# Phase 132 Plan 02: Stage-4 forward side-effect worker Summary

**The swarm-agnostic Stage-4 forward worker (stage4InfoRoutingForwardWorker) — reads the persisted RoutingVerdict, applies the three hard skips + per-bucket release gate + D-02 forward-state idempotency, forwards the source info@ mail via forwardMessage in an isolated step.run, then stamps the routing category in a SEPARATE step.run — plus the coordinator pipeline/forward.requested emit, the SWARM-02 guard extension, and the held-by-default seed + RLS migration.**

## Performance

- **Duration:** ~45 min (retry; prior attempt died on a transient API error before any commit — started fresh from Task 1)
- **Tasks:** 3, all autonomous
- **Files:** 10 (5 created, 5 modified)

## Accomplishments

- **stage4InfoRoutingForwardWorker** (Task 1): a near-clone of the Phase-117 gated worker skeleton, `retries: 0`. Reads the verdict from `coordinator_runs.decision_details.routing` (keyed by the replay-safe `run_id`), then:
  - three hard skips read VERDICT fields only — `unrouted` → `skip:unrouted`, `target_mailbox===null` → `skip:stays`, `dedup.status==='already_addressed'` → `skip:dedup:<layer>` — NO bucket-name literal.
  - per-bucket `isForwardBucketReleased` re-check inside the worker (fail-closed, T-132-08) → `held`.
  - resolves source_id/mailbox/raw_json; `originalSender = raw_json.from→sender` (Pitfall 2 fallback proven by a test); legacy row missing source/mailbox → fail-soft `unresolved`.
  - D-02 idempotency: `readForwardState==='sent'` short-circuits BEFORE the forward → `already-sent` (no double-forward on replay).
  - `forwardMessage` in its own `step.run("do-forward")`; the category stamp GET-merge-PATCH in a SEPARATE `step.run("stamp-category")` so a replay after a successful send re-runs only the stamp (D-02 replay isolation); best-effort audit in try/catch.
- **forward-state.ts** (Task 1): `recordForwardState` upsert-on-conflict(email_id) + `readForwardState` returns null (never throws) on absent/error. 5 unit tests.
- **Coordinator forward-request emit** (Task 2): a new `step.run("emit-forward-request")` after `persist-routing-verdict`, gated on the verdict being forwardable AND `isForwardBucketReleased`, emitting `pipeline/forward.requested {swarm_type, run_id, email_id}` via an inline `SendFn` cast (never aliased — Phase 65). The `stage_3_routing` held gate + `predicted_held` return are byte-unchanged (RESEARCH A4 / Pitfall 5).
- **SWARM-02 guard extension** (Task 2): `stage-4-info-routing-forward.ts` + the Plan-03 `routing-actions.ts` (with an `existsSync` skip) added to `SHARED_WORKERS`; gate green.
- **Worker registration** (Task 2): `stage4InfoRoutingForwardWorker` in the Inngest serve array; `pipeline/forward.requested` added to the typed Events record.
- **Migration** (Task 3): `stage_4_forward_buckets` seeded `{}` (all held, D-04, jsonb `||` merge) + `info_routing_forwards` RLS table (service_role FOR ALL + authenticated FOR SELECT, no anon). WRITTEN, NOT applied — Plan 04 owns the apply.

## Task Commits

1. **Task 1: forward worker + forward-state store** — `53bda7ed` (feat) — incremental RED→GREEN per behaviour (15 tests).
2. **Task 2: coordinator emit + SWARM-02 guard + registration** — `9f949c13` (feat) — RED emit test → GREEN; tsc clean; 405 tests green.
3. **Task 3: migration** — `d27d6d54` (feat) — held-by-default seed + RLS table.

_TDD discipline enforced by the tdd-guard hook — each function was driven stub→RED→GREEN one assertion at a time._

## Decisions Made

- **Skip/held = zero Graph call (no stamp):** the PLAN `<behavior>` + `<acceptance_criteria>` are authoritative over the earlier Wave-0 scaffold prose (which suggested stamping `held`/`dedup` categories). The acceptance criteria explicitly require "held-bucket no-call" and "three skips no Graph call", so only a successful forward stamps `AI: routed → <bucket>`. This is the safer, spec-aligned interpretation; the worker tests pin it.
- **pipeline/forward.requested typed + SendFn cast both kept:** the worker's `createFunction` trigger needs the event in the typed `Events` record (otherwise TS rejects it as `undefined`), so it was added there. The coordinator emit keeps the inline `(inngest.send as unknown as SendFn)` cast per the plan — harmless now the key is typed, and it preserves the never-alias rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration filename collision → renamed 20260617e → 20260618c**
- **Found during:** Task 3
- **Issue:** The plan named the migration `20260617e_phase132_forward_buckets_and_state.sql`, but `20260617e_phase131_algemeen_no_forward.sql` already exists in `supabase/migrations/` — a hard filename collision that would also break lexical apply-order.
- **Fix:** Renamed to `20260618c_phase132_forward_buckets_and_state.sql` (next free suffix after the untracked `20260618b`). Content is exactly as specified by the plan. Documented in the migration header.
- **Files modified:** supabase/migrations/20260618c_phase132_forward_buckets_and_state.sql
- **Committed in:** d27d6d54

**2. [Rule 3 - Blocking] pipeline/forward.requested added to the typed Events record**
- **Found during:** Task 2 (tsc --noEmit)
- **Issue:** `inngest.createFunction({...}, { event: "pipeline/forward.requested" }, ...)` failed tsc (`Type '"pipeline/forward.requested"' is not assignable to type 'undefined'`) because the event was not a key in the typed `Events` record.
- **Fix:** Added the `pipeline/forward.requested` entry (`{swarm_type, run_id, email_id}`) to `web/lib/inngest/events.ts`, mirroring the `pipeline/intent-label.requested` shape. The coordinator emit keeps its inline SendFn cast per the plan.
- **Files modified:** web/lib/inngest/events.ts
- **Committed in:** 9f949c13
- **Verification:** `npx tsc --noEmit` → 0 errors.

---

**Total deviations:** 2 (both Rule-3 blocking, both necessary to compile/avoid collision). No scope creep. OUTLOOK_CONNECTION_ID untouched; the migration was NOT applied; the unrelated parallel-session files (20260618_info_routing_stage1_archive_golive.sql, info-routing-backlog-reprocess.ts) were left alone.

## Issues Encountered

- The tdd-guard hook (wired in 132-01) enforced strict one-test-at-a-time + no-implementation-before-RED. All work was driven RED→GREEN one assertion at a time; no guard bypass.

## Threat Flags

None — no new security surface beyond the threat model. The forward side-effect is gated fail-closed by `isForwardBucketReleased` re-checked inside the worker (T-132-08), D-02 idempotent via forward-state (T-132-04), the three hard skips read verdict fields (T-132-06), and the category stamp strip-merges AI: labels (T-132-07). The new `info_routing_forwards` table ships RLS-enabled (service_role FOR ALL + authenticated FOR SELECT, no anon) per CLAUDE.md.

## User Setup Required

None — the worker ships INERT (every bucket held by default, D-04). A per-bucket go-live is a one-line `dry_run_config` jsonb UPDATE (Plan 04 applies the migration; an operator later flips a bucket to `true`).

## Next Phase Readiness

- **Plan 03 (Bulk Review pane)** can read forward status from `info_routing_forwards` (authenticated FOR SELECT) and the verdict from `decision_details.routing`. The SWARM-02 guard already pins `routing-actions.ts` (existsSync-skipped until Plan 03 lands it).
- **Plan 04 (migration apply)** owns applying `20260618c_phase132_forward_buckets_and_state.sql` + `npm run check:supabase`.

## Self-Check: PASSED

- All 5 created files + 5 modified files verified present on disk.
- All three task commits (53bda7ed, 9f949c13, d27d6d54) verified in git log.
- Full verification: `npx vitest run lib/inngest/functions lib/automations/info-routing lib/pipeline-gating` → 405 passed / 14 skipped; `npx tsc --noEmit` → 0 errors; SWARM-02 guard green; migration RLS-compliant + NOT applied; OUTLOOK_CONNECTION_ID untouched.

---
*Phase: 132-forward-side-effect-bulk-review-v9-7-p2*
*Completed: 2026-06-18*
