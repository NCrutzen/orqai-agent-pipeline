-- Phase 5 (hardware-ticket-indienen): unified support_ticket_categories table,
-- support_tickets new columns (soort, photo_storage_urls), and hardware seed.
--
-- NOTE: software rows are managed via the existing ClickUp sync / manual insertion
-- and are out of scope for this migration. Seeding software rows here would create
-- a second source of truth out of sync with the live ClickUp sync.
--
-- NOTE: support_software_systems is NOT modified — the Project-1 backend pipeline
-- (Stage 2 entity-enrichment) uses it live for software-system-detection.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- (A) public.support_ticket_categories — unified dropdown source for the
--     submit-form. Replaces support_software_systems as the frontend dropdown
--     source while leaving that table intact for backend-pipeline use.
--     Columns: D-01 (soort), D-02 (label_en column), D-11 (NL/FR/EN i18n shape).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_ticket_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key    text        NOT NULL UNIQUE,       -- machine-key, e.g. 'printer', 'laptop'
  soort       text        NOT NULL CHECK (soort IN ('software', 'hardware')),
  label_nl    text        NOT NULL,              -- display name NL (primary)
  label_fr    text        NOT NULL DEFAULT '',   -- display name FR (D-11: i18n ready)
  label_en    text        NOT NULL DEFAULT '',   -- display name EN (D-02: dedicated column)
  enabled     boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.support_ticket_categories IS
  'Phase 5 (support-tickets) — unified dropdown source for ticket submission (software + hardware). '
  'Software rows managed via ClickUp sync or manual insertion; hardware rows seeded in this migration. '
  'Replaces support_software_systems as the frontend query source; the old table is kept for backend-pipeline use.';

-- ─────────────────────────────────────────────────────────────────────────────
-- (B) RLS + GRANTs — four-step block (CLAUDE.md §Supabase pattern)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.support_ticket_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_ticket_categories_service_all ON public.support_ticket_categories;
CREATE POLICY support_ticket_categories_service_all ON public.support_ticket_categories
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS support_ticket_categories_auth_select ON public.support_ticket_categories;
CREATE POLICY support_ticket_categories_auth_select ON public.support_ticket_categories
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.support_ticket_categories TO authenticated;
GRANT ALL    ON public.support_ticket_categories TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- (C) updated_at trigger (mirrors support_software_systems_set_updated_at
--     pattern from 20260526a_support_tickets_phase1.sql lines 263-270).
--     SET search_path = public, pg_catalog, pg_temp per CLAUDE.md to avoid
--     the function_search_path_mutable advisor flag.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_ticket_categories_set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_ticket_categories_updated_at ON public.support_ticket_categories;
CREATE TRIGGER support_ticket_categories_updated_at
  BEFORE UPDATE ON public.support_ticket_categories
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_categories_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- (D) Add columns to support_tickets — CONTRACT-03 (Phase 5, D-09/D-10)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS soort text NULL CHECK (soort IS NULL OR soort IN ('software', 'hardware'));

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS photo_storage_urls text[] NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- (E) Seed: nine hardware categories (idempotent — ON CONFLICT DO NOTHING)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.support_ticket_categories (type_key, soort, label_nl, label_fr, label_en)
VALUES
  ('laptop',       'hardware', 'Laptop',               'Ordinateur portable',    'Laptop'),
  ('desktop',      'hardware', 'Desktop',              'Ordinateur de bureau',   'Desktop'),
  ('tablet',       'hardware', 'Tablet',               'Tablette',               'Tablet'),
  ('mobile-phone', 'hardware', 'Mobiele telefoon',     'Téléphone portable',     'Mobile Phone'),
  ('router',       'hardware', 'Router/netwerk',       'Routeur/réseau',         'Router'),
  ('printer',      'hardware', 'Printer',              'Imprimante',             'Printer'),
  ('monitor',      'hardware', 'Monitor',              'Écran',                  'Monitor'),
  ('projector',    'hardware', 'Projector',            'Projecteur',             'Projector'),
  ('mic-speakers', 'hardware', 'Microfoon & speakers', 'Micro & haut-parleurs',  'Mic & Speakers')
ON CONFLICT (type_key) DO NOTHING;

COMMIT;
