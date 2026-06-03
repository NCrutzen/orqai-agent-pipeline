---
phase: 111-stage-1-noise-expansion-calibration
plan: 03
subsystem: sales-email Stage-1 calibration
tags: [retro-harness, calibration, side-channel-isolation, inngest, supabase, tdd]
requires:
  - email_pipeline.emails (outlook + sugarcrm corpora)
  - swarm_noise_categories (sales-email enabled rows + action)
  - stage-1-category-classifier Orq agent (LLM Pass 2)
provides:
  - stage_1_retro_runs table (per-email Stage-1 retro verdict)
  - sales-email/stage-1-retro-classify.requested Inngest event + handler
  - two-corpus, direction-normalized candidate selector
  - per-category hit-rate + false-archive baseline aggregator (D-09 evidence)
affects:
  - Plan 04 (consumes stage_1_retro_runs + baseline for D-07 seeding / D-09 loopback)
  - Plan 05 (applies the migration — [BLOCKING])
tech-stack:
  added: []
  patterns:
    - Phase 87 retro-harness locks mirrored for Stage 1 (replay-safe run_id, step-memo discipline, idempotent upsert, side-channel isolation)
    - direction normalization across source vocabularies (Pitfall 4)
    - sugarcrm source-only corpus filter (Pitfall 5)
key-files:
  created:
    - supabase/migrations/20260603_stage_1_retro_runs.sql
    - web/lib/automations/sales-email/retro/select-candidates.ts
    - web/lib/automations/sales-email/retro/aggregate-baseline.ts
    - web/lib/inngest/functions/sales-email-stage-1-retro-classify.ts
    - web/lib/automations/sales-email/retro/__tests__/select-candidates.test.ts
    - web/lib/inngest/functions/__tests__/sales-email-stage-1-retro-classify.test.ts
  modified:
    - web/lib/inngest/events.ts
    - web/app/api/inngest/route.ts
decisions:
  - "false_archive_suspect = normalized-inbound mail whose predicted noise category has live action=categorize_archive (the D-09 loopback false-archive signal)"
  - "STAGE_1_RETRO_HARD_CAP=40000 (covers 853 outlook + 34,725 sugarcrm with headroom); fail-loud over cap"
  - "Two sequential per-corpus reads (not one .or()) so the outlook mailbox pin and the sugarcrm source-only filter stay cleanly separated"
  - "aggregateBaseline returns the per-category summary (no new baseline table); Plan 04 reads stage_1_retro_runs directly"
metrics:
  duration: ~25m
  completed: 2026-06-03
  tasks: 3
  files: 8
---

# Phase 111 Plan 03: Stage-1 Retro Harness Summary

Built the sales-email Stage-1 retro-run harness (D-01): an idempotent, side-channel-isolated Inngest function that re-classifies BOTH Smeba corpora (live `verkoop@smeba.nl` Outlook + historic `source='sugarcrm'`) through the Stage-1 noise path (LLM `stage-1-category-classifier` Pass 2 only — sales has no regex module) and writes per-email verdicts to a new `stage_1_retro_runs` table, producing per-category hit-rate + false-archive estimates that Plan 04 consumes for D-07 seeding and the D-09 loopback decision.

## Tasks

| Task | Name | Commit(s) | Files |
| ---- | ---- | --------- | ----- |
| 1 | stage_1_retro_runs migration (RLS + idempotency key) | 8d5b14b3 | supabase/migrations/20260603_stage_1_retro_runs.sql |
| 2 | two-corpus selector + per-category aggregator (TDD) | f8df7ea5 (RED), f2ce8d36 (GREEN) | select-candidates.ts, aggregate-baseline.ts, select-candidates.test.ts |
| 3 | Stage-1 retro harness Inngest fn (TDD) | 9538b4bb (RED), 6a69a242 (GREEN) | sales-email-stage-1-retro-classify.ts, events.ts, route.ts, harness test |

## What was built

