---
phase: 089
plan: 04
subsystem: stage-1-llm-classifier
tags: [stage-1, classifier, llm, supabase, migration, backfill]
requires: [089-01]
provides: [historic-rule-key-backfill-migration]
affects:
  - supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql
tech-stack:
  added: []
  patterns: [idempotent-sql-migration, where-null-guard]
key-files:
  created:
    - supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql
  modified: []
decisions:
  - "Body verbatim from CONTEXT D-02 — no creative additions."
  - "Idempotency via WHERE rule_key IS NULL (T-089-04-01 mitigation)."
  - "Comment rewritten to avoid the literal string `human_verdict` per acceptance_criteria (T-089-04-02 mitigation) while preserving operator-review-signal intent."
  - "No BEGIN/COMMIT wrapper — Supabase migration runner manages txn."
metrics:
  duration_minutes: 4
  completed_date: 2026-05-20
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Phase 089 Plan 04: Historic LLM rule_key backfill migration — Summary

One-shot SQL migration that mints synthetic `llm:<category>:<confidence>` rule_keys on historic `public.agent_runs` rows where the LLM 2nd-pass wrote `stage1_category` + `confidence` but left `rule_key` NULL.

## What shipped

- `supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql` — single `UPDATE public.agent_runs` statement, idempotent via `WHERE rule_key IS NULL`. Body verbatim from CONTEXT D-02. Per WAVE0-PROBE Query C: expected to backfill 456 rows on first apply, 0 on re-apply.

## Acceptance gates

- File exists.
- Exactly one `UPDATE public.agent_runs`.
- Contains `WHERE rule_key IS NULL`, `tool_outputs ? 'stage1_category'`, `confidence IS NOT NULL`.
- Does NOT contain `human_verdict` anywhere (T-089-04-02 mitigation).
- Does NOT contain `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, `BEGIN`, `COMMIT`, `ROLLBACK`.
- SET expression `llm:' || (tool_outputs->>'stage1_category') || ':' || confidence` appears exactly once.

All gates verified PASS via grep.

## Deviations from Plan

**[Rule 2 — acceptance-criterion compliance] Rewrote one comment line.** The verbatim header in the plan's `<action>` block included the literal string `human_verdict` inside a comment ("Does NOT retro-stamp human_verdict — operator review signal stays honest"). The plan's own acceptance criterion forbids the string `human_verdict` "anywhere" in the file (T-089-04-02 mitigation gate). Resolved by replacing the comment with a semantically equivalent paraphrase: "Touches rule_key ONLY — operator review columns are untouched, so the review signal stays honest." The SQL body remains verbatim D-02; only a comment was paraphrased. Net effect: acceptance grep gate passes without weakening the safety contract.

## Commits

- `43db340` feat(089-04): add one-shot LLM rule_key backfill migration

## Hand-off

Migration file is ready for Plan 06 (supabase db push). Plan 07 (shadow-eval harness) will read the resulting `llm:*` rule_keys via `classifier_rule_telemetry` to identify promotable rules.

## Self-Check: PASSED

- File `supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql` exists.
- Commit `43db340` present in `git log`.
- All acceptance grep gates pass.
