-- Phase 71 D-09: per-email aggregate of pipeline_events for Bulk Review predicted-row feed
-- and Phase 72 promotion recommender input.
--
-- VIEW (not table) per CONTEXT D-09:
--   * authoritative source stays public.pipeline_events (Phase 70 invariant)
--   * no dual-write maintenance
--   * view is index-friendly via pipeline_events_email_stage_created_idx
-- security_invoker=true so authenticated SELECT inherits pipeline_events RLS
-- (Phase 71 RESEARCH Pitfall 4 / Assumption A1).

CREATE INDEX IF NOT EXISTS pipeline_events_email_stage_created_idx
  ON public.pipeline_events (email_id, stage, created_at DESC);

CREATE OR REPLACE VIEW public.pipeline_events_email_summary
WITH (security_invoker = true) AS
WITH per_stage AS (
  SELECT DISTINCT ON (email_id, swarm_type, stage)
    email_id,
    swarm_type,
    stage,
    decision,
    override IS NOT NULL AS overridden,
    eval_type,
    cost_cents,
    decision_details,
    created_at,
    id AS latest_event_id
  FROM public.pipeline_events
  WHERE email_id IS NOT NULL
  ORDER BY email_id, swarm_type, stage, created_at DESC
)
SELECT
  ps.email_id,
  ps.swarm_type,
  MAX(ps.decision) FILTER (WHERE ps.stage = 0) AS stage_0_decision,
  MAX(ps.decision) FILTER (WHERE ps.stage = 1) AS stage_1_decision,
  MAX(ps.decision) FILTER (WHERE ps.stage = 2) AS stage_2_decision,
  MAX(ps.decision) FILTER (WHERE ps.stage = 3) AS stage_3_decision,
  MAX(ps.decision) FILTER (WHERE ps.stage = 4) AS stage_4_decision,
  bool_or(ps.overridden) FILTER (WHERE ps.stage = 1) AS stage_1_overridden,
  bool_or(ps.overridden) FILTER (WHERE ps.stage = 2) AS stage_2_overridden,
  bool_or(ps.overridden) FILTER (WHERE ps.stage = 3) AS stage_3_overridden,
  bool_or(ps.overridden) FILTER (WHERE ps.stage = 4) AS stage_4_overridden,
  (
    SELECT COALESCE(SUM(pe.cost_cents), 0)
    FROM public.pipeline_events pe
    WHERE pe.email_id = ps.email_id
      AND pe.swarm_type = ps.swarm_type
  ) AS total_cost_cents,
  (
    SELECT COUNT(*)
    FROM public.pipeline_events pe
    WHERE pe.email_id = ps.email_id
      AND pe.swarm_type = ps.swarm_type
      AND pe.stage = 4
      AND pe.decision_details ? 'tool_calls'
  ) AS tool_call_count,
  MIN(ps.created_at) AS first_event_at,
  MAX(ps.created_at) AS last_event_at
FROM per_stage ps
GROUP BY ps.email_id, ps.swarm_type;

GRANT SELECT ON public.pipeline_events_email_summary TO authenticated, service_role;
