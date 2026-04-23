-- Migration: Klachten dashboard
-- Created: 2026-04-23
-- Purpose: Supabase tabel voor klachten-registratie.
-- Vulling via Zapier Supabase-integratie (Create Row action).
-- Uitgelezen door Vercel dashboard /klachten met M365 SSO guard.

-- Enable trigram matching voor klantnaam-zoeken (ILIKE met index-gebruik)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.klachten (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tijdstippen
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- wanneer klacht binnenkwam (filter-as)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- wanneer rij in DB kwam
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Klantgegevens
  klantnaam        TEXT        NOT NULL,
  klant_email      TEXT,
  klant_telefoon   TEXT,

  -- Classificatie
  categorie        TEXT        NOT NULL,               -- hoofd-filter in dashboard
  subcategorie     TEXT,
  prioriteit       TEXT        CHECK (prioriteit IN ('laag','normaal','hoog','urgent')) DEFAULT 'normaal',

  -- Inhoud
  onderwerp        TEXT,
  omschrijving     TEXT        NOT NULL,

  -- Workflow
  status           TEXT        NOT NULL DEFAULT 'nieuw'
                               CHECK (status IN ('nieuw','in_behandeling','opgelost','gesloten','heropend')),
  behandelaar      TEXT,                               -- wie pakt het op (email of naam)

  -- Herkomst
  bron             TEXT,                               -- 'email', 'formulier', 'telefoon', 'zapier', etc.
  bron_referentie  TEXT,                               -- externe ID (zapier record id, ticket id, etc.)

  -- Extra vrije opslag voor Zapier-velden die we nu nog niet kennen
  extra            JSONB       DEFAULT '{}'::jsonb
);

-- Indexen voor dashboard-queries
CREATE INDEX IF NOT EXISTS idx_klachten_received_at    ON public.klachten (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_klachten_categorie      ON public.klachten (categorie);
CREATE INDEX IF NOT EXISTS idx_klachten_status         ON public.klachten (status);
CREATE INDEX IF NOT EXISTS idx_klachten_klantnaam_trgm ON public.klachten USING gin (klantnaam gin_trgm_ops);

-- Idempotent upsert-sleutel voor Zapier (voorkomt dubbele rijen bij retries)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_klachten_bron_referentie
  ON public.klachten (bron_referentie)
  WHERE bron_referentie IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_klachten_updated_at ON public.klachten;
CREATE TRIGGER trg_klachten_updated_at
  BEFORE UPDATE ON public.klachten
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Row Level Security: alleen ingelogde gebruikers mogen lezen.
-- Writes gaan via service role (Zapier) — die bypasst RLS.
ALTER TABLE public.klachten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "klachten_select_authenticated" ON public.klachten;
CREATE POLICY "klachten_select_authenticated"
  ON public.klachten
  FOR SELECT
  TO authenticated
  USING (true);

-- Updates/deletes via dashboard later (fase 2); nu geen policy = geen access voor authenticated.
