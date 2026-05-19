-- Voeg order_reference (Kostenplaats) toe aan heeren_oefeningen_staging.
-- Bron: Companies.OrderReference uit NXT, via Zapier SQL-step.
-- Wordt door Fase 2 in de NXT draft order op het Kostenplaats-veld gezet.

ALTER TABLE public.heeren_oefeningen_staging
  ADD COLUMN IF NOT EXISTS order_reference text;

COMMENT ON COLUMN public.heeren_oefeningen_staging.order_reference IS
  'Kostenplaats van de Companies-row (NXT Companies.OrderReference). Wordt in Fase 2 in het NXT-orderformulier ingevuld.';
