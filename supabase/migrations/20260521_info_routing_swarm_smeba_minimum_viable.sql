-- Phase 999.9 (MVP) — info@smeba.nl info-routing swarm onboarding,
-- minimum-viable scope = Stage 0 + Stage 1 + Outlook archive only.
--
-- Scope contract (per docs/designs/2026-05-19-smeba-info-routing-swarm-proposal.md):
--   IN:  swarms row + tenant_domains + 5 SHARED noise category rows
--        (spam, payment_admittance, auto_reply, ooo_temporary, ooo_permanent).
--   OUT: Stage 2 entity resolution (no iController for info@), Stage 3 router,
--        Stage 4 forward-handlers, generic_noreply_notification (needs Phase 78
--        codegen for cross-swarm key promotion). Sales-email parity rows are NOT
--        added here — info-routing only.
--
-- Why we can ship today (despite proposal saying "wait for v8.1 close"):
--   * Phase 84 (tenant_domains column + own-domain loopback) — SHIPPED 2026-05-20.
--   * Phase 64 (Stage 0 safety + budgets) — shipped v8.0; classifier-screen-worker
--     is REQ-6 registry-driven (verified `grep "REQ-6: ZERO \`swarm_type === 'X'\`"`
--     in web/lib/inngest/functions/classifier-screen-worker.ts).
--   * We're NOT adding swarm_intents (no Stage 3 today) and NOT adding any
--     NEW noise category_keys → no Phase 78 codegen blocker.
--
-- Idempotent ON CONFLICT pattern mirrors 20260520_phase84_noise_categories.sql.
-- Hard-separation invariant honored: zero swarm_intents rows in this migration.

BEGIN;

-- ---------- 1. swarms row for info-routing -----------------------------------

insert into public.swarms (
  swarm_type,
  display_name,
  description,
  review_route,
  source_table,
  enabled,
  ui_config,
  stage1_regex_module,
  stage2_entity_resolver,
  stage3_coordinator_agent_key,
  canonical_context_shape,
  entity_brand,
  tenant_domains,
  side_effects
)
values (
  'info-routing',
  'Info Routing — Smeba',
  'info@smeba.nl receive-only broadcast inbox. Stage 0 + Stage 1 noise filter + Outlook archive only. No Stage 2/3/4 in MVP scope; router agent deferred to Phase 999.9 full launch after v8.1 closes.',
  '/automations/info-routing/review',
  'automation_runs',
  true,
  jsonb_build_object(
    'tree_levels', jsonb_build_array('topic','mailbox_id'),
    'row_columns', jsonb_build_array(),
    'drawer_fields', jsonb_build_array(),
    'default_sort', 'created_at desc'
  ),
  -- Stage 1 reuses debtor-email regex module (56% transfer per Spike 003).
  -- Predicates fire by category_key match against this swarm's
  -- swarm_noise_categories rows (registry-driven).
  '@/lib/debtor-email/classify',
  -- No Stage 2 entity resolution for info-routing — broadcast inbox is not
  -- customer-bound. classifier-verdict-worker short-circuits when null
  -- (verified registry pattern).
  null,
  -- No Stage 3 coordinator agent today. The proposal's "placeholder router"
  -- ships in a follow-up phase once v8.1 closes.
  null,
  jsonb_build_object(
    'version', '2026-05-21.info-routing.v1',
    'fields', jsonb_build_object(
      'language',     jsonb_build_object('type','string','enum', jsonb_build_array('nl','en','de','fr'), 'default','nl'),
      'entity_brand', jsonb_build_object('type','string','default','smeba')
    )
  ),
  -- Single brand for now (only info@smeba.nl in scope). Adding info@<other-brand>
  -- later is one row update.
  jsonb_build_array('smeba'),
  -- 7 own-domains per spike 002 — same set used by debtor-email's
  -- own_outbound_invoice_loopback rule. Alphabetical for stable codegen diff.
  '["berki.nl","fire-control.nl","moyneroberts.com","sicli-noord.be","sicli-sud.be","smeba-fire.be","smeba.nl"]'::jsonb,
  -- No side effects beyond the registry-driven categorize_archive on
  -- Stage 1 noise verdicts. The Phase 56.7 automation_run_insert side-effect
  -- on debtor-email's swarms row triggers icontroller cleanup — info-routing
  -- has no iController side-effect, just Outlook archive via Stage 1.
  '[]'::jsonb
)
on conflict (swarm_type) do update set
  display_name                = excluded.display_name,
  description                 = excluded.description,
  review_route                = excluded.review_route,
  ui_config                   = excluded.ui_config,
  stage1_regex_module         = excluded.stage1_regex_module,
  stage2_entity_resolver      = excluded.stage2_entity_resolver,
  stage3_coordinator_agent_key = excluded.stage3_coordinator_agent_key,
  canonical_context_shape     = excluded.canonical_context_shape,
  entity_brand                = excluded.entity_brand,
  tenant_domains              = excluded.tenant_domains,
  side_effects                = excluded.side_effects,
  updated_at                  = now();

