-- Phase 87 — intent_volume_baselines
-- D-05 LOCKED schema. Snapshot table read by V8.2 (handler picks),
-- V9.0 (Learning Inbox synthesis), V11.0 (intent-prioritisation dashboard).
-- Append-only — future Phase 87 runs add new baselines, never overwrite.

BEGIN;

CREATE TABLE IF NOT EXISTS public.intent_volume_baselines (
  baseline_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_type    text NOT NULL,
  window_start  date NOT NULL,
  window_end    date NOT NULL,
  intent_key    text NOT NULL,
  intent_source text NOT NULL CHECK (intent_source IN ('closed_list','proposal_cluster')),
  count         integer NOT NULL,
  share         numeric(5,4) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intent_volume_baselines_swarm_window_idx
  ON public.intent_volume_baselines (swarm_type, window_end DESC);

ALTER TABLE public.intent_volume_baselines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intent_volume_baselines_service_all ON public.intent_volume_baselines;
CREATE POLICY intent_volume_baselines_service_all
  ON public.intent_volume_baselines
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS intent_volume_baselines_auth_select ON public.intent_volume_baselines;
CREATE POLICY intent_volume_baselines_auth_select
  ON public.intent_volume_baselines
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.intent_volume_baselines TO authenticated;
GRANT ALL    ON public.intent_volume_baselines TO service_role;

COMMIT;
