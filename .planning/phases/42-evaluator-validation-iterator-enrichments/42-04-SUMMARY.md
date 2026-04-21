---
phase: 42-evaluator-validation-iterator-enrichments
plan: 04
subsystem: testing
tags: [hardener, guardrails, tpr-tnr, sample-rate, human-review-queue, prevalence-correction, eval-science, orq-agent]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: SKST-conformant skill structure hardener already inherits
  - phase: 42-evaluator-validation-iterator-enrichments
    provides: evaluator-validator subagent (Plan 06) writes validation JSON consumed by Phase 2.0 gate; hardener resources (Plan 07) supply sample-rate and prevalence docs
provides:
  - TPR ≥ 90% AND TNR ≥ 90% promotion gate enforced before any evaluator becomes a runtime guardrail
  - Volume-based sample_rate defaults (100% / 30% / 10%) replacing fixed values
  - Human-review-queue hook (full-tier opt-in, default N=30 spans)
  - Prevalence correction formula (theta_hat) in quality-report.md for all success-rate reporting
affects:
  - Phase 5 guardrail PATCH payload (sample_rate field now volume-driven)
  - quality-report.md / quality-report.json (new Corrected θ̂ column)
  - evaluator-validator subagent contract (writes {swarm_dir}/evaluator-validations/*.json)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promotion gate reads validation JSON written by sibling subagent"
    - "Volume-tier lookup with safety override for sample_rate"
    - "Tier-gated opt-in hook (full tier surfaces, core/deploy+ skip)"
    - "Prevalence correction with corrective-range guard (TPR+TNR>1)"

key-files:
  created: []
  modified:
    - orq-agent/agents/hardener.md

key-decisions:
  - "TPR/TNR floor locked at 90%/90% with ≥60 test examples (30 Pass + 30 Fail); pre-built guardrails (orq_*) exempt; unvalidated custom evaluators downgraded to monitoring-only (settings.evaluators)"
  - "sample_rate derived from 7-day median volume via /orq-agent:analytics; safety evaluators override to 100% regardless of volume; no-data fallback = 100%"
  - "Human-review-queue hook is opt-in per-evaluator on full tier only; default N=30 spans; guardrail written with status: pending-human-review and promoted by background poll against annotations-list"
  - "Prevalence correction clamps theta_hat to [0,1] for display but preserves raw in JSON; formula skipped with warning when TPR+TNR ≤ 1 (judge worse than random)"

patterns-established:
  - "Promotion gate: evaluator-validator (sibling) writes JSON → hardener (downstream) reads and gates"
  - "Volume-based defaults: lookup tier → apply rate → record rationale in spec column"
  - "Tier-gated enrichment: full-tier features introduced as H2 sections with explicit tier check as Step 1"

requirements-completed: [EVLD-07, EVLD-08, ITRX-06, ITRX-08]

# Metrics
duration: 2 min
completed: 2026-04-21
---

# Phase 42 Plan 04: Hardener EVLD/ITRX Enrichments Summary

**Hardener now enforces TPR ≥ 90% / TNR ≥ 90% promotion gate, derives sample_rate from 7-day volume (100%/30%/10% tiers with safety override), surfaces the human-review-queue hook on full tier, and applies theta_hat prevalence correction to all reported success rates.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T05:55:21Z
- **Completed:** 2026-04-21T05:57:16Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- New Phase 2.0 (TPR/TNR Promotion Gate, EVLD-08) blocks any evaluator with TPR<90%, TNR<90%, or test_set_size<60 from becoming a runtime guardrail; pre-built guardrails exempt; unvalidated custom evaluators downgraded to `settings.evaluators` (monitoring-only).
- Step 2.3 rewritten: fixed sample_rate values removed; new H4 `Sample Rate (ITRX-08, Volume-Based Defaults)` subsection derives rate from 7-day median via `/orq-agent:analytics`, with safety override = 100% and no-data fallback = 100%.
- New Phase 3.5 (Human-Review-Queue Hook, ITRX-06) gates guardrail promotion behind N human-reviewed spans (default 30) on full tier only; core/deploy+ skip entirely.
- New Phase 6.0 (Prevalence Correction, EVLD-07) adds theta_hat = (p_observed + TNR − 1) / (TPR + TNR − 1) to quality-report.md (new `Corrected (θ̂)` column) and quality-report.json; skipped with warning when TPR+TNR ≤ 1.
- Done When checklist extended with ITRX-06 + EVLD-07 rows (TPR/TNR + sample_rate rows already present).
- Existing Constraints block, Anti-Patterns, Open in orq.ai, Documentation & Resolution preserved byte-identical.

## Task Commits

1. **Task 1: Enrich hardener with TPR/TNR gate, volume sample_rate, human-review-queue, prevalence correction** - `16645e9` (feat)

_Plan metadata commit added after SUMMARY write._

## Files Created/Modified
- `orq-agent/agents/hardener.md` - Added Phase 2.0 / Phase 3.5 / Phase 6.0; replaced Step 2.3 sample_rate logic with volume-based table; extended Done When checklist (+172 / −15 lines).

## Decisions Made
- **TPR/TNR gate reads evaluator-validator output:** Gate lives in hardener but the labeled data collection lives in the `evaluator-validator` subagent (Plan 06). JSON contract: `{swarm_dir}/evaluator-validations/{name}.json` with `tpr`, `tnr`, `test_set_size`, `validated_at`. Keeps concerns separated.
- **Downgrade path instead of hard-fail:** Unvalidated custom evaluators are downgraded to `settings.evaluators` (monitoring-only) rather than refused entirely — preserves visibility without blocking production traffic on unvalidated judges.
- **sample_rate = runtime property, not spec property:** Volume-driven derivation means the 7-day analytics call happens at harden time; recorded in spec under new `Volume Rationale` column so later re-deploys have auditable history without re-querying.
- **Prevalence correction guarded by TPR+TNR>1:** Formula is mathematically undefined (division toward zero) below this threshold; report raw with explicit warning rather than produce misleading corrected numbers.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for Plan 05 (next 42-XX-PLAN.md).
- Hardener now depends on two inbound artifacts not yet produced by this phase: (a) `{swarm_dir}/evaluator-validations/*.json` (Plan 06, evaluator-validator subagent) and (b) `orq-agent/agents/hardener/resources/{sample-rate-volume-defaults.md, prevalence-correction.md}` (Plan 07). Until those plans land, hardener falls back to "unvalidated → monitoring-only" and inline formula/table text.
- Existing Constraints anchors (EVLD-08 + ITRX-08) preserved byte-identical — no downstream break.

## Self-Check: PASSED

- File exists: `orq-agent/agents/hardener.md` ✓
- Commit exists: `16645e9` ✓
- All 9 grep anchors present verbatim ✓
- Lint exits 0 ✓
- Protected pipeline SHA-256 3/3 match ✓

---
*Phase: 42-evaluator-validation-iterator-enrichments*
*Completed: 2026-04-21*
