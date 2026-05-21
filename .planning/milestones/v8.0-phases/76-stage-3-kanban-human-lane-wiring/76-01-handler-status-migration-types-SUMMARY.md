---
phase: 76-stage-3-kanban-human-lane-wiring
plan: 01
subsystem: database
tags: [supabase, migration, swarm-intents, registry, typescript, vitest, kanban, stage-3, stage-4]

# Dependency graph
requires:
  - phase: 68
    provides: swarm_intents registry table + 'registry as source-of-truth' principle
  - phase: 75
    provides: swarm_categories → swarm_noise_categories rename (Stage 1) — confirms Stage 3 hard-separation invariant referenced by Phase 76 docs
provides:
  - swarm_intents.handler_status column (registered|placeholder) with CHECK constraint
  - 8 placeholder intents seeded for debtor-email (everything except invoice_copy_request)
  - SwarmIntentRow.handler_status TS field (literal-union narrowed)
  - Six RED test scaffolds satisfying the Wave 1+2 Nyquist gate
affects:
  - 76-02 (apply migration to remote)
  - 76-03 (no_handler dispatch reads handler_status)
  - 76-04 (low_confidence Kanban write)
  - 76-05 (Kanban Server Actions + loader)
  - 76-06 (classifier-invoice-copy-handler onFailure → handler_error)
  - phase-78 (CI codegen extension for swarm_intents — open Q1)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Registry-as-source-of-truth extended one column further (handler_status)"
    - "Nyquist gate: scaffold all downstream RED tests in Wave 0 so each subsequent wave gets RED→GREEN signal at landing"

key-files:
  created:
    - supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql
    - web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/close.test.ts
    - web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/replay.test.ts
    - web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/reclassify-noise.test.ts
    - web/app/(dashboard)/automations/[swarm]/kanban/_lib/__tests__/kanban-loader.test.ts
  modified:
    - web/lib/swarms/types.ts
    - web/lib/swarms/__tests__/registry.test.ts
    - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts
    - web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts

key-decisions:
  - "handler_status default = 'registered' so newly-registered intents auto-dispatch; opt-out is explicit via UPDATE in migration"
  - "CHECK constraint enforced at DB level — no application-layer trust needed for the closed enum"
  - "Server Action test files use it.todo (modules don't exist yet); coordinator + handler tests use real failing it() blocks (modules exist) — keeps vitest collection green while preserving RED→GREEN signal"

patterns-established:
  - "Nyquist scaffold split: it.todo for not-yet-existing modules, expect(false).toBe(true) for existing modules awaiting behavior — neither breaks suite collection"

requirements-completed: []

# Metrics
duration: ~30min
completed: 2026-05-07
---

# Phase 76 Plan 01: handler_status Migration + Types Summary

**`swarm_intents.handler_status` registry column added (8 of 9 debtor-email intents seeded as `placeholder`), `SwarmIntentRow` TS type narrowed, and six Wave 1+2 RED test scaffolds landed (Nyquist gate satisfied) — registry column is dormant until Plan 03 reads it.**

## Performance

- **Duration:** ~30 min (resumed from prior session — Tasks 1-2 already committed)
- **Tasks:** 3
- **Files modified:** 9 (1 migration, 2 type/registry, 6 test scaffolds)

## Accomplishments

- Migration shipped: `swarm_intents.handler_status text NOT NULL DEFAULT 'registered' CHECK (handler_status IN ('registered','placeholder'))` plus 8-row UPDATE seeding placeholders for `address_change`, `contract_inquiry`, `copy_document_request`, `credit_request`, `general_inquiry`, `peppol_request`, `payment_dispute`, `other`. `invoice_copy_request` keeps the `registered` default.
- `SwarmIntentRow.handler_status: 'registered' | 'placeholder'` field added in `web/lib/swarms/types.ts`; registry test extended with `handler_status` row-shape coverage.
- Coordinator RED scaffolds: `Phase 76: no_handler trigger` (2 cases) + `Phase 76: low_confidence trigger` (2 cases) — total 4 failing tests awaiting Plans 03/04.
- Invoice-copy-handler RED scaffold: `Phase 76: onFailure → handler_error Kanban row` — 1 failing test awaiting Plan 06.
- Server Action + loader scaffolds: 4 new test files under `web/app/(dashboard)/automations/[swarm]/kanban/{actions,_lib}/__tests__/` with 10 `it.todo` markers awaiting Plan 05.

## Task Commits

1. **Task 1: Migration — add handler_status column with placeholder seeds** — `dc75a8c` (feat)
2. **Task 2: Extend SwarmIntentRow type + scaffold registry test for handler_status** — `4680e0f` (feat, TDD-style — type+test in one)
3. **Task 3: Scaffold Wave 1+2 RED test files (Nyquist gate)** — `3b7de12` (test)

_Note: This worktree was resumed mid-plan; Tasks 1 and 2 were already committed before this session. Task 3 was completed and committed in this session with `--no-verify` (per orchestrator instruction)._

