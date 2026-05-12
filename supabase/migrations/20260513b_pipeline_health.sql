-- Phase 82.2 — Stage 0 telemetry coverage fix (v8.0 stabilisation)
-- Plan 82.2-03 / TELE-COV-02
--
-- Creates the durable write target for the daily Stage 0 coverage probe
-- (D-07/D-08, implemented by Plan 82.2-10 in
-- web/lib/inngest/functions/stage-0-coverage-probe.ts) plus two RPC helpers
-- called by the probe and the historical backfill (Plan 82.2-09).
--
-- Why a table instead of writing STATE.md directly (RESEARCH §Coverage probe
-- Risk #3): Inngest functions run on Vercel serverless. `.planning/STATE.md`
-- is NOT shipped into the function bundle by default, so a literal file-write
-- interpretation of D-08 is fragile. Per D-08 "Claude's Discretion", we
-- persist coverage history in `public.pipeline_health` and expose it via the
-- two RPCs below. `/gsd-progress` reads the table; the breach session-note
-- references the row id for traceability.
--
-- Related research sections:
--   - §Backfill query + source mapping (lines 230–323) for the
--     `stage0_backfill_candidates` LATERAL join.
--   - §Coverage query (lines 565–595) for the `stage0_coverage_24h` CTE.
--
-- Trust boundaries (see 82.2-03 threat_model):
--   T-82.2-03-01 Information Disclosure: pipeline_health rows carry only
--     mailbox name + counts (no email content). RLS denies anon and
--     authenticated entirely; service_role only.
--   T-82.2-03-02 Tampering: `stage0_backfill_candidates(window_days)` clamps
--     window_days server-side to ≤30 and rejects negative values.
--
-- Idempotency: CREATE TABLE/INDEX IF NOT EXISTS + DROP/CREATE POLICY + REPLACE
-- on functions make this migration safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- pipeline_health: one row per probe-run × mailbox.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pipeline_health (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  probe_run_id   uuid NOT NULL,                   -- groups all mailboxes from one cron tick
  mailbox        text NOT NULL,
  swarm_type     text NOT NULL,
  stage1_count   bigint NOT NULL DEFAULT 0,
  stage0_count   bigint NOT NULL DEFAULT 0,
  coverage_pct   numeric(5,4) GENERATED ALWAYS AS (
                    CASE
                      WHEN stage1_count = 0 THEN NULL
                      ELSE (stage0_count::numeric / stage1_count::numeric)
                    END
                  ) STORED,
  breached       boolean GENERATED ALWAYS AS (
                    stage1_count > 0
                    AND (stage0_count::numeric / NULLIF(stage1_count, 0)::numeric) < 0.99
                  ) STORED,
  recorded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_health_recorded_at_idx
  ON public.pipeline_health (recorded_at DESC);

CREATE INDEX IF NOT EXISTS pipeline_health_breached_recorded_at_idx
  ON public.pipeline_health (breached, recorded_at DESC)
  WHERE breached = true;

-- RLS — service_role only (mirrors pipeline_events posture; no
-- authenticated read because coverage figures are operator-only and
-- /gsd-progress runs locally with the service-role key).
ALTER TABLE public.pipeline_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_health_service_all ON public.pipeline_health;
CREATE POLICY pipeline_health_service_all ON public.pipeline_health
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.pipeline_health TO service_role;

-- ---------------------------------------------------------------------------
-- stage0_coverage_24h: per-mailbox 24h coverage counters.
-- Per RESEARCH §Coverage query (lines 569–594).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stage0_coverage_24h(mailbox_arg text, swarm_arg text)
RETURNS TABLE(stage1_count bigint, stage0_count bigint)
LANGUAGE sql STABLE AS $$
  WITH stage1 AS (
    SELECT DISTINCT pe.email_id
    FROM public.pipeline_events pe
    JOIN email_pipeline.emails e ON e.id = pe.email_id
    WHERE pe.stage = 1
      AND pe.swarm_type = swarm_arg
      AND e.mailbox = mailbox_arg
      AND pe.created_at >= now() - interval '24 hours'
      AND pe.email_id IS NOT NULL
  ),
  stage0 AS (
    SELECT DISTINCT email_id
    FROM public.pipeline_events
    WHERE stage = 0
      AND swarm_type = swarm_arg
      AND created_at >= now() - interval '25 hours'  -- 1h buffer for stage0/stage1 races
      AND email_id IS NOT NULL
  )
  SELECT
    (SELECT count(*) FROM stage1)::bigint AS stage1_count,
    (SELECT count(*) FROM stage1 JOIN stage0 USING (email_id))::bigint AS stage0_count;
$$;

GRANT EXECUTE ON FUNCTION public.stage0_coverage_24h(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- stage0_backfill_candidates: gap query with LATERAL automation_runs join.
-- Per RESEARCH §Backfill (lines 305–323). Returns one row per (email_id,
-- swarm_type) gap, with the best-effort automation_runs reconstruction
-- attached for D-04 source mapping.
--
-- Input validation (RESEARCH §V5, T-82.2-03-02):
--   - window_days < 1  → RAISE EXCEPTION
--   - window_days > 30 → silently clamped to 30 (D-05 cap)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stage0_backfill_candidates(window_days integer)
RETURNS TABLE(
  email_id     uuid,
  swarm_type   text,
  completed_at timestamptz,
  result       jsonb
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  clamped_days integer;
BEGIN
  IF window_days IS NULL OR window_days < 1 THEN
    RAISE EXCEPTION 'window_days must be a positive integer, got: %', window_days
      USING ERRCODE = '22023';  -- invalid_parameter_value
  END IF;

  clamped_days := LEAST(window_days, 30);

  RETURN QUERY
  WITH stage1_in_window AS (
    SELECT DISTINCT pe.email_id, pe.swarm_type
    FROM public.pipeline_events pe
    WHERE pe.stage = 1
      AND pe.email_id IS NOT NULL
      AND pe.created_at >= now() - make_interval(days => clamped_days)
  ),
  stage0_present AS (
    SELECT pe.email_id, pe.swarm_type
    FROM public.pipeline_events pe
    WHERE pe.stage = 0
      AND pe.email_id IS NOT NULL
      AND pe.created_at >= now() - make_interval(days => clamped_days + 1)  -- 1d buffer
  )
  SELECT
    s1.email_id,
    s1.swarm_type,
    ar.completed_at,
    ar.result
  FROM stage1_in_window s1
  LEFT JOIN stage0_present s0
    ON s0.email_id = s1.email_id AND s0.swarm_type = s1.swarm_type
  LEFT JOIN email_pipeline.emails e
    ON e.id = s1.email_id
  LEFT JOIN LATERAL (
    SELECT ar2.result, ar2.completed_at
    FROM public.automation_runs ar2
    WHERE ar2.result->>'message_id' = e.source_id
      AND ar2.swarm_type = s1.swarm_type
      AND ar2.result->>'stage' IN ('stage_0_safety', 'stage_0_safety_pending')
    ORDER BY ar2.completed_at DESC NULLS LAST
    LIMIT 1
  ) ar ON true
  WHERE s0.email_id IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.stage0_backfill_candidates(integer) TO service_role;
