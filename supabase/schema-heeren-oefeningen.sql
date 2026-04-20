-- =============================================
-- Heeren Oefeningen Facturatie — Staging Tabel
-- =============================================
-- Execute this in the Supabase SQL Editor.
--
-- Doel: verwijderde oefening-regels opslaan zodat ze
-- aan het einde van de maand opnieuw gefactureerd kunnen worden
-- via een nieuwe NXT order.

CREATE TABLE heeren_oefeningen_staging (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Afkomstig uit Zapier SQL query
  billing_order_code    TEXT NOT NULL,         -- bijv. "370147" — NXT order referentie
  billing_order_id      TEXT NOT NULL,         -- interne billing order ID
  billing_order_line_id TEXT NOT NULL UNIQUE,  -- interne line ID (voorkomt dubbele verwerking)
  billing_item_id       TEXT NOT NULL,         -- artikel-ID voor nieuwe order (Fase 2)
  course_id             TEXT NOT NULL,         -- cursus-ID voor referentie

  -- Bewijs van verwijdering (screenshots)
  screenshot_before     TEXT,                  -- bestandspad of storage URL
  screenshot_after      TEXT,                  -- bestandspad of storage URL

  -- Lifecycle
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processed', 'failed')),
  processed_at          TIMESTAMPTZ,           -- ingevuld bij Fase 2 uitvoering
  new_billing_order_code TEXT,                 -- nieuwe order aangemaakt in Fase 2

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- Index voor Fase 2 query: alle pending records ophalen
CREATE INDEX idx_heeren_staging_status ON heeren_oefeningen_staging(status);

-- Index voor idempotency check op billing_order_line_id (al UNIQUE, maar explicit)
CREATE INDEX idx_heeren_staging_line_id ON heeren_oefeningen_staging(billing_order_line_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_heeren_staging_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER heeren_staging_updated_at
  BEFORE UPDATE ON heeren_oefeningen_staging
  FOR EACH ROW EXECUTE FUNCTION update_heeren_staging_updated_at();

-- RLS: alleen service role heeft toegang (automation schrijft server-side)
ALTER TABLE heeren_oefeningen_staging ENABLE ROW LEVEL SECURITY;
