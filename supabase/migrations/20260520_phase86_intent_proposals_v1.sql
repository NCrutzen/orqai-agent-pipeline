-- Phase 86 D-02 — open-set intent proposal surface (view foundation).
--
-- Source-of-truth correction (CONTEXT D-01 amendment, locked 2026-05-20):
-- Reads pipeline_events.decision_details->>'intent_proposal' / 'proposal_reason'.
-- It does NOT read coordinator_runs.ranked_intents (proposals are not ranked output)
-- and it does NOT read coordinator_runs.decision_details (that jsonb column exists
-- but Phase 85's spread-conditional emit at debtor-email-coordinator.ts:329-332
-- sinks proposals to pipeline_events, never to the coordinator_runs UPDATE on
-- line 281). Reading from coordinator_runs.decision_details would silently
-- return zero proposal rows.
--
-- No backfill needed: pre-V3 rows naturally have decision_details->>'intent_proposal'
-- IS NULL because Phase 85's spread-conditional emit only fires for
-- intent_version === INTENT_VERSION_V3. The IS NOT NULL filter is the open-set
-- predicate.
--
-- LEFT JOIN rationale: an email row may be absent (purged, race) — preserve the
-- proposal telemetry row even when subject/sender_email are unavailable.
--
-- security_invoker=true: RLS of the calling role applies (Supabase advisor
-- requirement; SECURITY DEFINER is forbidden on public-schema views).

CREATE OR REPLACE VIEW public.intent_proposals_v1
  WITH (security_invoker = true)
AS
SELECT
  pe.id                                          AS pipeline_event_id,
  pe.email_id                                    AS email_id,
  pe.swarm_type                                  AS swarm_type,
  pe.decision_details->>'intent_proposal'        AS proposal_label,
  pe.decision_details->>'proposal_reason'        AS proposal_reason,
  pe.decision_details->>'intent_version'         AS intent_version,
  pe.decision_details->'ranked'->0->>'intent'    AS ranked_top_intent,
  pe.created_at                                  AS created_at,
  e.subject                                      AS subject,
  e.sender_email                                 AS sender_email
FROM public.pipeline_events pe
LEFT JOIN email_pipeline.emails e ON e.id = pe.email_id
WHERE pe.stage = 3
  AND pe.decision_details->>'intent_proposal' IS NOT NULL
  AND pe.decision_details->>'intent_proposal' <> '';

GRANT SELECT ON public.intent_proposals_v1 TO authenticated;
GRANT SELECT ON public.intent_proposals_v1 TO service_role;