## Files Created/Modified

- `supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql` — adds column + CHECK + COMMENT + 8-row placeholder UPDATE; transactional (BEGIN/COMMIT).
- `web/lib/swarms/types.ts` — `SwarmIntentRow` gains `handler_status: 'registered' | 'placeholder'` adjacent to `handler_event`.
- `web/lib/swarms/__tests__/registry.test.ts` — `handler_status` describe block asserts `loadSwarmIntents` returns rows narrowed to the literal union and that fixture covers both values.
- `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` — appended `Phase 76: no_handler trigger` (2 RED cases) and `Phase 76: low_confidence trigger` (2 RED cases).
- `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts` — appended `Phase 76: onFailure → handler_error Kanban row` (1 RED case).
- `web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/close.test.ts` — 3 `it.todo` (UPDATE status, broadcast, uuid validation).
- `web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/replay.test.ts` — 3 `it.todo` (same-intent, edited-intent, registry validation).
- `web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/reclassify-noise.test.ts` — 2 `it.todo` (override.submitted axis='stage_1_category', noise_key validation).
- `web/app/(dashboard)/automations/[swarm]/kanban/_lib/__tests__/kanban-loader.test.ts` — 2 `it.todo` (SELECT shape, kanban_reason grouping).

## Decisions Made

- **Default `'registered'`, opt-out via UPDATE:** keeps onboarding friction zero — every new `swarm_intents` row defaults to dispatching as today; placeholder intents must be explicitly flagged. Matches RESEARCH.md §Pattern 1.
- **Hybrid scaffold strategy (it.todo vs failing it()):** Server Action modules don't exist yet, so tests use `it.todo` to keep vitest collection green; coordinator/handler modules exist, so tests use real `it()` with `expect(false).toBe(true)` to produce RED that subsequent waves flip to GREEN. Both are intentional — `it.todo` skips, fail-mode `it()` fails — and neither blocks the suite at collection time.

## Deviations from Plan

None — plan executed exactly as written. Task 3 followed the hybrid `it.todo` / failing-`it()` strategy specified in the plan's `<action>` section verbatim.

### Out-of-Scope Findings (deferred — not fixed)

- **Pre-existing TS errors** in `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts:440` and `web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts:265` (`Argument of type 'null' is not assignable to parameter of type 'string'`). Verified to pre-exist via `git stash` baseline check — both lines are outside the Phase 76 scaffolds appended in this plan. Per scope-boundary rule, NOT fixed here. Logging for visibility; downstream phases or a dedicated cleanup plan can address.

---

**Total deviations:** 0
**Impact on plan:** None — plan as-written matched the runtime exactly.

## Issues Encountered

- Worktree did not have `node_modules` installed for `web/` (parallel-executor isolation). Resolved by symlinking `web/node_modules` to the parent checkout's `node_modules` for verification only. Symlink is not committed and lives only inside the worktree's working tree.

## Verification

- `cd web && ./node_modules/.bin/vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts -t "Phase 76"` → 4 failed (RED, expected) / 8 skipped — matches acceptance criteria.
- `cd web && ./node_modules/.bin/vitest run lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts -t "Phase 76"` → 1 failed (RED, expected) / 6 skipped.
- `cd web && ./node_modules/.bin/vitest run 'app/(dashboard)/automations/[swarm]/kanban'` → 4 test files / 10 todos / 0 failures — matches acceptance criteria for Server Action collection-safety.
- `cd web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json` → 2 pre-existing errors only (verified via `git stash` baseline); zero new errors from Phase 76 changes.

## Self-Check: PASSED

Verified files and commits exist:

- `supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql` — present
- `web/lib/swarms/types.ts` — `handler_status` field present
- `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` — Phase 76 scaffolds present (3 occurrences of "Phase 76")
- `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts` — Phase 76 onFailure scaffold present
- All 4 new kanban test files present at declared paths
- Commits `dc75a8c`, `4680e0f`, `3b7de12` all present in `git log`

## Next Phase Readiness

- **Plan 02** can `supabase db push` the migration without further dependencies.
- **Plan 03** (no_handler dispatch) inherits a complete RED scaffold under `Phase 76: no_handler trigger`; tests turn GREEN when coordinator reads `handler_status` and writes Kanban row instead of dispatching.
- **Plan 04** (low_confidence) inherits `Phase 76: low_confidence trigger` RED scaffold.
- **Plan 05** (Kanban Server Actions + loader) inherits 4 `it.todo` files at exact paths the implementation modules will live at (`../close.ts`, `../replay.ts`, `../reclassify-noise.ts`, `../kanban-loader.ts`).
- **Plan 06** (classifier-invoice-copy-handler onFailure) inherits the `Phase 76: onFailure` RED scaffold.

No blockers.

---
*Phase: 76-stage-3-kanban-human-lane-wiring*
*Plan: 01*
*Completed: 2026-05-07*
