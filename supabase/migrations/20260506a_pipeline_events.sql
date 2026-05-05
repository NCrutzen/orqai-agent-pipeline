-- Phase 70 — TELE-01..03. Single canonical telemetry table for every
-- stage decision (Stage 0..4) across every swarm. Existing per-table writes
-- (classifier_rules, agent_runs, email_labels, automation_runs) keep
-- happening unchanged — they become denormalised read-models. Bulk Review
-- and the Phase 72 promotion recommender consume from this table.
--
-- Trust boundaries (see 70-02 threat_model):
--   T-70-02-01 Information Disclosure: decision_details (jsonb) may carry
--     email-derived PII. RLS service_role-all + authenticated-select gates
--     access. Bulk Review reads run server-side under an authenticated
--     session.
--   T-70-02-02 Tampering: anon/authenticated cannot write — service_role
--     policy is the only INSERT/UPDATE/DELETE path.
--   T-70-02-04 EoP: ENABLE ROW LEVEL SECURITY below blocks unscoped reads.
--
-- Idempotency: CREATE TABLE/INDEX IF NOT EXISTS + DROP/CREATE POLICY +
-- guarded publication ALTER make this migration safe to re-run (D-18).

-- Defensive — Supabase enables pgcrypto by default (RESEARCH Assumption A1)
-- but make the dependency explicit for `gen_random_uuid()`.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.pipeline_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  swarm_type         text NOT NULL,                  -- 'debtor-email' | 'sales-email' | 'cross-cutting' (no CHECK — D-12)
  stage              smallint NOT NULL,              -- 0..4 (Stage 0 safety → Stage 4 handler); no CHECK — D-12
  email_id           uuid NULL,                      -- soft-ref to email_pipeline.emails.id (D-05, no FK)
  case_id            uuid NULL,                      -- forward-compat for case-layer (NULL until that ships)
  decision           text NOT NULL,                  -- canonical stage outcome string
  confidence         numeric(4,3) NULL,              -- [0.000, 1.000]; NULL when stage is deterministic
  override           jsonb NULL,                     -- NULL in Phase 70; Phase 71 populates {axis, original_decision, operator_id, reason}
  eval_type          text NULL,                      -- NULL in Phase 70; 'capability' | 'regression' on Phase 71 override emits
  decision_details   jsonb NULL,                     -- stage-specific structured payload
  cost_cents         numeric(10,4) NULL,             -- per-event LLM cost where applicable
  duration_ms        integer NULL,
  agent_run_id       uuid NULL,                      -- soft-ref to agent_runs.id (D-05, no FK)
  automation_run_id  uuid NULL,                      -- soft-ref to automation_runs.id (D-05, no FK)
  triggered_by       text NULL                       -- 'pipeline' | 'operator-override' | 'replay' | 'backfill'
);

CREATE INDEX IF NOT EXISTS pipeline_events_email_id_idx
  ON public.pipeline_events (email_id);
CREATE INDEX IF NOT EXISTS pipeline_events_swarm_stage_created_idx
  ON public.pipeline_events (swarm_type, stage, created_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_events_override_partial_idx
  ON public.pipeline_events (created_at DESC) WHERE override IS NOT NULL;

-- RLS — service_role full, authenticated select (mirror coordinator_runs pattern).
ALTER TABLE public.pipeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_events_service_all ON public.pipeline_events;
CREATE POLICY pipeline_events_service_all ON public.pipeline_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pipeline_events_auth_select ON public.pipeline_events;
CREATE POLICY pipeline_events_auth_select ON public.pipeline_events
  FOR SELECT TO authenticated USING (true);

-- Realtime publication for Bulk Review live updates (mirror coordinator_runs pattern).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'pipeline_events'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_events';
    END IF;
  END IF;
END $$;

GRANT SELECT ON public.pipeline_events TO authenticated;
GRANT ALL    ON public.pipeline_events TO service_role;
