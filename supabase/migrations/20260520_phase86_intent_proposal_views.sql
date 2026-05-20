-- Phase 86 D-07 — lightweight telemetry for the Bulk Review "Intent proposals" tab.
--
-- One row per tab open. Volume: =50 rows/month (per 86-RESEARCH Q7). 90-day
-- retention is enforced by the nightly cron's cleanup step (Plan 02); this
-- table itself has no built-in TTL.
--
-- Why a dedicated table (not pipeline_events): pipeline_events.stage is NOT
-- NULL smallint constrained to 0..4 pipeline stages — a tab-open is not a
-- pipeline stage; forcing stage=3 would pollute audit grep semantics.

BEGIN;

CREATE TABLE IF NOT EXISTS public.intent_proposal_views (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewed_at    timestamptz NOT NULL DEFAULT now(),
  operator_id  text NULL,
  swarm_type   text NULL,
  cluster_id   text NULL,
  user_agent   text NULL
);

CREATE INDEX IF NOT EXISTS intent_proposal_views_viewed_at_idx
  ON public.intent_proposal_views (viewed_at DESC);
CREATE INDEX IF NOT EXISTS intent_proposal_views_swarm_idx
  ON public.intent_proposal_views (swarm_type, viewed_at DESC);

ALTER TABLE public.intent_proposal_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intent_proposal_views_service_all ON public.intent_proposal_views;
CREATE POLICY intent_proposal_views_service_all
  ON public.intent_proposal_views FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS intent_proposal_views_auth_insert ON public.intent_proposal_views;
CREATE POLICY intent_proposal_views_auth_insert
  ON public.intent_proposal_views FOR INSERT TO authenticated WITH CHECK (true);

GRANT INSERT, SELECT ON public.intent_proposal_views TO authenticated;
GRANT ALL ON public.intent_proposal_views TO service_role;

COMMIT;
