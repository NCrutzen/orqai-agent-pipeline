-- Phase 87 — stage_3_retro_runs
-- Per-email retro Stage 3 verdict (Side-Channel Isolation from live pipeline).
-- Plan 04's Inngest function writes here via service-role admin client.
-- (run_id, email_id) UNIQUE protects against Inngest replay (CLAUDE.md Phase 65 pattern).

BEGIN;

CREATE TABLE IF NOT EXISTS public.stage_3_retro_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               uuid NOT NULL,
  email_id             uuid NOT NULL,
  swarm_type           text NOT NULL,
  original_top_intent  text,
  original_confidence  numeric(4,3),
  new_top_intent       text NOT NULL,
  new_confidence       text,
  intent_proposal      text,
  proposal_reason      text,
  ranked_intents       jsonb NOT NULL,
  token_usage_total    int  NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS stage_3_retro_runs_run_email_uniq
  ON public.stage_3_retro_runs (run_id, email_id);

CREATE INDEX IF NOT EXISTS stage_3_retro_runs_run_idx
  ON public.stage_3_retro_runs (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stage_3_retro_runs_diff_idx
  ON public.stage_3_retro_runs (run_id)
  WHERE original_top_intent IS DISTINCT FROM new_top_intent;

ALTER TABLE public.stage_3_retro_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_3_retro_runs_service_all ON public.stage_3_retro_runs;
CREATE POLICY stage_3_retro_runs_service_all
  ON public.stage_3_retro_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS stage_3_retro_runs_auth_select ON public.stage_3_retro_runs;
CREATE POLICY stage_3_retro_runs_auth_select
  ON public.stage_3_retro_runs
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.stage_3_retro_runs TO authenticated;
GRANT ALL    ON public.stage_3_retro_runs TO service_role;

COMMIT;
