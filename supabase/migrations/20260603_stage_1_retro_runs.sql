-- Phase 111 Plan 03 (D-01) — stage_1_retro_runs
--
-- Per-email retro Stage-1 (noise filter) verdict for the sales-email swarm.
-- The Stage-1 retro harness (web/lib/inngest/functions/sales-email-stage-1-retro-classify.ts)
-- re-runs the Stage-1 noise classifier (sales has no regex Pass 1 →
-- `stage-1-category-classifier` LLM Pass 2 only) across BOTH Smeba corpora —
-- live verkoop@smeba.nl Outlook (853) AND historic source='sugarcrm' (34,725) —
-- and writes per-email verdicts here, producing per-category hit-rate +
-- false-archive estimates (D-01 calibration evidence Plan 04 consumes).
--
-- SIDE-CHANNEL ISOLATION (Anti-Pattern A5 / Phase 87 #1 lock): the harness
-- writes ONLY this table. It MUST NOT touch live-pipeline state
-- (automation_runs, live agent_runs, pipeline_events). A retro-run that
-- mutates production tables corrupts pipeline state (T-111-08).
--
-- UNIQUE (run_id, email_id) makes the harness upsert (onConflict
-- "run_id,email_id", ignoreDuplicates) a no-op on Inngest replay — run_id is
-- generated INSIDE step.run (CLAUDE.md Phase 65 replay-safety, T-111-09).
--
-- Backend-only table → service-role-only policy, NO authenticated/anon policy
-- (npm run check:supabase fails CI on any ERROR-level rls_disabled_in_public lint).
--
-- Applied in Plan 05 (the [BLOCKING] migration job) — this plan only WRITES the file.

BEGIN;

-- 1. Table — per-email Stage-1 retro verdict.
--    email_id is uuid (matches email_pipeline.emails.id, a uuid).
CREATE TABLE IF NOT EXISTS public.stage_1_retro_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                 uuid NOT NULL,
  email_id               uuid NOT NULL,
  swarm_type             text NOT NULL,
  source                 text,              -- 'outlook' | 'sugarcrm' (corpus provenance)
  normalized_direction   text,              -- 'inbound' | 'outbound' (Pitfall 4 normalization)
  predicted_category_key text NOT NULL,     -- a noise key, or 'unknown' (the closed-list fall-through)
  confidence             text,              -- 'low' | 'medium' | 'high' (Stage1OutputSchema)
  is_noise               boolean NOT NULL DEFAULT false,  -- predicted a noise key (not 'unknown')
  would_archive          boolean NOT NULL DEFAULT false,  -- noise key whose live action='categorize_archive'
  false_archive_suspect  boolean NOT NULL DEFAULT false,  -- inbound mail predicted as would-archive noise (D-09 signal)
  model_key              text,              -- which LLM answered (agent/model id)
  token_usage_total      int  NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- 2. Idempotency key — the harness upsert onConflict target.
CREATE UNIQUE INDEX IF NOT EXISTS stage_1_retro_runs_run_email_uniq
  ON public.stage_1_retro_runs (run_id, email_id);

-- Read-path indexes for aggregate-baseline (group-by per run/category) and the
-- false-archive scan.
CREATE INDEX IF NOT EXISTS stage_1_retro_runs_run_idx
  ON public.stage_1_retro_runs (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stage_1_retro_runs_false_archive_idx
  ON public.stage_1_retro_runs (run_id)
  WHERE false_archive_suspect;

-- 3. Enable RLS — required for every new table in a PostgREST-exposed schema.
ALTER TABLE public.stage_1_retro_runs ENABLE ROW LEVEL SECURITY;

-- 4. Service-role-only policy. Backend-only table — NO authenticated/anon
--    policy (no policy = no access under RLS).
DROP POLICY IF EXISTS stage_1_retro_runs_service_all ON public.stage_1_retro_runs;
CREATE POLICY stage_1_retro_runs_service_all
  ON public.stage_1_retro_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.stage_1_retro_runs TO service_role;

COMMIT;
