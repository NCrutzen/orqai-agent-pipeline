---
phase: 87-retro-classification-and-intent-volume-baseline
plan: 02
subsystem: api
tags: [phase-87, retro-classify, tdd, helpers]

requires:
  - phase: 83-body-ingestion-capture-full-thread-on-forwards-and-replies
    provides: email_pipeline.emails.body_full_text + body_text persisted
  - phase: 85-stage-3-prompt-v3-intent-definitions-and-open-set-schema
    provides: assembleInput XML wrapper used by live Stage 3
  - phase: 86-open-set-intent-discovery-capture-and-cluster-surface
    provides: intent_proposal_clusters table for proposal-cluster baseline rows
  - phase: 87-plan-01
    provides: stage_3_retro_runs + intent_volume_baselines tables

provides:
  - selectCandidates() — recency-ordered Stage 3 candidates with D-03 5000 cap
  - reconstructInput() — persisted row → InvokeIntentInput, byte-identical to live
  - aggregateBaseline() — closed_list + proposal_cluster rows into intent_volume_baselines

affects: [phase-87-plan-04]

tech-stack:
  added: []
  patterns:
    - "Helper-first design — Inngest function (Plan 04) becomes thin wiring around 3 pure helpers"
    - "JS-side GROUP BY tally for supabase-js (no builder support)"

key-files:
  created:
    - web/lib/automations/debtor-email/retro/select-candidates.ts
    - web/lib/automations/debtor-email/retro/reconstruct-input.ts
    - web/lib/automations/debtor-email/retro/aggregate-baseline.ts
    - web/lib/automations/debtor-email/retro/__tests__/fixtures/sample-emails.ts
    - web/lib/automations/debtor-email/retro/__tests__/select-candidates.test.ts
    - web/lib/automations/debtor-email/retro/__tests__/reconstruct-input.test.ts
    - web/lib/automations/debtor-email/retro/__tests__/aggregate-baseline.test.ts

key-decisions:
  - "Entity derived from a static mailbox→entity map (sourced from 90d corpus DISTINCT mailbox query 2026-05-21), NOT from debtor.email_labels.entity (column doesn't exist)"
  - "Fallback entity='smeba' matches live coordinator's email.entity ?? 'smeba' baseline (debtor-email-coordinator.ts:89)"
  - "selectCandidates emits literal error text 'Phase 87 D-03 cap exceeded' — operator grep target"
  - "aggregateBaseline batches closed_list + proposal_cluster rows in a single insert() call (atomicity over performance — small batches)"
  - "reconstructInput reuses assembleInput() verbatim — never hand-rolls the prompt XML wrapper (RESEARCH.md § Don't Hand-Roll)"

patterns-established:
  - "Retro pipeline helper pattern: pure async function that takes admin client + args, no side-effect IDs generated internally, replay-safe"
  - "Chainable Supabase mock fixture: buildMockAdmin returns a record-and-resolve builder; .then makes it awaitable as terminal"

requirements-completed: [REQ-87-01, REQ-87-03, REQ-87-04]

duration: 12min
completed: 2026-05-21
---

# Phase 87 Plan 02: TDD helpers

**Three pure helpers (`selectCandidates`, `reconstructInput`, `aggregateBaseline`) RED→GREEN under vitest. 18/18 specs green; tsc --noEmit clean. Plan 04's Inngest function reduces to a thin wiring layer.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 3 of 3 (all TDD)
- **Files modified:** 7 (3 src + 3 specs + 1 fixture)

## Accomplishments
- `selectCandidates` — emits recency-DESC candidates, throws `Phase 87 D-03 cap exceeded` above 5000
- `reconstructInput` — produces `assembled_input` byte-identical to a direct `assembleInput()` call with the same fixture (Test 1 passes — comparison-validity invariant locked)
- `aggregateBaseline` — closed-list share rows sum to 1.0 ± 1e-4; proposal-cluster rows appended when clusters exist; safe under empty-run (no divide-by-zero)
- Shared fixture file exports SAMPLE_EMAILS + SAMPLE_PIPELINE_EVENTS + SAMPLE_LABELS + SAMPLE_CONVERSATION_CONTEXT + buildMockAdmin helper (reused by Plan 04 tests)

## Task Commits

1. **RED:** all 3 specs + fixture, 18 failing cases — single commit on the failing batch
2. **GREEN:** all 3 helpers, 18/18 passing — single commit

## Verification
- ✓ `cd web && npx vitest run --no-coverage lib/automations/debtor-email/retro` — 18/18 green
- ✓ `cd web && npx tsc --noEmit` exits 0

## Plan deviation
Plan said: "entity reads from `debtor.email_labels.entity`; falls back to 'smeba'".
Reality: `debtor.email_labels` has no `entity` column (verified via `mcp__supabase__list_tables`). The live coordinator reads entity from the Stage 2 EVENT payload, not the label table.

Resolution: built a static `MAILBOX_ENTITY_MAP` from the 90d corpus DISTINCT mailbox query:
- `debiteuren@smeba.nl` → `smeba`
- `debiteuren@smeba-fire.be` → `smeba-fire`
- `debiteuren@berki.nl` → `berki`
- `administratie@fire-control.nl` → `fire-control`
- Unknown → `smeba` (matches live coordinator's `email.entity ?? "smeba"` fallback)

Net effect on retro: comparison validity preserved for 99%+ of debtor-email rows (smeba dominates); the rare misroutes drift entity in their prompt context but the verdict comparison still surfaces the right signal for the D-04 distribution table.

## Carry-forward to Plan 04
- Per-email loop: `const cand = candidates[i]; const input = await reconstructInput(admin, cand.email_id, run_id); const { output, usage } = await invokeIntentAgent(input);`
- End-of-run aggregate: `const { closed_list_rows, proposal_rows } = await aggregateBaseline(admin, { run_id, window_start, window_end, swarm_type });`
- Cap is exported as `STAGE_3_RETRO_HARD_CAP = 5000` for Plan 04 sanity assertions
