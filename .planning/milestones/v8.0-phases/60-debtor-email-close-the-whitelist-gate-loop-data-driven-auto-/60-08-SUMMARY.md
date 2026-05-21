---
phase: 60
plan: 08
subsystem: debtor-email-classifier
tags: [classifier, inngest, backfill, spot-check, corpus]
requires: [60-02, 60-03, 60-07]
provides:
  - classifier/corpus-backfill.run event + function (corpus-derived n/agree seeding)
  - classifier/spotcheck.queue event + function (hard-case review queue population)
  - lib/classifier/corpus-mapping (pure agreement-table module)
  - 60-08-RUNBOOK.md (operator hand-over)
affects:
  - public.classifier_rules (additive upserts under status='candidate')
  - public.agent_runs (additive inserts under intent_version='corpus-backfill-spotcheck')
tech-stack:
  added: []
  patterns:
    - Inngest event-only function pattern (no cron)
    - Two-query cross-schema corpus load (Supabase JS lacks cross-schema joins)
    - Pure agreement-mapping bridge between regex classify() and LLM-judge labels
    - Deterministic FNV-1a hash shuffle for auditable sampling
    - status='candidate' write-only — promotion stays under cron control (D-07)
key-files:
  created:
    - web/lib/classifier/corpus-mapping.ts
    - web/lib/inngest/functions/classifier-corpus-backfill.ts
    - web/lib/inngest/functions/classifier-spotcheck-sampler.ts
    - web/tests/classifier/corpus-mapping.test.ts
    - web/tests/classifier/corpus-backfill.test.ts
    - .planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-08-RUNBOOK.md
  modified:
    - web/lib/inngest/events.ts
    - web/app/api/inngest/route.ts
decisions:
  - Backfill writes status='candidate' only — promotion remains the cron's job under CLASSIFIER_CRON_MUTATE=true (60-07)
  - Spot-check sampler uses 'smeba' as fallback entity (D-28: agent_runs schema unchanged)
  - Spot-check intent_version='corpus-backfill-spotcheck' is the idempotency key
  - Predicted Category → agent_runs.intent enum mapping: payment_admittance→payment_dispute, auto_reply/ooo_*→general_inquiry, unknown→other
metrics:
  duration: 25min
  completed: 2026-04-29
---

# Phase 60 Plan 08: Corpus-Driven Classifier Promotion Summary

**One-liner:** Inngest-driven corpus backfill + hard-case spot-check sampler that seeds `classifier_rules` n/agree from the 6,114-email LLM corpus and queues 50 review-emails per promotable rule, enabling Wilson-CI auto-promotion without two weeks of organic verdicts.

## What Shipped

Three coupled changes plus an operator runbook:

1. **`web/lib/classifier/corpus-mapping.ts`** — pure module with `isAgreement(predicted, llmCategory, llmIntent) → boolean` and `AGREEMENT_MAP` truth table. Encodes the predicted-category × LLM-judge agreement rules approved 2026-04-29. 14 unit tests pin all 5 Category × LLM-field cells plus null-handling and purity.
2. **`web/lib/inngest/functions/classifier-corpus-backfill.ts`** — event-only Inngest function (`classifier/corpus-backfill.run`). Three steps: load-corpus (cross-schema two-query, 1k-chunk pagination), classify-and-aggregate (re-runs `classify()` per row, tallies n/agree per `matchedRule` via `isAgreement`), upsert-rules (writes `status='candidate'` to `classifier_rules` with computed Wilson CI-lo). Skips `no_match` and `unknown`-category catch-alls. 6 unit tests cover tally correctness, no_match exclusion, missing-field counter, idempotency.
3. **`web/lib/inngest/functions/classifier-spotcheck-sampler.ts`** — event-only Inngest function (`classifier/spotcheck.queue`). Loads candidate rules with n≥30, re-runs classify(), buckets per-rule into hard cases (rule fired AND isAgreement=false) vs agreements, samples up to 50 hard cases per rule (FNV-1a deterministic shuffle for audit), falls back to agreements when fewer than 50 hard cases exist. Inserts into `agent_runs` under `intent_version='corpus-backfill-spotcheck'` with `human_verdict=NULL` so rows surface in `/automations/debtor-email-review`. Idempotent on `(email_id, intent_version)`.
4. **`60-08-RUNBOOK.md`** — 10-step copy-paste operator runbook with embedded SQL, pass criterion (≥95 %), and rollback procedure.

## TDD Gate Compliance

Tasks 1 and 2 followed RED/GREEN/REFACTOR with separate commits:

