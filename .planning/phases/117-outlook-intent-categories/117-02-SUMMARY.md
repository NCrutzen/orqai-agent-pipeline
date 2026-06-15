---
phase: 117-outlook-intent-categories
plan: 02
subsystem: pipeline
tags: [outlook, microsoft-graph, inngest, dry-run-gate, swarm-agnostic, idempotency, never-clobber, vitest]

# Dependency graph
requires:
  - phase: 117-01
    provides: "buildIntentCategory/mergeIntentCategory mapper, stage_3_intent_label gate key, recordWrittenCategory/readWrittenCategory store, swarm_written_categories migration (written)"
  - phase: 113-stage-3-sales-intent-agent-greenfield
    provides: "Stage-3 ranked-intent verdict (ranked[0].intent) the worker labels"
  - phase: 112-outlook-cleanup-backfill-gated-production-writes
    provides: "dry_run_config gated-write infra (isStageBlocked) + graphFetch Graph PATCH boundary"
provides:
  - "pipeline/intent-label.requested typed event (swarm-agnostic Stage-3 → label seam)"
  - "Coordinator intent-label emit-hook (open + held paths, additive)"
  - "stage3IntentLabelWorker — swarm-agnostic gated Graph AI:-category writer (idempotent + never-clobber)"
  - "112.5 written-category baseline read-contract documentation (D-5)"
