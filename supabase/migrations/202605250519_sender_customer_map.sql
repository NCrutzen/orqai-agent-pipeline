-- Phase 4 Plan 01 — debtor.sender_customer_map. Apply target for the Known-
-- sender promotion kind (Plan 03). Maps a sender email address to the
-- customer_account_id that operator overrides have repeatedly confirmed it
-- belongs to. Stage 2 Known-sender resolver reads this at runtime.
--
-- Phase 4 ships the table only — Plan 03 wires the Apply server action that
-- INSERTs into it from an approved promotion_candidates row.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS debtor;

CREATE TABLE IF NOT EXISTS debtor.sender_customer_map (
  sender_email             text PRIMARY KEY,
  customer_account_id      text NOT NULL,
  swarm_type               text NOT NULL,
  source                   text NOT NULL DEFAULT 'promotion_recommender' CHECK (source IN (
    'promotion_recommender',
    'manual',
    'migration'
  )),
  promotion_candidate_id   uuid REFERENCES public.promotion_candidates(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid
);

CREATE INDEX IF NOT EXISTS sender_customer_map_swarm_idx
  ON debtor.sender_customer_map (swarm_type);

ALTER TABLE debtor.sender_customer_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sender_customer_map_service_all ON debtor.sender_customer_map;
CREATE POLICY sender_customer_map_service_all
  ON debtor.sender_customer_map
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated read for Stage 2 resolver hydration / operator display.
DROP POLICY IF EXISTS sender_customer_map_auth_select ON debtor.sender_customer_map;
CREATE POLICY sender_customer_map_auth_select
  ON debtor.sender_customer_map
  FOR SELECT
  TO authenticated
  USING (true);

COMMIT;
