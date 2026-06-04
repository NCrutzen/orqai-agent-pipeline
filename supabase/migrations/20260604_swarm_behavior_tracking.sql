-- Phase 112.5-02. Swarm-agnostic behavior-tracking datalaag voor de passieve
-- feedback-loop (Outlook delta-sync -> review-signals). Vier nieuwe tabellen +
-- een registry-driven enablement-kolom op public.swarms.
--
-- De engine is structureel swarm-generiek (registry-driven, 0 per-swarm
-- branches -- docs/agentic-pipeline/README.md). Enablement is DATA, geen
-- hardcoded swarm-lijst: behavior_tracking_config.enabled stuurt of een swarm
-- meedraait. Deze fase seedt ALLEEN sales-email op enabled; debtor + de rest
-- blijven default {"enabled": false}.
--
-- Anti-pattern (RESEARCH/PATTERNS): deze signalen gaan NIET naar de live
-- pipeline-event-tabel -- die heeft een partial unique index op
-- (email_id, swarm_type, stage) WHERE override IS NULL waarmee de signalen
-- zouden botsen. Daarom eigen, los staande tabellen hieronder.
--
-- RLS verplicht (CLAUDE.md): elke nieuwe tabel zet row level security aan +
-- een service-role FOR ALL policy. Geen anon/authenticated/public (geen UI
-- deze fase). Geen definer-rights views/functies. Orchestrator past deze
-- migration toe via Supabase MCP apply_migration (SUPABASE_ACCESS_TOKEN
-- verlopen, conventie Phases 110-112); verificatie = get_advisors 0-ERROR.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 0. Registry-enablement op public.swarms (geen aparte tabel — engine is
--    registry-driven). public.swarms heeft al RLS uit 20260429b_swarm_registry,
--    dus de ALTER vereist GEEN nieuw RLS-statement.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.swarms
  ADD COLUMN IF NOT EXISTS behavior_tracking_config jsonb NOT NULL
  DEFAULT jsonb_build_object('enabled', false);

COMMENT ON COLUMN public.swarms.behavior_tracking_config IS
  'Behavior-tracking enablement (Phase 112.5). Shape = { enabled: boolean, mailbox?: string, weights?: jsonb }. Default disabled voor alle swarms; enablement is registry-driven data, geen hardcoded swarm-lijst.';

-- Seed ALLEEN sales-email. Debtor + andere swarms blijven {"enabled": false}.
-- De optionele weights worden later geseed bij het Plan 01 operator-besluit
-- (default-weging zit als const in signal-derive).
UPDATE public.swarms
  SET behavior_tracking_config = jsonb_build_object('enabled', true, 'mailbox', 'verkoop@smeba.nl')
  WHERE swarm_type = 'sales-email';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. public.outlook_delta_tokens — folder-scoped Graph delta-link (één rij per
--    folder, folder_id PK).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outlook_delta_tokens (
  folder_id     text PRIMARY KEY,
  mailbox       text NOT NULL,
  bucket        text,
  delta_link    text,
  bootstrapped  boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outlook_delta_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlook_delta_tokens_service_all ON public.outlook_delta_tokens;
CREATE POLICY outlook_delta_tokens_service_all
  ON public.outlook_delta_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. public.outlook_folder_map — registry folder-id -> semantische bucket.
--    Nieuwe afgehandeld-jaar-folder = INSERT-rij, geen code-change.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outlook_folder_map (
  folder_id     text PRIMARY KEY,
  mailbox       text NOT NULL,
  display_name  text,
  bucket        text NOT NULL,
  tracked       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outlook_folder_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlook_folder_map_service_all ON public.outlook_folder_map;
CREATE POLICY outlook_folder_map_service_all
  ON public.outlook_folder_map
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. public.swarm_email_transitions — append-only raw folder/state-transities.
--    swarm_type + mailbox dragen zodat meerdere swarms dezelfde engine delen.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.swarm_email_transitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_type    text NOT NULL,
  mailbox       text NOT NULL,
  email_id      uuid,
  immutable_id  text NOT NULL,
  kind          text NOT NULL,
  from_bucket   text,
  to_bucket     text,
  dedupe_key    text NOT NULL,
  observed_at   timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- dedupe_key-compositie = `${swarm_type}|${immutable_id}|${kind}|${observedTickIso}`
-- (door de worker gemint). swarm_type IN de key => twee swarms kunnen dezelfde
-- message-id observeren zonder dedupe-collisie (T-112.5-14). Load-bearing voor
-- de 23505 no-op in de delta-worker.
CREATE UNIQUE INDEX IF NOT EXISTS swarm_email_transitions_dedupe
  ON public.swarm_email_transitions (dedupe_key);

CREATE INDEX IF NOT EXISTS swarm_email_transitions_swarm_created
  ON public.swarm_email_transitions (swarm_type, created_at);

ALTER TABLE public.swarm_email_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS swarm_email_transitions_service_all ON public.swarm_email_transitions;
CREATE POLICY swarm_email_transitions_service_all
  ON public.swarm_email_transitions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. public.swarm_review_signals — afgeleid verdict per email_id.
--    swarm_type + mailbox dragen (zelfde multi-swarm-reden als transitions).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.swarm_review_signals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_type      text NOT NULL,
  mailbox         text NOT NULL,
  email_id        uuid,
  category_key    text,
  verdict         text NOT NULL,
  transition_kind text,
  dedupe_key      text NOT NULL,
  observed_at     timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- dedupe_key-compositie = `${swarm_type}|${email_id}|${verdict}|${observedTickIso}`
-- (door de worker gemint). swarm_type IN de key => per-swarm isolatie, geen
-- cross-swarm dedupe-collisie (T-112.5-14).
CREATE UNIQUE INDEX IF NOT EXISTS swarm_review_signals_dedupe
  ON public.swarm_review_signals (dedupe_key);

CREATE INDEX IF NOT EXISTS swarm_review_signals_swarm_created
  ON public.swarm_review_signals (swarm_type, created_at);

ALTER TABLE public.swarm_review_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS swarm_review_signals_service_all ON public.swarm_review_signals;
CREATE POLICY swarm_review_signals_service_all
  ON public.swarm_review_signals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
