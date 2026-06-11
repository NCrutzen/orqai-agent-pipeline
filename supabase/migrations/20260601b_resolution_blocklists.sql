-- Phase 90 (P0 resolver substrate) — RESL-04 / D-03.
--
-- The shared, swarm-scopable resolution_blocklists table: the own-entity /
-- freemail / platform / own-domain-as-customer strip lists the generic engine
-- applies (Plan 05) before any content match. Seeded with Lists 1-4 from
-- DESIGN-GUIDE §5 + the §0.7 corrections/deltas.
--
-- RLS-mandatory (CLAUDE.md / _template.sql 4-step): CREATE TABLE → ENABLE RLS →
-- service-role-only policy. Backend-only — NO anon/authenticated policy
-- (the lists are not UI-surfaced in P0). npm run check:supabase fails CI on
-- ERROR-level rls_disabled_in_public.
--
-- Normalization rules (RESEARCH §Registry Schema):
--   domain   — lowercased
--   postcode — space-stripped, uppercase
--   vat / kvk — as-stored (already canonical)
--   phone    — digits-only, compare last 8-9 (strip + / spaces / leading 0 kept as stored)
--
-- §0.10 A7/A8: value_kind='phone' is own-entity-STRIP only — phone is NEVER a
-- resolvable candidate kind. It appears here only under list_kind='own_entity'.
-- swarm_type='*' for all four shared lists (cross-swarm: the Order-Swarm reuses them).

BEGIN;

CREATE TABLE IF NOT EXISTS public.resolution_blocklists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_type  text NOT NULL DEFAULT '*',            -- '*' = cross-swarm shared; or a specific swarm
  list_kind   text NOT NULL CHECK (list_kind IN ('own_entity','freemail','platform','own_domain_as_customer')),
  value_kind  text NOT NULL CHECK (value_kind IN ('domain','postcode','vat','kvk','phone')),
  value_norm  text NOT NULL,                         -- normalized (see header)
  notes       text,
  source_ref  text,                                  -- e.g. 'DESIGN-GUIDE §5 List 1'
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resolution_blocklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resolution_blocklists_service_all ON public.resolution_blocklists;
CREATE POLICY resolution_blocklists_service_all
  ON public.resolution_blocklists FOR ALL TO service_role USING (true) WITH CHECK (true);
-- NO anon / authenticated policy: backend-only (CLAUDE.md). If a UI ever surfaces
-- these lists, add a FOR SELECT TO authenticated policy in a follow-up migration.

CREATE INDEX IF NOT EXISTS resolution_blocklists_lookup
  ON public.resolution_blocklists (swarm_type, list_kind, value_kind) WHERE enabled;

-- updated_at trigger. SET search_path pinned (CLAUDE.md: new functions pin
-- search_path; clears the function_search_path_mutable advisor WARN).
CREATE OR REPLACE FUNCTION public.resolution_blocklists_set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN new.updated_at = now(); RETURN new; END;
$$;

DROP TRIGGER IF EXISTS resolution_blocklists_updated_at ON public.resolution_blocklists;
CREATE TRIGGER resolution_blocklists_updated_at
  BEFORE UPDATE ON public.resolution_blocklists
  FOR EACH ROW EXECUTE FUNCTION public.resolution_blocklists_set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- Seed Lists 1-4 (DESIGN-GUIDE §5 + §0.7). Idempotent: delete the shared
-- seed rows first so a re-apply re-seeds cleanly (registries are refreshable
-- from NXT — smeba.nl count grew 590→925). Only the shared '*' rows seeded
-- by this migration are cleared; any swarm-specific or nxt-refresh rows are left.
-- ───────────────────────────────────────────────────────────────────────────
DELETE FROM public.resolution_blocklists
 WHERE swarm_type = '*'
   AND source_ref LIKE 'DESIGN-GUIDE %';

