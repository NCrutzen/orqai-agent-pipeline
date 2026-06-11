-- Phase 90 (RESL-16 items 1 + 2) — migrate debtor.labeling_settings off the
-- forbidden per-region DB name + reconcile the SS/SN mailbox-key mismatch.
--
-- NO DDL. Data migration on an EXISTING table — no new table, no new RLS policy,
-- no new function. RLS on debtor.labeling_settings is already enabled; this runs
-- as service_role at apply time. The inline DO block is an anonymous block (not a
-- persisted SECURITY DEFINER function), so no search_path pin is required.
--
-- ──────────────────────────────────────────────────────────────────────────────
-- ITEM 1 (A1 decision = sentinel 'nxt') — migrate all 6 rows off 'nxt_benelux_prod'.
--
-- All 6 rows carry nxt_database='nxt_benelux_prod', the per-region DB name the
-- NXT-ADDENDUM forbids for v8.2 (consolidated `nxt` DB + environment_id='BX'
-- filter supersedes per-region DBs). 90-RESEARCH Open Question 1 (RESOLVED):
-- migrate to the consolidated sentinel 'nxt' — a NON-NULL marker the live-`nxt`
-- long-tail fallback still reads. NEVER NULL: the worker short-circuits on a
-- falsy nxt_database (stage-2-customer-resolver.ts:112 `if (!nxtDatabase)`),
-- which would silently disable NXT lookups for all 6 mailboxes (threat T-90-08).
-- The materialized-table resolver path no longer reads this value (it scopes via
-- proc params environment_id='BX' + brand_id); this column is the legacy
-- per-signal / live-`nxt` fallback marker only.
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

UPDATE debtor.labeling_settings
   SET nxt_database = 'nxt',  -- consolidated sentinel; live-`nxt` fallback maps it to the BX-scoped DB. (A1)
       updated_at = now(),
       updated_by = 'migration:20260601e_labeling_settings_nxt_database'
 WHERE nxt_database = 'nxt_benelux_prod';

-- ──────────────────────────────────────────────────────────────────────────────
-- ITEM 2 (A2 / T-90-07 — live-key-driven reconcile, NOT a blind UPDATE).
--
-- 90-RESEARCH §RESL-16 item 2: the live SS ingest sender is reported as
-- `facturations@sicli-sud.be`, but the settings key is `debiteuren@sicli-sud.be`
-- → has_settings=false → null nxt_database → resolver short-circuits to
-- inheritance-only. This is LATENT today (Sicli has no zapier-debtor-ingest feed
-- yet; the 4 active mailboxes match correctly) but bites the moment SS/SN onboard.
--
-- A blind UPDATE keyed on a GUESSED source_mailbox string is a silent no-op if
-- the guess is wrong (threat T-90-07). Assumption A2 requires confirming the live
-- key BEFORE the UPDATE. We make the reconcile DATA-DRIVEN against the live
-- email_pipeline.emails feed at apply time, so the live apply IS the confirmation:
--
--   * For each Sicli entity (sicli-sud, sicli-noord), find the DISTINCT live
--     zapier-debtor-ingest sender mailbox(es) for that entity in the last 180d.
--   * If a live ingest key exists AND differs from the existing settings key,
--     migrate the settings row's source_mailbox to the live key (preserving the
--     row's NXT context: nxt_database, brand_id, entity, icontroller_company),
--     unless a row already exists for the live key (then leave both — no clobber).
--   * If no live Sicli zapier-debtor-ingest feed exists yet, this is a logged
--     no-op (the latent case) — NOTICE only, no row mutated.
--
-- This guarantees the reconcile only fires on a CONFIRMED live key and never
-- silently no-ops on a stale guess.
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r            RECORD;
  live_key     text;
  settings_key text;
  reconciled   int := 0;
  skipped      int := 0;
BEGIN
  FOR r IN
    SELECT entity, source_mailbox AS settings_key
      FROM debtor.labeling_settings
     WHERE entity IN ('sicli-sud', 'sicli-noord')
  LOOP
    settings_key := r.settings_key;

    -- Resolve the live zapier-debtor-ingest sender mailbox for this entity.
    -- Match on the entity's domain stem (sicli-sud / sicli-noord) so we pick up
    -- facturations@... or debiteuren@... regardless of the local-part.
    SELECT DISTINCT e.mailbox
      INTO live_key
      FROM email_pipeline.emails AS e
     WHERE e.source = 'zapier-debtor-ingest'
       AND e.mailbox ILIKE '%' || replace(r.entity, 'sicli-', 'sicli-') || '%'
       AND e.received_at > now() - interval '180 days'
     ORDER BY 1
     LIMIT 1;

    IF live_key IS NULL THEN
      RAISE NOTICE 'SS/SN reconcile: no live zapier-debtor-ingest feed for entity=% (settings key=%) — latent, no-op.',
        r.entity, settings_key;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    IF live_key = settings_key THEN
      RAISE NOTICE 'SS/SN reconcile: entity=% live key already matches settings key (%) — no change.',
        r.entity, settings_key;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    -- Live key differs. Only migrate if no row already exists for the live key
    -- (avoid clobbering a separately-seeded row).
    IF EXISTS (
      SELECT 1 FROM debtor.labeling_settings WHERE source_mailbox = live_key
    ) THEN
      RAISE NOTICE 'SS/SN reconcile: entity=% live key % already has its own settings row — leaving both intact.',
        r.entity, live_key;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    UPDATE debtor.labeling_settings
       SET source_mailbox = live_key,
           updated_at = now(),
           updated_by = 'migration:20260601e_labeling_settings_nxt_database'
     WHERE source_mailbox = settings_key
       AND entity = r.entity;

    RAISE NOTICE 'SS/SN reconcile: entity=% migrated settings key % -> live ingest key %.',
      r.entity, settings_key, live_key;
    reconciled := reconciled + 1;
  END LOOP;

  RAISE NOTICE 'SS/SN reconcile complete: % reconciled, % skipped (latent/matched/already-seeded).',
    reconciled, skipped;
END$$;

-- Sanity: zero rows may remain on the forbidden per-region DB name after item 1.
DO $$
DECLARE
  forbidden int;
BEGIN
  SELECT count(*) INTO forbidden
    FROM debtor.labeling_settings
   WHERE nxt_database = 'nxt_benelux_prod';
  IF forbidden > 0 THEN
    RAISE EXCEPTION 'labeling_settings still has % row(s) on nxt_benelux_prod after item-1 migration', forbidden;
  END IF;
END$$;

COMMIT;
