---
phase: 089-stage-1-llm-2nd-pass-auto-action-promotion-track
verified: 2026-05-21
status: passed_with_pending_operator_uat
score: 4/5
overrides_applied: 0
human_verification:
  - test: "SC-89-04 UAT — flip CLASSIFIER_CRON_MUTATE=true, wait for cron tick, observe first llm:*:high → status='promoted', verify next matching LLM verdict produces automation_runs row with result.stage='categorize+archive'"
    expected: "automation_runs row exists with triggered_by='stage-1-worker', result.stage='categorize+archive', result.predicted.rule LIKE 'llm:%'"
    why_human: "Per CONTEXT D-02, Phase 89 explicitly does NOT flip the mutate flag — operator UAT step delivered as runbook (089-SHADOW-REPORT.md Step 5)"
    actual: "PENDING-OPERATOR — runbook handed off; cron flip + live verification is post-phase operator work"
  - test: "SC-89-03 promotion of at least one llm:*:high rule_key"
    expected: "classifier_rule_telemetry shows ≥1 llm:* row with status='promoted' after operator retro-review accumulates ≥30 human_verdict-not-null rows"
    why_human: "Wilson-CI gate requires n≥30 and ci_lo≥0.92; 839 backfilled rows currently have human_verdict=NULL (operator must work bulk-review queue or do corpus spot-check)"
    actual: "PENDING-OPERATOR — most viable post-review candidates: llm:auto_reply:high (n=70), llm:payment_admittance:high (n=32) per shadow-eval output"
---

# Phase 089: Stage 1 LLM 2nd-pass auto-action promotion track — Verification report

**Phase Goal:** Thread Stage 1 LLM 2nd-pass synthetic `llm:{category}:{confidence}` rule_keys through the Phase 60 Wilson-CI promotion pipeline so the LLM's medium/high-confidence verdicts can graduate from operator-review to auto-action via the existing cron-mutate gate.
**Verified:** 2026-05-21
**Status:** passed_with_pending_operator_uat (mechanism complete code-side; first live promotion gated on operator retro-review + cron-mutate flip — both explicitly out-of-scope by CONTEXT D-02)
**Re-verification:** No — initial verification

---

## Must-haves — coverage

| # | Must-have (SC-89-*) | Status | Evidence |
|---|---------------------|--------|----------|
| SC-89-01 | Seed run produces `llm:*:high` candidate rows for every active swarm | SATISFIED | 089-SHADOW-REPORT Step 2 — 8 rows seeded across debtor-email + sales-email |
| SC-89-02 | Worker emits `effectiveMatchedRule` as `llm:{cat}:{conf}` when LLM 2nd-pass fires | SATISFIED | Plans 02 + 05 vitest harnesses (commits `6edbe49`, `f2a376c`, `b0bf17e`); 089-02-SUMMARY |
| SC-89-03 | Wilson-CI shadow eval harness ships + ran | SATISFIED (mechanism) / PENDING (live promotion) | Plan 07 — `scripts/phase-89-shadow-eval.ts` ships read-only; ran 2026-05-20; 0 promotable today because all 839 backfilled rows have `human_verdict=NULL` (telemetry view filter) — by design |
| SC-89-04 | Live UAT — first `llm:*:high` rule promotes + first live LLM verdict produces categorize+archive automation_run | DEFERRED-PER-CONTEXT | CONTEXT D-02 explicitly excludes flipping `CLASSIFIER_CRON_MUTATE` from Phase 89; runbook handed off in 089-SHADOW-REPORT Step 5 |
| SC-89-05 | Git-diff gate: no changes to `classifier-promotion-cron.ts`, `classifier_rule_telemetry.sql`, or `DEBTOR_REGEX_MODULE_KEY` dispatch token | SATISFIED | Automated 3-sub-check against phase-base commit `7cf07ff`; all three return `0` (Plan 07 Step 4) |