| Phase | Task 1 commit | Task 2 commit |
| ----- | ------------- | ------------- |
| RED | 6b852a4 | 6f1c97f |
| GREEN | 34ba4b8 | aeec2e3 |
| REFACTOR | (not needed) | (not needed) |

## Verification Gates

| Gate | Result |
| ---- | ------ |
| `pnpm vitest run tests/classifier` | 31/31 pass (4 files: corpus-mapping=14, corpus-backfill=6, backfill=4, rules-table=7) |
| `pnpm tsc --noEmit -p .` (60-08 files) | 0 errors in corpus-mapping/corpus-backfill/spotcheck-sampler |
| `pnpm tsc --noEmit -p .` (overall) | 4 baseline errors (review-page imports — pre-existing, out of scope per executor scope-boundary rule) |
| `git diff --stat web/lib/debtor-email/classify.ts` | empty — D-22 enforced |
| `grep "classifier/corpus-backfill.run" web/lib/inngest/events.ts` | 1 match |
| `grep "classifier/spotcheck.queue" web/lib/inngest/events.ts` | 1 match |
| `grep "status: \"candidate\"" web/lib/inngest/functions/classifier-corpus-backfill.ts` | 1 match (no `'promoted'` write — D-07) |
| `grep "onConflict: \"swarm_type,rule_key\"" classifier-corpus-backfill.ts` | 1 match (idempotency) |
| `grep "intent_version: SPOTCHECK_INTENT_VERSION" classifier-spotcheck-sampler.ts` | matches plan acceptance |
| Both functions registered in `web/app/api/inngest/route.ts` | confirmed (`classifierCorpusBackfill`, `classifierSpotcheckSampler`) |

## Deviations from Plan

**1. [Rule 1 — Bug] Vitest 4 dropped the `--reporter=basic` alias.**
- **Found during:** Task 1 RED run.
- **Issue:** `pnpm vitest run … --reporter=basic` fails to resolve the reporter module under vitest 4.1.5 ("Failed to load url basic").
- **Fix:** Used `--reporter=default` for executor verification. The PLAN's `<verify>` blocks still mention `--reporter=basic`; the operator running them in CI should switch to `default` (or omit the flag — same effect).
- **Files modified:** none (plan-level note only).

**2. [Rule 3 — Blocking] Order-of-operations on route.ts edit.**
- **Found during:** Task 2 GREEN.
- **Issue:** Initially imported `classifierSpotcheckSampler` into route.ts during Task 2 to satisfy the plan's "reserve a slot" instruction, but that file did not yet exist (Task 3) → tsc error.
- **Fix:** Reverted the spotcheck import + registration during Task 2; added them in Task 3 once the file existed. Net result identical — only the diff sequence differs from the plan's literal wording.
- **Files modified:** `web/app/api/inngest/route.ts` (in Task 3 instead of Task 2).

**3. [Rule 2 — Architecture clarification] Spot-check sampler entity field.**
- **Found during:** Task 3 design.
- **Issue:** `agent_runs.entity` is NOT NULL with a CHECK constraint. Plan said "derive from email's mailbox via labeling_settings if available, fallback to 'smeba'". No labeling_settings lookup exists in the codebase, and `email_pipeline.emails` has no entity column reachable in this query path.
- **Fix:** Hardcoded the `'smeba'` fallback per plan permission. Spot-check rows are review-only — entity does not influence the verdict semantics; auto-archive flow uses entity from the live ingest, not from these telemetry rows.
- **Files modified:** documented inline in `classifier-spotcheck-sampler.ts`.

## Self-Check: PASSED

Files exist:
- `web/lib/classifier/corpus-mapping.ts` ✓
- `web/lib/inngest/functions/classifier-corpus-backfill.ts` ✓
- `web/lib/inngest/functions/classifier-spotcheck-sampler.ts` ✓
- `web/tests/classifier/corpus-mapping.test.ts` ✓
- `web/tests/classifier/corpus-backfill.test.ts` ✓
- `.planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-08-RUNBOOK.md` ✓

Commits exist on main:
- 6b852a4 test(60-08): RED — corpus-mapping ✓
- 34ba4b8 feat(60-08): GREEN — corpus-mapping ✓
- 6f1c97f test(60-08): RED — corpus-backfill ✓
- aeec2e3 feat(60-08): GREEN — corpus-backfill ✓
- 8f7f126 feat(60-08): spotcheck sampler ✓
- dfc990c docs(60-08): runbook ✓
