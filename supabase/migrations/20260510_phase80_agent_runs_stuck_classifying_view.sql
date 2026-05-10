-- Phase 80 — aggregate view consumed by web/scripts/backfill-stuck-classifying-stage3.ts
-- Joins stranded agent_runs (status='classifying' with intent_first_pass payload) against
-- automation_runs to count matching {swarm}-kanban rows. The script uses kanban_rows to
-- bucket each stuck row into HAS_KANBAN (flip → routed_human_queue), NO_KANBAN (flag-only),
-- or MULTI_KANBAN (flag-only — defends the duplicate-write cluster).
--
-- The regex guard before the ::uuid cast is required because automation_runs.result->>'email_id'
-- contains non-UUID synthetic values from older smoke fixtures (e.g. 'smoke-safe-2'), which
-- crash an unguarded ::uuid cast at query time.

CREATE OR REPLACE VIEW public.agent_runs_stuck_classifying_with_kanban_count AS
SELECT ar.id,
       ar.email_id,
       ar.status,
       ar.swarm_type,
       ar.created_at,
       ar.tool_outputs->'intent_first_pass' AS intent_first_pass,
       COUNT(am.id) FILTER (
         WHERE am.automation = ar.swarm_type || '-kanban'
       ) AS kanban_rows
  FROM agent_runs ar
  LEFT JOIN automation_runs am
    ON am.result->>'email_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND (am.result->>'email_id')::uuid = ar.email_id
   AND am.automation = ar.swarm_type || '-kanban'
 WHERE ar.status = 'classifying'
   AND ar.tool_outputs ? 'intent_first_pass'
 GROUP BY ar.id;