-- ── List 1 — own_entity (strip from body before matching) ──────────────────
-- Domains (10).
INSERT INTO public.resolution_blocklists (swarm_type, list_kind, value_kind, value_norm, source_ref) VALUES
  ('*','own_entity','domain','smeba.nl','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','domain','smeba-fire.be','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','domain','fire-control.nl','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','domain','firecontrol.nl','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','domain','berki.nl','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','domain','sicli.be','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','domain','sicli-noord.be','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','domain','sicli-zuid.be','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','domain','moyneroberts.com','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','domain','walkerfire.com','DESIGN-GUIDE §5 List 1');

-- Postcodes (9) — space-stripped, uppercase. Original §5 (8) + §0.7 SN/SS Brussels 1070.
INSERT INTO public.resolution_blocklists (swarm_type, list_kind, value_kind, value_norm, notes, source_ref) VALUES
  ('*','own_entity','postcode','6604LJ','Wijchen','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','postcode','6604BW','Wijchen','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','postcode','2491DJ','Den Haag FC','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','postcode','2497GE','Den Haag depot','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','postcode','2220','Heist','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','postcode','1180','BE Sicli','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','postcode','1160','BE Sicli','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','postcode','5000','Namur','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','postcode','1070','SN/SS Brussels (§0.7 correction)','DESIGN-GUIDE §0.7');

-- VAT (7).
INSERT INTO public.resolution_blocklists (swarm_type, list_kind, value_kind, value_norm, source_ref) VALUES
  ('*','own_entity','vat','NL807176850B01','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','vat','NL812415322B01','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','vat','NL005619841B01','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','vat','BE0891778210','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','vat','BE0450124144','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','vat','BE1017308878','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','vat','BE1017306504','DESIGN-GUIDE §5 List 1');

-- KvK (5).
INSERT INTO public.resolution_blocklists (swarm_type, list_kind, value_kind, value_norm, source_ref) VALUES
  ('*','own_entity','kvk','10019090','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','kvk','10039768','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','kvk','27098793','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','kvk','0891778210','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','kvk','0450124144','DESIGN-GUIDE §5 List 1');

-- Phones (8) — digits-only (strip + / spaces; compare last 8-9). §5 (6) + §0.7 02-8943620/02-8943625.
-- NB §0.10 A7/A8: phone is own-entity-STRIP only, NEVER a resolvable candidate kind.
INSERT INTO public.resolution_blocklists (swarm_type, list_kind, value_kind, value_norm, notes, source_ref) VALUES
  ('*','own_entity','phone','0243775458',NULL,'DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','phone','0243741425',NULL,'DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','phone','0246411066',NULL,'DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','phone','0703177822',NULL,'DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','phone','3215253316','+3215253316 normalized','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','phone','3228943620','+3228943620 normalized','DESIGN-GUIDE §5 List 1'),
  ('*','own_entity','phone','28943620','02-8943620 normalized (§0.7)','DESIGN-GUIDE §0.7'),
  ('*','own_entity','phone','28943625','02-8943625 normalized (§0.7)','DESIGN-GUIDE §0.7');

-- ── List 2 — freemail/ISP (never domain-match) ─────────────────────────────
-- Domains (33). gmx.* stored as gmx.com + gmx.net.
INSERT INTO public.resolution_blocklists (swarm_type, list_kind, value_kind, value_norm, source_ref) VALUES
  ('*','freemail','domain','gmail.com','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','hotmail.com','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','hotmail.be','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','hotmail.nl','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','hotmail.fr','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','outlook.com','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','outlook.be','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','outlook.nl','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','live.nl','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','live.be','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','live.com','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','icloud.com','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','yahoo.com','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','yahoo.fr','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','yahoo.nl','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','me.com','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','msn.com','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','skynet.be','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','telenet.be','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','proximus.be','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','belgacom.net','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','scarlet.be','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','ziggo.nl','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','kpnmail.nl','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','planet.nl','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','hetnet.nl','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','home.nl','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','xs4all.nl','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','casema.nl','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','chello.nl','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','online.be','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','aol.com','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','gmx.com','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','gmx.net','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','mail.com','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','protonmail.com','DESIGN-GUIDE §5 List 2'),
  ('*','freemail','domain','pandora.be','DESIGN-GUIDE §5 List 2');

