# Phase 89 — Discussion Log

Date: 2026-05-20

## Areas selected
All four gray areas presented were selected: telemetry source, shadow-run scope, seed strategy, cross-swarm scope.

## Q1 — Telemetry source
Options: (a) reuse existing view + `agent_runs.human_verdict`; (b) widen view to UNION `email_feedback.verdict`; (c) migrate to `email_feedback` only.
**User chose:** (a) — reuse existing view.
Note: roadmap text "widen to email_feedback.verdict" was misleading; `human_verdict` is already the canonical signal.

## Q2 — Shadow-run scope
Options: (a) retro-backfill `rule_key`; (b) forward-only; (c) hybrid (backfill `rule_key` only, not `human_verdict`).
**User chose:** (c) hybrid.
Reason: preserves operator-feedback integrity while letting shadow cron evaluate immediately.

## Q3 — Seed strategy
Options: (a) eager all-combos `(swarm × noise_category × high)`; (b) lazy on first occurrence; (c) eager filtered by historic ≥5 LLM verdicts.
**User chose:** (a) eager.

## Q4 — Cross-swarm scope
Options: (1) debtor-only; (2) cross-swarm including dispatch refactor; (3) data cross-swarm, dispatch debtor-only.
**User initially leaned toward (1)** but asked whether (2) was Phase 89's responsibility given V10 launching sales@/info@/order@ next week.
**Reframed:** three concerns are tangled — `rule_key` writes, `classifier_rules` seed, and the auto-action dispatch gate. (1) + (2) belong in Phase 89; (3) belongs in Phase 88 / V10 onboarding because each swarm has different auto-action semantics.
**User locked:** (3) data cross-swarm, dispatch debtor-only.

## Deferred
- Auto-action dispatch refactor → Phase 88 (info-routing swarm).
- Medium-confidence promotion → revisit after high-confidence track proves out.
- `email_feedback.verdict` as secondary telemetry → revisit with V9.0 Promotion Recommender.
- Audit-panel chip for LLM rule_key status → not in scope.

## Claude's discretion (no user input asked)
- Use the existing `classifier-promotion-cron` evaluator unchanged (already swarm-agnostic).
- Reuse the `ON CONFLICT(swarm_type, rule_key) DO NOTHING` seed pattern from `classifier-backfill.ts`.
- Mirror the Phase 83 30-day backfill harness pattern for the historic `rule_key` UPDATE.
- Do not touch `pipeline_events.decision_details.predictor` (Phase 999.8 D-11 already done).