affects: [112.5-outlook-behavior-tracking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Swarm-agnostic Inngest worker: loadSwarm + isStageBlocked gate, zero swarm_type literals (SWARM-02)"
    - "Dedicated per-side-effect gate key (stage_3_intent_label ⊥ stage_3_routing ⊥ stage_3_labeling)"
    - "Write-on-change idempotency via readWrittenCategory + never-clobber via 112.5 ledger join"
    - "Full-merged-array Graph PATCH (mergeIntentCategory strip-stale) vs categorizeEmail additive merge"

key-files:
  created:
    - web/lib/inngest/functions/stage-3-intent-label-worker.ts
    - web/lib/inngest/functions/__tests__/stage-3-intent-label-worker.test.ts
    - web/lib/inngest/functions/__tests__/coordinator-intent-label-emit.test.ts
  modified:
    - web/lib/inngest/events.ts
    - web/lib/inngest/functions/debtor-email-coordinator.ts
    - web/app/api/inngest/route.ts
    - docs/swarm-behavior-tracking.md

key-decisions:
  - "intent-label emit fires on BOTH the routing-GATED/held path and the OPEN path — the category WRITE gate (stage_3_intent_label) is independent of the routing gate (stage_3_routing) (D-2/D-3)"
  - "Worker resolves current categories from Graph (GET ?$select=categories) at write time, like categorizeEmail — emails table has no persisted categories column"
  - "Never-clobber checks BOTH swarm_email_transitions.kind='category_edited' AND swarm_review_signals.transition_kind='category_edited' for the email_id (D-4.2)"
  - "Audit row written as stage-4 pipeline_events decision='intent_label_written', best-effort (try/catch) so a unique-violation never dead-letters a successful Graph write"
  - "[BLOCKING] migration-apply HALTED for operator checkpoint — NOT applied to production by the executor"

patterns-established:
  - "Second Outlook swarm onboards to intent-labelling via a swarms registry row only (stage_3_intent_label flag) — proven by a worker with zero swarm literals + a second-swarm test"

requirements-completed: [OUTLOOK-CAT-01, OUTLOOK-CAT-02, OUTLOOK-CAT-03, OUTLOOK-CAT-04, OUTLOOK-CAT-05]

# Metrics
duration: 11min
completed: 2026-06-15
---

# Phase 117 Plan 02: Intent→Outlook-Category Correction Loop Summary

**Wired the Plan 01 primitives into the live pipeline: the shared coordinator now emits a swarm-agnostic `pipeline/intent-label.requested` event on every Stage-3 verdict-with-top-intent, and a new registered `stage3IntentLabelWorker` writes `AI: <intent_key>` onto the source Outlook message behind the (GATED) `stage_3_intent_label` flag — idempotent, never-clobbering, zero per-swarm branches. The [BLOCKING] production migration-apply is HALTED for the operator checkpoint.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-06-15T12:26:00Z
- **Completed:** 2026-06-15T12:34:00Z
- **Tasks:** 3 of 4 executed + committed; Task 4 ([BLOCKING] migration-apply) HALTED for operator
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- **Task 1 (D-2) — typed event + coordinator emit-hook.** Added `pipeline/intent-label.requested` to `events.ts` (mirrors the `pipeline/predicted` shape: `swarm_type` + `email_id` + `intent_key` + `source_mailbox` + `run_id`). In the shared coordinator, derived `topIntent = output.ranked[0]?.intent` and a single shared `emitIntentLabel()` helper called on BOTH the routing-GATED/held path (before the `predicted_held` return) and the OPEN path (after the byte-unchanged `emit-predicted`). Skipped on empty ranked. `inngest.send` inline (no alias), inside `step.run` (replay-safe). Additive to debtor's live emit — emit-predicted byte-unchanged.
- **Task 2 (D-3/D-4) — shared gated worker.** `stage3IntentLabelWorker` on `pipeline/intent-label.requested`: (1) `loadSwarm` + `isStageBlocked(swarm,"stage_3_intent_label")` → no-op `decision="gated"` when blocked (fail-closed); (2) resolve `source_id`+`mailbox` from `email_pipeline.emails` (fail-soft → `unresolved`); (3) never-clobber — skip if a `category_edited` transition OR review-signal correction exists for the `email_id` (`clobber-skip`); (4) idempotency — skip Graph if `readWrittenCategory === buildIntentCategory(intent_key)` (`unchanged`); (5) GET current categories + `mergeIntentCategory` (strip-stale AI:, keep user categories) + Graph PATCH the full merged array; (6) `recordWrittenCategory` baseline; (7) best-effort stage-4 audit row. ZERO `swarm_type ===` literals.
- **Task 3 — registration + D-5 doc.** Registered `stage3IntentLabelWorker` on `/api/inngest` (import + functions array). `docs/swarm-behavior-tracking.md` gained a "Phase 117 — written-category baseline (D-5)" subsection: the `swarm_written_categories` columns, the `source_id → email_id → baseline` LEFT JOIN that seeds 112.5's `prevCategories` to fire its dormant `category_edited` transition, the `AI:` prefix marker, and the explicit scope-grens that consuming it (the signal side) is OUT of Phase 117.

## Task Commits

1. **Task 1: swarm-agnostic intent-label emit** — `a6fd913b` (feat)
2. **Task 2: shared gated intent-label worker** — `4e4c949e` (feat)
3. **Task 3: register worker + 112.5 baseline doc** — `cbb4ec97` (feat)

_TDD note (Tasks 1 + 2 were `tdd="true"`): tests authored alongside implementation; RED/GREEN verified by running the suite (red-on-missing-emit / red-on-PATCH-count before the worker logic was complete), committed together as one atomic feat per task. Task 3 is a registration + doc task (no `tdd`)._

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] SWARM-02 grep false-positive in worker header comment**
- **Found during:** Task 2 acceptance-criteria grep
- **Issue:** the plan's grep `grep -c "swarm_type ===\|..."` matched a documentation comment (`ZERO \`if (swarm_type === ...)\` branches`) returning 1, not 0 — a false positive (the literal lived only in a comment, never in code).
- **Fix:** reworded the comment to "ZERO per-swarm equality branches" so the SWARM-02 grep gate returns a clean 0 (the invariant is unchanged; only the prose was adjusted).
- **Files modified:** web/lib/inngest/functions/stage-3-intent-label-worker.ts
- **Commit:** 4e4c949e

Otherwise: plan executed as written.

## Migration-Apply: PENDING OPERATOR CHECKPOINT (Task 4 [BLOCKING])

**The plan is CODE-COMPLETE but NOT fully complete** — Task 4 is a `checkpoint:human-verify gate="blocking-human"` that applies a PRODUCTION schema migration. Per the executor's blocking-human + production-write rules, the executor did **NOT** apply it. What remains for the operator/orchestrator:

