---
phase: 60
plan: 01
status: complete
date: 2026-04-28
---

# 60-01 SUMMARY — Schema Push (BLOCKING)

All 7 Wave 0 migrations applied to live Supabase via Management API.

## What Shipped

- `public.agent_runs` (absorbed Phase 55-05 rename + swarm_type + body_version + intent_version + corrected_category)
- `public.classifier_rules` + `classifier_rule_evaluations` + `classifier_rules_mailbox_overrides`
- `public.automation_runs` typed columns: `swarm_type`, `topic`, `entity`, `mailbox_id` + 4 composite indexes
- `public.classifier_queue_counts(p_swarm_type)` RPC + `classifier_rule_telemetry` view
- Legacy `debtor.agent_runs` dropped CASCADE after backfill

## Mid-Flight Fixes (committed `ae7bb80`)

1. `classifier_rule_evaluations` unique index expression `(evaluated_at)::date` rejected (42P17 — STABLE not IMMUTABLE). Wrapped with `at time zone 'UTC'` to produce a `timestamp without time zone` whose ::date cast is IMMUTABLE.
2. `automation_runs_typed_columns` join referenced `debtor.labeling_settings.id` which doesn't exist. Replaced with CASE on `result->>'source_mailbox'` mirroring `web/lib/automations/debtor-email/mailboxes.ts ICONTROLLER_MAILBOXES`.

## Verification

See `60-01-SCHEMA-PUSH-LOG.md` for the apply log + verification queries (all 4 new tables present, all 4 typed columns added).

## Commits

- `ae7bb80` fix(60-01): live-DB applicability for two Wave 0 migrations
- (60-01 itself produces no source code changes — only this SUMMARY + LOG; commit follows)

## Ready For

Wave 1 — 60-02: backfill function + ingest-route refactor.
