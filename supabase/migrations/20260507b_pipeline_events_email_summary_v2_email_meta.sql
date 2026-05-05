-- Phase 71-08: extend pipeline_events_email_summary with email metadata so the
-- Bulk Review row strip can render real subject + sender + recipient_mailbox
-- instead of "(no subject)" / "unknown sender". JOIN-back to
-- email_pipeline.emails by email_id (always uuid post-71-06).
--
-- DROP+CREATE because CREATE OR REPLACE VIEW cannot insert columns in the
-- middle of the projection list (Postgres rejects renames). Already applied
-- to acceptance.

DROP VIEW IF EXISTS public.pipeline_events_email_summary;

CREATE VIEW public.pipeline_events_email_summary
WITH (security_invoker = true) AS
WITH per_stage AS (
  SELECT DISTINCT ON (email_id, swarm_type, stage)
    email_id, swarm_type, stage, decision,
    override IS NOT NULL AS overridden,
    eval_type, cost_cents, decision_details, created_at,
    id AS latest_event_id
  FROM public.pipeline_events
  WHERE email_id IS NOT NULL
  ORDER BY email_id, swarm_type, stage, created_at DESC
)
SELECT
  ps.email_id,
  ps.swarm_type,
  e.subject,
  e.sender_email,
  e.sender_name,
  e.mailbox AS recipient_mailbox,
  e.received_at AS email_received_at,
  MAX(ps.decision) FILTER (WHERE ps.stage = 0) AS stage_0_decision,
  MAX(ps.decision) FILTER (WHERE ps.stage = 1) AS stage_1_decision,
  MAX(ps.decision) FILTER (WHERE ps.stage = 2) AS stage_2_decision,
  MAX(ps.decision) FILTER (WHERE ps.stage = 3) AS stage_3_decision,
  MAX(ps.decision) FILTER (WHERE ps.stage = 4) AS stage_4_decision,
  bool_or(ps.overridden) FILTER (WHERE ps.stage = 1) AS stage_1_overridden,
  bool_or(ps.overridden) FILTER (WHERE ps.stage = 2) AS stage_2_overridden,
  bool_or(ps.overridden) FILTER (WHERE ps.stage = 3) AS stage_3_overridden,
  bool_or(ps.overridden) FILTER (WHERE ps.stage = 4) AS stage_4_overridden,
  (SELECT COALESCE(SUM(pe.cost_cents),0) FROM public.pipeline_events pe
    WHERE pe.email_id=ps.email_id AND pe.swarm_type=ps.swarm_type) AS total_cost_cents,
  (SELECT COUNT(*) FROM public.pipeline_events pe
    WHERE pe.email_id=ps.email_id AND pe.swarm_type=ps.swarm_type
    AND pe.stage=4 AND pe.decision_details ? 'tool_calls') AS tool_call_count,
  MIN(ps.created_at) AS first_event_at,
  MAX(ps.created_at) AS last_event_at
FROM per_stage ps
LEFT JOIN email_pipeline.emails e ON e.id = ps.email_id
GROUP BY ps.email_id, ps.swarm_type, e.subject, e.sender_email, e.sender_name, e.mailbox, e.received_at;

GRANT SELECT ON public.pipeline_events_email_summary TO authenticated, service_role;
