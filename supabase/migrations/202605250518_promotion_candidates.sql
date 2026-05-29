-- Phase 4 Plan 01 — promotion_candidates table for the Patterns / Promotion
-- Recommender vertical slice. Schema follows sketch 007 (display_signature,
-- before_after_payload, evidence_email_ids, dismissed_by/at) + sketch 006
-- (savings_calculation_version int column). Phase 72 (Learning Inbox) later
-- inherits + extends this table additively.
--
-- Read/write contract per docs/agentic-pipeline/promotion-recommender.md:
--   - Inngest cron writes via service_role (createAdminClient).
--   - Operator UI (Patterns surface) reads via authenticated session.
--   - LERN-04: cron never sets status='approved' — that is operator-driven only.
--
-- Idempotency: CREATE ... IF NOT EXISTS + DROP/CREATE POLICY make this
-- migration safe to re-run. status is text + CHECK (additive enum changes
-- via ALTER without enum-type rewrite).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.promotion_candidates (
  id                                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                               text NOT NULL CHECK (kind IN (
    'regex_rule',
    'sender_mapping',
    'prompt_tune_stage_3',
    'new_intent',
    'prompt_tune_stage_4'
  )),
  swarm_type                         text NOT NULL,
  stage                              text NOT NULL CHECK (stage IN (
    '1-noise',
    '2-customer',
    '3-coordinator',
    '4-handler'
  )),
  signature_key                      text NOT NULL,
  proposed_change                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_event_ids                 uuid[] NOT NULL DEFAULT '{}',
  evidence_email_ids                 uuid[] NOT NULL DEFAULT '{}',
  matched_event_count_30d            int NOT NULL DEFAULT 0,
  confirm_rate                       numeric(5,4),
  expected_savings_cents_per_month   int,
  savings_calculation_version        int NOT NULL DEFAULT 1,
  status                             text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'in_review',
    'approved',
    'rejected',
    'rolled_back'
  )),
  approved_by                        uuid,
  approved_at                        timestamptz,
  dismissed_by                       uuid,
  dismissed_at                       timestamptz,
  created_at                         timestamptz NOT NULL DEFAULT now(),
  updated_at                         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (swarm_type, signature_key)
);

CREATE INDEX IF NOT EXISTS promotion_candidates_status_idx
  ON public.promotion_candidates (swarm_type, status);
CREATE INDEX IF NOT EXISTS promotion_candidates_stage_idx
  ON public.promotion_candidates (swarm_type, stage);

-- RLS — service_role full, authenticated select (mirror pipeline_events / coordinator_runs).
ALTER TABLE public.promotion_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotion_candidates_service_all ON public.promotion_candidates;
CREATE POLICY promotion_candidates_service_all
  ON public.promotion_candidates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS promotion_candidates_auth_select ON public.promotion_candidates;
CREATE POLICY promotion_candidates_auth_select
  ON public.promotion_candidates
  FOR SELECT
  TO authenticated
  USING (true);

COMMIT;