-- ---------- 2. swarm_noise_categories rows (5 SHARED keys) -------------------
-- Reusing debtor-email's category_key vocabulary verbatim — predicates fire
-- via existing regex module. Per proposal spike 003 these 5 rules cover the
-- bulk of info@smeba.nl noise (the proposal's "60% noise coverage MVP"
-- without generic_noreply_notification).
--
-- Phase 84's coupa/iss/etc. AP-automation rules are intentionally NOT
-- replicated here — those are debtor-email-specific patterns. The next
-- info-routing-specific noise rules (generic_noreply_notification +
-- own_domain_loopback for the 17.9% Smeba internal-CC volume) ship after
-- Phase 78 codegen lands.

-- 2.1 Spam — already exists for debtor-email + sales-email; add info-routing.
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('info-routing', 'spam', 'Spam', 'Spam', 'categorize_archive', null, 10)
on conflict (swarm_type, category_key) do update set
  display_label = excluded.display_label,
  outlook_label = excluded.outlook_label,
  action        = excluded.action,
  display_order = excluded.display_order,
  updated_at    = now();

-- 2.2 Payment admittance — finance-shaped noise (1.2% of info@ corpus).
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('info-routing', 'payment_admittance', 'Payment Admittance', 'Payment Admittance', 'categorize_archive', null, 25)
on conflict (swarm_type, category_key) do update set
  display_label = excluded.display_label,
  outlook_label = excluded.outlook_label,
  action        = excluded.action,
  display_order = excluded.display_order,
  updated_at    = now();

-- 2.3 Auto-reply — generic auto-acknowledgement noise.
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('info-routing', 'auto_reply', 'Auto-Reply', 'Auto-Reply', 'categorize_archive', null, 30)
on conflict (swarm_type, category_key) do update set
  display_label = excluded.display_label,
  outlook_label = excluded.outlook_label,
  action        = excluded.action,
  display_order = excluded.display_order,
  updated_at    = now();

-- 2.4 OoO temporary.
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('info-routing', 'ooo_temporary', 'OoO — Temporary', 'OoO — Temporary', 'categorize_archive', null, 40)
on conflict (swarm_type, category_key) do update set
  display_label = excluded.display_label,
  outlook_label = excluded.outlook_label,
  action        = excluded.action,
  display_order = excluded.display_order,
  updated_at    = now();

-- 2.5 OoO permanent.
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('info-routing', 'ooo_permanent', 'OoO — Permanent', 'OoO — Permanent', 'categorize_archive', null, 50)
on conflict (swarm_type, category_key) do update set
  display_label = excluded.display_label,
  outlook_label = excluded.outlook_label,
  action        = excluded.action,
  display_order = excluded.display_order,
  updated_at    = now();

COMMIT;
