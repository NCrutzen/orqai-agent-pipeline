-- Phase 60-03 hotfix. The unique index on (swarm_type, rule_key,
-- ((evaluated_at AT TIME ZONE 'UTC')::date)) was unusable from Supabase JS:
-- the client's onConflict parameter only accepts plain column names, not
-- functional-index expressions. The cron's upsert errored with 42P10
-- and wrote 0 evaluation rows.
--
-- Drop the functional unique index. Cron now uses plain .insert() so
-- same-day re-triggers produce additional rows (low volume; dedupe at
-- query time if needed). Re-introduce dedupe via a generated date
-- column or a query-level approach when it actually becomes a pain.
--
-- The lookup index on (swarm_type, rule_key, evaluated_at desc) stays —
-- it's the one the dashboard uses for sparkline queries.

drop index if exists public.classifier_rule_evaluations_daily_uniq;