**Score:** 4/5 SATISFIED. SC-89-04 deferred per CONTEXT decision D-02 — not a defect.

## Artifacts on disk

- `web/lib/inngest/functions/classifier-llm-rules-seed.ts` (seeds `llm:*:high` candidate rows; idempotent via `onConflict=swarm_type,rule_key`)
- `web/lib/inngest/functions/classifier-screen-worker.ts` (Plan 02 — emits `effectiveMatchedRule = llm:{cat}:{conf}` when LLM 2nd-pass fires)
- `web/lib/automations/debtor-email/recordVerdict.ts` (Plan 05 — threads `llm:*` rule_key through verdict capture)
- `scripts/phase-89-shadow-eval.ts` (read-only Wilson-CI reporter)
- `supabase/migrations/20260520_*phase89*.sql` (Plan 04 — historic backfill schema)
- `.planning/phases/089-.../089-SHADOW-REPORT.md` (Plan 07 acceptance artefact)
- `.planning/phases/089-.../089-WAVE0-PROBE.md`
- `.planning/phases/089-.../089-PUSH-LOG.md` (Plan 06 — 839 rows backfilled to live Supabase)
- `.planning/phases/089-.../089-VALIDATION.md` + `089-RESEARCH.md` + `089-PATTERNS.md`
- 7 plans (089-01..089-07) + 7 summaries

## Anti-patterns / open items

1. **Seed simulation, not Inngest invocation.** Plan 07 fired the seed via direct PostgREST upsert because no live Inngest dev server / production event-key was in scope. Operators MUST re-fire `classifier/llm-rules-seed.run` via Inngest dashboard/CLI before production reliance. Function is idempotent (onConflict=swarm_type,rule_key) so re-firing is a no-op for the 8 existing rows. Flagged in `089-SHADOW-REPORT` Step 1.
2. **Zero promotable rule_keys today.** `classifier_rule_telemetry` view filters on `human_verdict IS NOT NULL`; all 839 backfilled rows are currently `human_verdict=NULL`. Mechanism is correct — telemetry awaits operator retro-review or corpus spot-check. Documented as PENDING-with-timeline in 089-SHADOW-REPORT.
3. **`scripts/phase-89-shadow-eval.ts` path quirk.** Requires `NODE_PATH=web/node_modules npx tsx ...` because `@supabase/supabase-js` lives at `web/node_modules` under pnpm. Documented inline in the script docblock.

## Requirements coverage

- **SC-89-01..SC-89-05:** see must-have table above.
- **CONTEXT D-01 — Synthetic rule_keys threaded through Wilson-CI promotion:** SATISFIED (Plans 02 + 05 + 06)
- **CONTEXT D-02 — Phase 89 does NOT flip CLASSIFIER_CRON_MUTATE:** SATISFIED (Plan 07 Step 5 documents the UAT runbook for operator post-phase)
- **CONTEXT D-03 — 839-row historic backfill applied to live Supabase:** SATISFIED (commit `f4c1ca9 docs(089-06): apply LLM rule_key backfill to live Supabase (839 rows)`; 089-PUSH-LOG.md)
- **CONTEXT D-04 — SC-89-05 git-diff gate (no edits to promotion path):** SATISFIED (Plan 07 Step 4 automated check)

## Closure ledger

- 7/7 plans completed + summarised.
- 839 rows backfilled live (irreversible — `INSERT ... ON CONFLICT DO NOTHING`; idempotent).
- Mechanism is end-to-end live: classifier-screen-worker → recordVerdict → classifier_rules with `llm:*` rule_key → classifier_rule_telemetry → (cron-gated) promotion.
- First live promotion is now an operator UAT step (089-SHADOW-REPORT Step 5 runbook). Estimated trigger: post operator retro-review of ≥30 LLM-emitted rows.

Phase 089 closed code-side 2026-05-20 (state.md). Verification doc landed 2026-05-21 during v8.1 milestone reconciliation.
