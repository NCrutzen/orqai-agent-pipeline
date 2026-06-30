-- Info-routing routing_destinations corrected to the REAL staff-forward map.
--
-- Source of truth: a diagnostic over 764 real info@ Sent-Items forwards (180d,
-- 2026-06-24) showed only 46% landed on a configured target_mailbox. The
-- forward-Wilson backfill therefore could only grade `verkoop`/`opleidingen`
-- (config matched reality) and scored everything else 0% — a CONFIG gap, not an
-- AI/code bug. Memory: routing-destinations-targets-dont-match-real-forwards.
--
-- TIER 1 — fix an existing bucket's address to the real one:
--   inspecties/smeba: planning@smeba.nl (0 forwards) → groep-planning@smeba.nl (112).
--   + add inspecties/fire-control → planning@fire-control.nl (32).
-- TIER 2 — model the unmodelled high-volume departments staff forward to
-- (operator-confirmed 2026-06-25): administratie, crediteuren, debiteuren,
-- facilitair, hr. brand follows the address domain (@smeba.nl=smeba,
-- @fire-control.nl=fire-control).
--
-- After apply: `npm run codegen` regenerates routing-destinations.generated.ts
-- (new keys feed the Zod enum + the Orq agent json_schema), then re-deploy the
-- info-routing-coordinator agent (manage-info-routing-coordinator.ts) with the
-- new <closed_list>. RLS already enabled on public.routing_destinations.
--
-- MANDATORY after adding/renaming any routing bucket: re-run the master-category
-- seeder so the new `AI: held → <bucket>` / `AI: routed → <bucket>` names render
-- in the non-grey preset5 colour instead of grey:
--   cd web && npx tsx scripts/ensure-info-routing-categories.ts
-- It is idempotent (GET-before-POST) and sources buckets live from this registry.
-- SKIPPING THIS leaves new buckets' chips grey in Outlook — debug session
-- .planning/debug/resolved/ai-held-label-color-gray-blue.md documents that drift.

BEGIN;

-- TIER 1 — inspecties real addresses
UPDATE public.routing_destinations
  SET target_mailbox = 'groep-planning@smeba.nl', updated_at = now()
  WHERE swarm_type = 'info-routing' AND destination_key = 'inspecties' AND brand = 'smeba';

INSERT INTO public.routing_destinations (swarm_type, destination_key, brand, target_mailbox, outlook_category, active)
VALUES
  ('info-routing', 'inspecties',    'fire-control', 'planning@fire-control.nl',     'Inspecties',    true),
  -- TIER 2 — new department buckets
  ('info-routing', 'administratie', 'fire-control', 'administratie@fire-control.nl','Administratie', true),
  ('info-routing', 'crediteuren',   'smeba',        'crediteuren@smeba.nl',         'Crediteuren',   true),
  ('info-routing', 'crediteuren',   'fire-control', 'facturen@fire-control.nl',     'Crediteuren',   true),
  ('info-routing', 'debiteuren',    'smeba',        'debiteuren@smeba.nl',          'Debiteuren',    true),
  ('info-routing', 'facilitair',    'fire-control', 'facilitair@fire-control.nl',   'Facilitair',    true),
  ('info-routing', 'hr',            'fire-control', 'hr@fire-control.nl',           'HR',            true)
ON CONFLICT DO NOTHING;

COMMIT;
