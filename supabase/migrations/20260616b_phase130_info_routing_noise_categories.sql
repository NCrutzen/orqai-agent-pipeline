-- Phase 130 NOISE-01 — six info-routing Stage-1 noise categories.
--
-- Stage 1 only (noise filter). Hard-separation invariant: NO row added to the
-- Stage-3 intent registry. Enforced by
-- web/__tests__/static-checks/swarm-hard-separation.test.ts. A (swarm_type,
-- key) tuple exists in EXACTLY ONE of the Stage-1 noise registry or the
-- Stage-3 intent registry — never both.
--
-- These six keys close the ~50% latent-noise leak in the info-routing
-- "unknown" pool (CONTEXT, 30d 120-row sample). The info-routing swarm has NO
-- Pass 1 regex module wired today (it falls through to debtor's classify via
-- the shared module); the Pass 2 LLM (`stage-1-category-classifier`) reads the
-- enabled swarm_noise_categories rows at call time and picks the matching
-- `category_key` from the call-time closed list. This migration alone exposes
-- the keys to the LLM — NO Studio json_schema edit, NO codegen needed (the
-- agent's category_key output is type:string, codegen reads the Stage-3
-- intent registry / entity_brand / tenant_domains only).
--
-- survey_feedback_invite is the REQUIREMENTS NOISE-01 6th class (RESEARCH A4,
-- low-cost shadow candidate) added alongside the 5 CONTEXT-locked classes.
--
-- NOT seeded: a blanket category for the info@smeba.nl-self "Inzending
-- contactformulier" self-submissions — those are MIXED (real submissions +
-- bot-gibberish) and are a discrimination case, not a noise class (CONTEXT).
--
-- All six rows are swarm_type='info-routing' ONLY (swarm-isolated; NOT mirrored
-- to debtor-email/sales-email). All share action='categorize_archive',
-- swarm_dispatch=null. display_order >= 70 places them after the existing noise
-- families (auto_reply ~10-20, payment_admittance ~25-30, ooo ~40-50, spam).
--
-- Idempotent ON CONFLICT keeps re-runs safe (mirrors
-- 20260520_phase84_noise_categories.sql verbatim).

BEGIN;

-- 1. Automated security / system reports (securitas noreply, antispamcloud
--    SpamExperts digests, fleet/portal reports). RESEARCH: securitas 26/mo is
--    the single highest-volume, crispest signal — good first shadow rule.
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('info-routing', 'automated_security_report', 'Automated Security / System Report', 'Spam', 'categorize_archive', null, 70)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

-- 2. Cold sales / SEO / outreach spam ("Rank Higher", "App Idea", "Web
--    Reparatie", "Price List", website-design proposals; taiwantrade/linkedin
--    outreach). Fuzzy language → LLM Pass-2 class.
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('info-routing', 'cold_sales_outreach', 'Cold Sales / SEO Outreach', 'Spam', 'categorize_archive', null, 71)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

-- 3. Marketing newsletters (lidl, logboekenonline, rabobank alerts,
--    restaurant/event blasts, trade newsletters).
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('info-routing', 'marketing_newsletter', 'Marketing Newsletter', 'Spam', 'categorize_archive', null, 72)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

-- 4. Auto-dealer / vehicle spam (impexcompany.nl/.be "beste bod voor uw auto"
--    16/mo, BMW/veiling/baslease/basworld).
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('info-routing', 'auto_dealer_spam', 'Auto-Dealer / Vehicle Spam', 'Spam', 'categorize_archive', null, 73)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

-- 5. Unsolicited job applications (firemail.de "Initiativbewerbung", generic
--    "Vision Your Application").
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('info-routing', 'unsolicited_job_application', 'Unsolicited Job Application', 'Spam', 'categorize_archive', null, 74)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

-- 6. Survey / feedback invites (REQUIREMENTS NOISE-01 6th class; RESEARCH A4
--    low-cost shadow candidate).
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('info-routing', 'survey_feedback_invite', 'Survey / Feedback Invite', 'Spam', 'categorize_archive', null, 75)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

COMMIT;
