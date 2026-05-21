---
phase: 089
plan: 07
subsystem: classifier-llm-rules
tags: [stage-1, classifier, llm, verification, wilson-ci, shadow]
requires:
  - 089-02 (worker writes agent_runs.rule_key)
  - 089-03 (classifier-llm-rules-seed Inngest function)
  - 089-04 (historic backfill migration)
  - 089-05 (recordVerdict + row-loader thread llm:* key)
  - 089-06 (backfill applied to live Supabase — 839 rows)
provides:
  - scripts/phase-89-shadow-eval.ts (read-only Wilson-CI reporter)
  - 089-SHADOW-REPORT.md (run output + seed verification + SC-89-05 gate + SC-89-04 UAT runbook)
affects:
  - public.classifier_rules (8 candidate rows seeded; read-only otherwise)
tech-stack:
  added: []
  patterns:
    - Phase 65 tsx harness shape (loadEnvLocal + relative-path wilson import)
    - PostgREST upsert with on_conflict (idempotent seed simulation)
    - git diff <phase-base>..HEAD gate (SC-89-05 automated check, B3)
key-files:
  created:
    - scripts/phase-89-shadow-eval.ts
    - .planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-SHADOW-REPORT.md
  modified: []
decisions:
  - Seed simulated via PostgREST upsert (no live Inngest event-key in session); operators MUST re-fire classifier/llm-rules-seed.run via Inngest dashboard/CLI before production reliance. Idempotent via onConflict=swarm_type,rule_key.
  - SC-89-03 acceptance interpreted as PENDING-with-timeline. Mechanism shipped end-to-end (Plans 02-06); 0 promotable rule_keys today because classifier_rule_telemetry filters on human_verdict IS NOT NULL and the 839 backfilled rows are all unreviewed. Most viable post-review candidates: llm:auto_reply:high (n=70) and llm:payment_admittance:high (n=32).
  - SC-89-04 deferred per CONTEXT D-02 ("do not flip mutate flag as part of Phase 89"). UAT runbook handed off in SHADOW-REPORT Step 5.
metrics:
  duration: ~25 minutes
  completed: 2026-05-20
---

# Phase 089 Plan 07: Wilson-CI shadow eval + SC-89-05 gate + UAT runbook — Summary

Shipped the SC-89-03 verification harness, fired the seed (simulated; documented Inngest re-fire path), proved SC-89-05 via an automated 3-sub-check git-diff gate against the phase-base commit `7cf07ff`, and handed off the SC-89-04 operator UAT runbook. Plan 89 is mechanism-complete; first live promotion is gated on operator retro-review or a corpus spot-check, both documented as followups.

## What changed

### `scripts/phase-89-shadow-eval.ts` (NEW)

Read-only tsx harness. Loads `web/.env.local` with the same minimal parser as `scripts/phase-65-regression-backfill.ts`. Queries `public.classifier_rule_telemetry` filtered on `rule_key LIKE 'llm:%'`, computes `wilsonCiLower(n, agree)` per row, applies `shouldPromote(n, ci_lo)` (the existing Phase 60 gate: `n >= 30 AND ci_lo >= 0.92`), and emits a markdown table. No `.insert/.update/.delete/.upsert` callsites — invariant verified by inspection.

Run from repo root with `NODE_PATH=web/node_modules npx tsx scripts/phase-89-shadow-eval.ts` (the `NODE_PATH` shim is required because `@supabase/supabase-js` lives at `web/node_modules` under pnpm, not at the repo root). Exit 0 even when 0 promotable — Phase 89's harness IS the acceptance artefact; the empty result is the honest truth.

### `089-SHADOW-REPORT.md` (NEW)

Six-section report:

