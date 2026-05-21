-- Hotfix: add the `unknown` row to info-routing's noise registry.
--
-- Bug discovered 2026-05-21 ~10:14 UTC: a real business email arrived at
-- info@smeba.nl ("VERHUIZING - wijzigen correspondentie-/showroomadres"
-- from studio@vantwout.nl). Stage 1 regex didn't match → LLM 2nd-pass
-- returned decision='unknown' (= real business, not noise). The
-- classifier-verdict-worker then tried to look up the (info-routing,
-- 'unknown') row in swarm_noise_categories to determine the dispatch
-- action — and failed because that row didn't exist:
--
--   error: "no swarm_noise_categories row for (info-routing, unknown)"
--
-- Net effect before this fix: EVERY non-spam business email to
-- info@smeba.nl errors. Only [SPAM] prefixed mails succeed (they
-- short-circuit on regex and never reach the LLM path).
--
-- Fix mirrors sales-email's pattern (`action='manual_review'`, no
-- swarm_dispatch, no outlook_label). The 'unknown' verdict surfaces in
-- Bulk Review for operator triage. debtor-email's `unknown` dispatches
-- to a Stage 2 label-resolver — we don't have that yet for info-routing
-- (proposal's full-launch Phase 999.9 territory).
--
-- Applied live to production via Management API before this migration
-- file was committed (hotfix sequencing). This file is the durable record.

BEGIN;

INSERT INTO public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order, enabled)
VALUES
  ('info-routing', 'unknown', 'Unknown (manual review)', NULL, 'manual_review', NULL, 60, true)
ON CONFLICT (swarm_type, category_key) DO UPDATE SET
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  enabled        = excluded.enabled,
  updated_at     = now();

COMMIT;