-- ── List 3 — platform/intermediary (route to on-behalf-of, never domain-match) ─
-- Domains (21). 7 score-confirmed + 11 curated + 3 §0.7 BE-syndic adds.
-- Wildcards stored as base domain with notes='wildcard'.
INSERT INTO public.resolution_blocklists (swarm_type, list_kind, value_kind, value_norm, notes, source_ref) VALUES
  -- score-confirmed (distinct_customers ≥ 80)
  ('*','platform','domain','codabox.com','score-confirmed','DESIGN-GUIDE §5 List 3'),
  ('*','platform','domain','easysyndic.be','score-confirmed','DESIGN-GUIDE §5 List 3'),
  ('*','platform','domain','adksyndic.com','score-confirmed','DESIGN-GUIDE §5 List 3'),
  ('*','platform','domain','syncura.be','score-confirmed','DESIGN-GUIDE §5 List 3'),
  ('*','platform','domain','thekeys.be','score-confirmed','DESIGN-GUIDE §5 List 3'),
  ('*','platform','domain','syndicsolutions.be','score-confirmed','DESIGN-GUIDE §5 List 3'),
  ('*','platform','domain','vvefacturen.nl','score-confirmed','DESIGN-GUIDE §5 List 3'),
  -- curated AP/intermediary (low NXT count but known intermediaries)
  ('*','platform','domain','ariba.com','curated','DESIGN-GUIDE §5 List 3'),
  ('*','platform','domain','eusmtp.ariba.com','curated; *.ariba.com wildcard','DESIGN-GUIDE §5 List 3'),
  ('*','platform','domain','basware.com','curated; *.basware.com wildcard','DESIGN-GUIDE §5 List 3'),
  ('*','platform','domain','spendlab.com','curated','DESIGN-GUIDE §5 List 3'),
  ('*','platform','domain','candex.com','curated','DESIGN-GUIDE §5 List 3'),
  ('*','platform','domain','coupahost.com','curated; *.coupahost.com wildcard','DESIGN-GUIDE §5 List 3'),
  ('*','platform','domain','factuurportal.eu','curated','DESIGN-GUIDE §5 List 3'),
  ('*','platform','domain','tblox.com','curated','DESIGN-GUIDE §5 List 3'),
  ('*','platform','domain','onguard.com','curated','DESIGN-GUIDE §5 List 3'),
  -- §0.7 BE-syndic adds
  ('*','platform','domain','couet.be','BE syndic (§0.7)','DESIGN-GUIDE §0.7'),
  ('*','platform','domain','trevi.be','BE syndic (§0.7)','DESIGN-GUIDE §0.7'),
  ('*','platform','domain','op.be','BE syndic (§0.7)','DESIGN-GUIDE §0.7');

-- ── List 4 — own-brand-domain-as-customer (never return a customer because its
-- stored email is own-brand). Exactly 8 domains (§5). §0.7 notes sicli-sud.be
-- as an additional own-domain (246 customers) but it is List-1 own-entity scope;
-- List 4's canonical set is the 8 §5 domains (RESL-04 test asserts exactly 8).
INSERT INTO public.resolution_blocklists (swarm_type, list_kind, value_kind, value_norm, notes, source_ref) VALUES
  ('*','own_domain_as_customer','domain','smeba.nl','925 distinct customers','DESIGN-GUIDE §5 List 4'),
  ('*','own_domain_as_customer','domain','smeba-fire.be','44','DESIGN-GUIDE §5 List 4'),
  ('*','own_domain_as_customer','domain','sicli-noord.be','23','DESIGN-GUIDE §5 List 4'),
  ('*','own_domain_as_customer','domain','sicli.be','21','DESIGN-GUIDE §5 List 4'),
  ('*','own_domain_as_customer','domain','berki.nl','14','DESIGN-GUIDE §5 List 4'),
  ('*','own_domain_as_customer','domain','fire-control.nl','11','DESIGN-GUIDE §5 List 4'),
  ('*','own_domain_as_customer','domain','moyneroberts.com','5','DESIGN-GUIDE §5 List 4'),
  ('*','own_domain_as_customer','domain','sicli-zuid.be','5','DESIGN-GUIDE §5 List 4');

COMMIT;