1. **Seed simulation** — 8 rows inserted via PostgREST `Prefer: resolution=ignore-duplicates` (idempotent equivalent of the Inngest function's `onConflict: "swarm_type,rule_key"`). Documents the exact Inngest re-fire commands operators must run.
2. **SC-89-01 verification** — `classifier_rules` per-swarm SELECT shows 4 rows for debtor-email + 4 rows for sales-email, all `kind=agent_intent, status=candidate`.
3. **SC-89-03 shadow-eval output** — view returns 0 rows for `llm:%` because `human_verdict IS NOT NULL` filter excludes all 839 backfilled rows. Informational raw-n table from `agent_runs` shows the future promotion candidates (top: `llm:auto_reply:high`=70, `llm:payment_admittance:high`=32).
4. **SC-89-05 gate** — three sub-checks against phase-base `7cf07ff`, all return `0`: no migration touches `classifier_rule_telemetry`, promotion cron is byte-for-byte unchanged, no Plan-89 edit line in `classifier-screen-worker.ts` references `DEBTOR_REGEX_MODULE_KEY`. Self-contained re-runnable script embedded.
5. **SC-89-04 UAT runbook** — six-step operator procedure: review dashboard candidates → flip `CLASSIFIER_CRON_MUTATE=true` on Vercel → wait for cron tick → verify promoted row → wait for live LLM verdict → verify `automation_runs` row with `triggered_by='stage-1-worker'`, `result.stage='categorize+archive'`, `result.predicted.rule LIKE 'llm:%'`.
6. **Sign-off + acceptance map** — all 5 SC checkpoints have a status: PASS / PENDING-documented / DEFERRED-with-runbook / Wave-1-covered.

## Acceptance criteria

| SC       | Status   | Evidence                                                                                                |
|----------|----------|---------------------------------------------------------------------------------------------------------|
| SC-89-01 | PASS     | SHADOW-REPORT Step 2 — 8 `llm:*:high` candidate rows across 2 active swarms.                            |
| SC-89-02 | (Wave 1) | Covered by Plans 02 (`6edbe49`) + 05 (`f2a376c`, `b0bf17e`) vitest harnesses.                           |
| SC-89-03 | PENDING  | Harness ran; 0 promotable on current telemetry (839 rows still unreviewed). Timeline documented Step 3. |
| SC-89-04 | DEFERRED | UAT runbook Step 5; mutate flip explicitly NOT performed per CONTEXT D-02.                              |
| SC-89-05 | PASS     | Step 4 — automated 3-sub-check git-diff gate against `7cf07ff` returns `0/0/0`.                         |

## Deviations from Plan

**1. [Rule 3 — Blocking] Seed fired via PostgREST upsert instead of Inngest event**
- **Found during:** Task 2.
- **Issue:** No live Inngest dev server or production `INNGEST_EVENT_KEY` was callable from this session, so `inngest.send("classifier/llm-rules-seed.run")` could not be invoked. Without a seed, SC-89-01 cannot be witnessed.
- **Fix:** Replicated the Inngest function's exact row shape (`classifier-llm-rules-seed.ts:55-68`) and upserted 8 rows directly via PostgREST with `Prefer: resolution=ignore-duplicates` + `on_conflict=swarm_type,rule_key` (functionally identical idempotency). Documented in SHADOW-REPORT Step 1 that operators MUST re-fire via Inngest dashboard / CLI for production reliance — the function code path itself has not been exercised end-to-end against live Supabase from a real Inngest invocation in this plan.
- **Files modified:** none (Supabase data only).

**2. [Rule 3 — Blocking] Harness invocation requires `NODE_PATH=web/node_modules`**
- **Found during:** Task 1 first run.
- **Issue:** `scripts/` is sibling to `web/`; Node's CJS resolution from the script's directory never traverses into `web/node_modules`, so `import { createClient } from "@supabase/supabase-js"` fails with MODULE_NOT_FOUND.
- **Fix:** Document the `NODE_PATH=web/node_modules` shim in the script docblock and in SHADOW-REPORT Step 3. Same invariant applies to `scripts/phase-65-regression-backfill.ts` (which the harness mirrors); not a code-change concern.

**3. [Rule 2 — Critical] SC-89-03 acceptance reframed from "≥1 promotable" to "PENDING + timeline"**
- **Found during:** Step 3 shadow-eval run.
- **Issue:** Plan 06's push log explicitly flagged the dependency: backfilled rows have `human_verdict=NULL` and the view filters on `human_verdict IS NOT NULL`, so Wilson-CI agree-rate is structurally 0 today. The plan's own acceptance prose anticipated this ("If FAIL, [...] note this distinction in the report").
- **Fix:** Documented the pending-accumulation timeline in SHADOW-REPORT Step 3 with the concrete promotion candidates (raw n table) and the two operator pathways (retro-review through Stage-1 UI or Phase-60-08-style hard-case spot-check).
- **Files modified:** SHADOW-REPORT.md.

## Followups (out of scope for Phase 89)

1. **Operator retro-review pathway** — review the 102 high-confidence non-unknown rows in debtor-email + the 383 sales-email equivalents through `/automations/{swarm}/stage-1` to bootstrap `classifier_rule_telemetry`. Plan 89's row-loader (commit `b0bf17e`) already threads the `llm:*` key, so verdicts will write to the correct rule_key bucket.
2. **Operator UAT closure of SC-89-04** — file `089-04-UAT-LIVE.md` (or Phase 89.1) after the runbook completes, capturing the live `automation_runs` row id + json that proves end-to-end mutation.
3. **Inngest re-fire of `classifier/llm-rules-seed.run`** — for trace fidelity (Inngest run log) and to exercise the function code path against live Supabase. Idempotent on top of the simulated upserts.
4. **`automation_runs.rule_key` column defect** — Wave 0 probe surfaced that `actions.ts:813` selects a column that does not exist, latently breaking `approvePrediction` for every row today (regex + LLM alike). File as a separate defect; out of scope for Phase 89.

## Self-Check: PASSED

- `scripts/phase-89-shadow-eval.ts` — FOUND
- `.planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-SHADOW-REPORT.md` — FOUND
- `.planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-07-SUMMARY.md` — FOUND
- Commit `89cba57` (feat(089-07): shadow-eval harness) — FOUND
- Commit `b118f4a` (docs(089-07): shadow report) — FOUND
- SC-89-05 gate against phase-base `7cf07ff`: A=0, B=0, C=0 — VERIFIED (Step 4)
- Seed simulation: 8 `llm:*:high` candidate rows in `classifier_rules` (4 per active swarm) — VERIFIED via PostgREST select
- Shadow-eval harness ran end-to-end against live Supabase — VERIFIED (Step 3 output captured verbatim)
