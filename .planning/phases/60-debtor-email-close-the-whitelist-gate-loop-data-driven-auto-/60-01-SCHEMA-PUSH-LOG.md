# 60-01 Schema Push Log

**Date applied:** 2026-04-28
**Mechanism:** Supabase Management API (`https://api.supabase.com/v1/projects/mvqjhlxfvtqqubqgdvhz/database/query`)
**Operator:** Nick Crutzen
**Token:** `SUPABASE_ACCESS_TOKEN` (sbp_*) refreshed during this session
**Project:** Agent-Workforce (`mvqjhlxfvtqqubqgdvhz`, eu-west-1, ACTIVE_HEALTHY)

## Migrations Applied (in order)

| # | File | Status | Notes |
|---|------|--------|-------|
| 1 | `20260428_public_agent_runs.sql` | ✅ HTTP 201 | Created `public.agent_runs` + RLS + indexes; backfilled from `debtor.agent_runs`; dropped legacy `debtor.agent_runs CASCADE` |
| 2 | `20260428_classifier_rules.sql` | ✅ HTTP 201 | New table + UNIQUE(swarm_type, rule_key) + RLS + service_role policy |
| 3 | `20260428_classifier_rule_evaluations.sql` | ⚠️ first attempt failed (42P17 IMMUTABLE), fixed and re-applied → ✅ HTTP 201 | Index expression cast (timestamptz)::date is STABLE; wrapped with `AT TIME ZONE 'UTC'` first to make it IMMUTABLE |
| 4 | `20260428_classifier_rules_mailbox_overrides.sql` | ✅ HTTP 201 | Per-mailbox override matrix |
| 5 | `20260428_automation_runs_typed_columns.sql` | ⚠️ first attempt failed (42703 ls.id), fixed and re-applied → ✅ HTTP 201 | `debtor.labeling_settings` has no `id` column; replaced join with CASE on `result->>'source_mailbox'` mirroring `ICONTROLLER_MAILBOXES` |
| 6 | `20260428_classifier_rule_telemetry.sql` | ✅ HTTP 201 | View joining classifier_rules ↔ agent_runs |
| 7 | `20260428_classifier_queue_counts.sql` | ✅ HTTP 201 | RPC `classifier_queue_counts(p_swarm_type text)` |

## Fixes Committed Mid-Apply

- `ae7bb80` fix(60-01): live-DB applicability for two Wave 0 migrations
  - `classifier_rule_evaluations.sql` — cast `at time zone 'UTC'` before `::date` in unique index
  - `automation_runs_typed_columns.sql` — CASE on `result->>'source_mailbox'` instead of nonexistent `debtor.labeling_settings.id`

## Verification

```sql
-- New tables present
select table_name from information_schema.tables
where table_schema='public'
  and table_name in ('agent_runs','classifier_rules','classifier_rule_evaluations','classifier_rules_mailbox_overrides');
-- → 4 rows ✅

-- automation_runs typed columns present
select column_name from information_schema.columns
where table_schema='public' and table_name='automation_runs'
  and column_name in ('swarm_type','topic','entity','mailbox_id');
-- → 4 rows ✅
```

## must_haves Verification

- [x] All 7 Phase 60 migrations applied to live Supabase ✅
- [x] `public.agent_runs` exists (cross-swarm rows backfilled from legacy `debtor.agent_runs`) ✅
- [x] `public.classifier_rules`, `classifier_rule_evaluations`, `classifier_rules_mailbox_overrides` exist with RLS ✅
- [x] `public.automation_runs` typed columns added (swarm_type, topic, entity, mailbox_id) ✅
- [x] `public.classifier_queue_counts` RPC + `classifier_rule_telemetry` view callable ✅
- [x] Mechanism logged: Management API ✅

## Ready For

- Wave 1 (60-02): Backfill function + ingest-route refactor (cache + typed columns)
- Wave 2-4 (60-03..60-07): All downstream plans can now read/write the new tables.
