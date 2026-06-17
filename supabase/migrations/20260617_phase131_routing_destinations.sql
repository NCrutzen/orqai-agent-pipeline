-- Phase 131 Plan 01 Task 1 (ROUTE-01 / ROUTE-02 / D-01) — destination taxonomy
-- registry for the info-routing Stage-3 router.
--
-- Creates public.routing_destinations: ONE denormalized row per (bucket × brand)
-- (D-01 — NOT modeled as swarm_intents rows, NOT split into normalized tables),
-- RLS-protected (service_role FOR ALL + authenticated FOR SELECT for the Phase
-- 132 Bulk Review UI — A5 decided now to avoid a follow-up migration; NO anon).
-- Seeds the frozen bucket set (7 actionable + the `unrouted` sentinel = 8 keys)
-- for the VERIFIED (bucket × brand) pairs from
-- docs/routing-swarm-milestone-charter.md §2 ONLY (OQ2 — unverified pairs are
-- omitted so the agent's brand pick with no active row falls through to the
-- `unrouted` fallback, which is the correct behaviour).
--
-- Frozen bucket set (RESEARCH §Discretion 3, OQ1 default):
--   order_entry, verkoop, inspecties, storingen, opleidingen, sollicitaties,
--   algemeen (7 actionable) + unrouted (sentinel) = 8 destination_key values.
--
-- Verified target mailboxes (charter §2, 2026-06-16 — live departmental
-- mailboxes that actively send):
--   order_entry   : order@smeba.nl · order@fire-control.nl · order@berki.nl
--   verkoop       : verkoop@smeba.nl · verkoop@fire-control.nl · verkoop@berki.nl
--   inspecties    : planning@smeba.nl            (smeba only — charter §2)
--   storingen     : storing.smeba@smeba.nl       (smeba only — charter §2)
--   opleidingen   : opleidingen@fire-control.nl  (fire-control only — charter §2)
--   sollicitaties : hrm@smeba.nl                 (smeba only — charter §2)
--   algemeen      : algemeen@smeba.nl            (contactformulier landing —
--                   NOT in charter §2's verified-mailbox table; OPERATOR
--                   CONFIRMS this address at the Task 3 checkpoint before apply.)
--
-- The `unrouted` sentinel carries a NULL target_mailbox (no mailbox — human
-- triage). RLS triad copied verbatim from supabase/migrations/_template.sql;
-- seed idempotency mirrors 20260521_info_routing_swarm_smeba_minimum_viable.sql
-- (INSERT … ON CONFLICT … DO UPDATE … updated_at = now()). Rows are alphabetically
-- ordered (destination_key, then brand) for a stable codegen diff.
--
-- outlook_category = the ROUTE-08 ground-truth label name (the human-applied
-- Outlook category the shadow harness grades the verdict against). NULL for the
-- unrouted sentinel.
--
-- Hard-separation invariant honored: destinations live in THIS new table, never
-- in swarm_intents (Stage 3 intents) or swarm_noise_categories (Stage 1 noise).

BEGIN;

-- 1. Table — one row per (swarm_type, destination_key, brand).
CREATE TABLE IF NOT EXISTS public.routing_destinations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_type       text NOT NULL,
  destination_key  text NOT NULL,                 -- the bucket
  brand            text NOT NULL,                 -- 'smeba' | 'fire-control' | 'berki'
  target_mailbox   text,                          -- NULL allowed for the 'unrouted' sentinel
  outlook_category text,                          -- ROUTE-08 ground-truth label name
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (swarm_type, destination_key, brand)
);

-- 2. RLS — required (Pitfall 5; _template.sql triad).
ALTER TABLE public.routing_destinations ENABLE ROW LEVEL SECURITY;

-- 2a. Service role (backend coordinator step via createAdminClient) — full access.
DROP POLICY IF EXISTS routing_destinations_service_all ON public.routing_destinations;
CREATE POLICY routing_destinations_service_all
  ON public.routing_destinations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2b. Authenticated read — Phase 132 Bulk Review UI reads the registry (A5).
DROP POLICY IF EXISTS routing_destinations_auth_select ON public.routing_destinations;
CREATE POLICY routing_destinations_auth_select
  ON public.routing_destinations
  FOR SELECT
  TO authenticated
  USING (true);

-- 2c. anon — intentionally NO policy (no anon access to the routing registry).

-- 3. Frozen seed — verified (bucket × brand) pairs + the unrouted sentinel.
--    Alphabetical by (destination_key, brand) for stable codegen diff.
INSERT INTO public.routing_destinations
  (swarm_type, destination_key, brand, target_mailbox, outlook_category, active)
VALUES
  ('info-routing', 'algemeen',      'smeba',        'algemeen@smeba.nl',           'Algemeen',      true),
  ('info-routing', 'inspecties',    'smeba',        'planning@smeba.nl',           'Inspecties',    true),
  ('info-routing', 'opleidingen',   'fire-control', 'opleidingen@fire-control.nl', 'Opleidingen',   true),
  ('info-routing', 'order_entry',   'berki',        'order@berki.nl',              'Order-entry',   true),
  ('info-routing', 'order_entry',   'fire-control', 'order@fire-control.nl',       'Order-entry',   true),
  ('info-routing', 'order_entry',   'smeba',        'order@smeba.nl',              'Order-entry',   true),
  ('info-routing', 'sollicitaties', 'smeba',        'hrm@smeba.nl',                'Sollicitaties', true),
  ('info-routing', 'storingen',     'smeba',        'storing.smeba@smeba.nl',      'Storingen',     true),
  ('info-routing', 'unrouted',      'smeba',        NULL,                          NULL,            true),
  ('info-routing', 'verkoop',       'berki',        'verkoop@berki.nl',            'Verkoop',       true),
  ('info-routing', 'verkoop',       'fire-control', 'verkoop@fire-control.nl',     'Verkoop',       true),
  ('info-routing', 'verkoop',       'smeba',        'verkoop@smeba.nl',            'Verkoop',       true)
ON CONFLICT (swarm_type, destination_key, brand) DO UPDATE SET
  target_mailbox   = excluded.target_mailbox,
  outlook_category = excluded.outlook_category,
  active           = excluded.active,
  updated_at       = now();

COMMIT;
