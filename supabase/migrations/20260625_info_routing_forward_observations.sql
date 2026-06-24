-- Forward-match Wilson ground-truth (operator idea; memory
-- `forward-match-as-wilson-ground-truth`). Staff at info@ already forward most
-- mail to the right department, so the actual forward destination is ground
-- truth for the correct route. This table stores one observation per source
-- email: the AI's held verdict bucket vs the bucket the mail was ACTUALLY
-- forwarded to. The forward-observe cron upserts these; a Wilson lower-bound
-- gate (web/lib/automations/info-routing/forward-wilson.ts) reads them to
-- release stage_4_forward_buckets per bucket.
--
-- RLS mandatory (CLAUDE.md / advisor rls_disabled_in_public ERROR):
-- service_role FOR ALL (the cron writes/reads) + authenticated FOR SELECT
-- (Bulk Review may surface forward-agreement per bucket). NO anon policy.
--
-- NOTE: WRITTEN here; apply via the live remote apply + `npm run check:supabase`
-- (this fork does not apply migrations to prod).

BEGIN;

CREATE TABLE IF NOT EXISTS public.info_routing_forward_observations (
  email_id          uuid PRIMARY KEY,            -- one observation per source email; upsert conflict target
  swarm_type        text NOT NULL DEFAULT 'info-routing',
  source_mailbox    text NOT NULL,               -- per-mailbox grouping axis
  brand             text,                         -- verdict brand (smeba | fire-control | berki)
  predicted_bucket  text NOT NULL,               -- the AI held verdict bucket
  predicted_target  text,                         -- the verdict target_mailbox
  observed_target   text NOT NULL,               -- where staff actually forwarded (To address)
  observed_bucket   text,                         -- observed_target mapped back to a bucket (NULL = non-routing address → ungraded)
  agree             boolean NOT NULL,            -- predicted_bucket === observed_bucket
  observed_at       timestamptz,                  -- the forward's sentDateTime
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Grading reads group by (predicted_bucket) and filter by source_mailbox; index
-- the two hot axes. observed_bucket NULL rows are kept (coverage visibility) but
-- excluded from the graded numerator/denominator in the pure grader.
CREATE INDEX IF NOT EXISTS info_routing_forward_obs_bucket_idx
  ON public.info_routing_forward_observations (predicted_bucket);
CREATE INDEX IF NOT EXISTS info_routing_forward_obs_mailbox_idx
  ON public.info_routing_forward_observations (source_mailbox);

ALTER TABLE public.info_routing_forward_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS info_routing_forward_obs_service_all
  ON public.info_routing_forward_observations;
CREATE POLICY info_routing_forward_obs_service_all
  ON public.info_routing_forward_observations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS info_routing_forward_obs_auth_select
  ON public.info_routing_forward_observations;
CREATE POLICY info_routing_forward_obs_auth_select
  ON public.info_routing_forward_observations
  FOR SELECT
  TO authenticated
  USING (true);

-- anon — intentionally NO policy. Anon stays fully denied under RLS.

COMMIT;