1. **Apply** `supabase/migrations/20260615_phase117_intent_label_store_and_gate.sql` to remote (org Agent-Workforce, project `mvqjhlxfvtqqubqgdvhz`) via Supabase MCP `apply_migration`. Creates `public.swarm_written_categories` (RLS: service_role FOR ALL + authenticated SELECT, NO anon) and seeds `dry_run_config.stage_3_intent_label=true` (GATED) for BOTH debtor-email + sales-email via jsonb `||` merge.
2. **`npm run check:supabase`** — confirm 0 ERROR-level lints (RLS + policies present, no anon).
3. **Confirm seed:** `SELECT swarm_type, dry_run_config->>'stage_3_intent_label' FROM public.swarms WHERE swarm_type IN ('debtor-email','sales-email')` → both `'true'` (GATED); other per-stage flags (stage_1_archive, stage_3_routing, stage_3_labeling) unchanged (jsonb merge preserved).
4. **Codegen no drift:** `cd web && npm run codegen && git diff --exit-code` (the dry-run key is data, not a codegen enum — expect no diff).
5. **Live gated no-op:** trigger one live sales Stage-3 verdict; confirm `pipeline/intent-label.requested` fired AND the worker returned `decision="gated"` (NO Graph PATCH); `swarm_written_categories` stays empty.

**Sales caveat (D-3 ⚠):** keep BOTH swarms GATED at phase close — do NOT flip sales `stage_3_intent_label` live until the Sugar cut-over / Power Automate sweep dependency clears (same gate as 112.5 activation).

**Resume signal:** "migration applied" once table + seed are live, advisor 0 ERROR, codegen no drift, gated no-op confirmed.

## Verification

- `npx vitest run` over all 5 plan test files (intent-label-emit, intent-label-worker, debtor-email-coordinator, coordinator-stage3-routing-gate, coordinator-swarm-branch-guard) → **34 passed | 13 skipped (5 files)**.
- `npx tsc --noEmit` → exit 0.
- SWARM-02 grep: `grep -c "swarm_type ===\|=== 'sales-email'\|..." stage-3-intent-label-worker.ts` → **0** (zero per-swarm branches).
- Worker reads `isStageBlocked` + strips stale AI: via `mergeIntentCategory` + checks 112.5 `category_edited` before writing (grep confirmed).
- PATCH-count assertions: 0 in gated/unchanged/clobber-skip/unresolved cases, exactly 1 in the written case.
- Route registration: `grep -c "stage3IntentLabelWorker" route.ts` → 2 (import + array).
- Doc: `grep -c "swarm_written_categories" docs/swarm-behavior-tracking.md` → 3.

## Known Stubs

None. The worker writes live (behind the gate); no placeholder data paths. The migration is written + ready but PENDING the operator apply (above) — this is an intentional checkpoint, not a stub.

## Next Phase Readiness

- Code path is complete end-to-end (coordinator emit → worker → Graph PATCH + store + audit) but **INERT in production until the migration is applied AND an operator flips `stage_3_intent_label`→false**. Both swarms ship GATED.
- The `swarm_written_categories` read-contract is documented for 112.5 to consume (signal side is a separate phase — D-5).

## Self-Check: PASSED
- FOUND: web/lib/inngest/functions/stage-3-intent-label-worker.ts
- FOUND: web/lib/inngest/functions/__tests__/stage-3-intent-label-worker.test.ts
- FOUND: web/lib/inngest/functions/__tests__/coordinator-intent-label-emit.test.ts
- FOUND: supabase/migrations/20260615_phase117_intent_label_store_and_gate.sql (written, apply PENDING)
- FOUND commits: a6fd913b, 4e4c949e, cbb4ec97

---
*Phase: 117-outlook-intent-categories*
*Completed (code): 2026-06-15 — migration-apply PENDING operator checkpoint*

---
## Migration-apply checkpoint — RESOLVED 2026-06-15 (operator-approved)
- Applied `20260615_phase117_intent_label_store_and_gate.sql` to prod (`mvqjhlxfvtqqubqgdvhz`) via Supabase MCP `apply_migration` → success.
- `swarm_written_categories` table live (RLS: service_role FOR ALL + authenticated FOR SELECT, no anon).
- Both swarms `dry_run_config.stage_3_intent_label = true` (GATED), all prior flags preserved.
- `npm run check:supabase` → 0 ERROR. `npm run codegen` → no drift. Targeted suites → 363 passed / 14 skipped.
- Live behaviour unchanged: the intent-label write is a no-op while gated (both swarms). Sales stays gated pending Sugar cut-over (D-3). Task 4 COMPLETE; plan 117-02 fully complete.