- **`stage_1_retro_runs` table** — backend-only, `ENABLE ROW LEVEL SECURITY` + service-role-only policy (no anon/authenticated), `UNIQUE INDEX (run_id, email_id)` for replay-safe upsert. Columns cover the per-email verdict: `source`, `normalized_direction`, `predicted_category_key`, `confidence`, `is_noise`, `would_archive`, `false_archive_suspect`, `model_key`, `token_usage_total`. **Not applied** — Plan 05's [BLOCKING] migration job applies it.
- **`selectCandidates`** — reads `email_pipeline.emails` across two corpora via two sequential per-corpus reads: Outlook (`source='outlook'` + `mailbox='verkoop@smeba.nl'`) and SugarCRM (`source='sugarcrm'` ALONE — its mailbox is a bean label, Pitfall 5). `normalizeDirection` collapses `{inbound,incoming}→inbound`, `{sent,outbound}→outbound` (Pitfall 4). Fail-loud throw over `STAGE_1_RETRO_HARD_CAP`. Pure (no clock/random).
- **`aggregateBaseline`** — JS-side GROUP BY of `stage_1_retro_runs` by `predicted_category_key` → per-category `hit_rate` (count/total) + `false_archive_rate` (false_archive_suspect / would_archive). Deterministically sorted. Pure.
- **`salesEmailStage1RetroClassify`** — Inngest fn (`retries:3`, `concurrency:{limit:1}`, event `sales-email/stage-1-retro-classify.requested`). `run_id` inside `step.run("resolve-run-id")`; per-email `step.run` invokes the LLM with the closed-list `<categories>` built from enabled `swarm_noise_categories`, validates with a local zod `Stage1OutputSchema`, derives the three verdict flags, upserts `onConflict "run_id,email_id" ignoreDuplicates`, and returns only the token count. End-of-run `aggregateBaseline`. Emits no downstream events; `inngest.send` never used.

## Threat mitigations applied

- **T-111-08 (side-channel tampering):** source-grep guard test asserts the harness writes only `stage_1_retro_runs` — no `automation_runs`/`agent_runs`/`pipeline_events`. Verified (grep → 0).
- **T-111-09 (replay):** `run_id` minted inside `step.run`; idempotent upsert on `(run_id,email_id)`. Idempotent-rerun test green.
- **T-111-10 (direction mis-normalization / corpus drop):** `normalizeDirection` tested across all 4 source vocabulary values; sugarcrm source-only filter tested.
- **T-111-11 (DoS):** `STAGE_1_RETRO_HARD_CAP` fail-loud throw tested.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Event + function registration**
- **Found during:** Task 3.
- **Issue:** The plan's `files_modified` listed only the harness fn + tests, but an Inngest fn referencing a new event triggers a TS error (`Events` record lacks the key) and the fn would never be served without route registration.
- **Fix:** Added `sales-email/stage-1-retro-classify.requested` to `web/lib/inngest/events.ts` and registered `salesEmailStage1RetroClassify` in `web/app/api/inngest/route.ts`. Mirrors the Phase 87 debtor retro registration exactly.
- **Files modified:** web/lib/inngest/events.ts, web/app/api/inngest/route.ts
- **Commit:** 6a69a242

**2. [Rule 3 - Blocking] Worktree had no node_modules / lacked phase-111 base**
- **Found during:** execution start.
- **Issue:** The worktree was branched from an older commit (ancestor of `workspace/sales-agent-swarm`) that lacked both the phase-111 plan files and the phase-110 sales-email infra the analogs depend on; `node_modules` is gitignored and does not propagate to worktrees.
- **Fix:** Fast-forwarded the per-agent branch to `workspace/sales-agent-swarm` (the sanctioned startup reset; strict ancestor → pure fast-forward, no conflicts) to obtain the plan + base source. Symlinked `web/node_modules` from the canonical repo for test/tsc resolution (gitignored — not committed).
- **Files modified:** none committed (branch position + ignored symlink only).

## Verification

- `vitest run lib/automations/sales-email/retro lib/inngest/functions/__tests__/sales-email-stage-1-retro-classify.test.ts` → 11/11 green.
- `tsc --noEmit` → 0 errors (clean).
- Migration present, RLS-enabled, service-role-only, UNIQUE (run_id, email_id).
- Acceptance greps: `resolve-run-id` present; `onConflict "run_id,email_id"`; forbidden-write grep → 0; `inngest.send` grep → 0; purity grep (Date.now/Math.random) → 0.

## Known Stubs

None — the harness is a complete data pipeline (no UI props, no placeholder data sources). The migration is intentionally not applied here; Plan 05 ([BLOCKING]) owns the live apply via MCP.
