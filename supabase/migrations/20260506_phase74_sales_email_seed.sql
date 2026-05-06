-- Phase 74 — Sales-email registry seed (D-17, D-18).
--
-- Adds the swarms row + 5 swarm_categories rows that the swarm-agnostic
-- Stage 1 LLM classifier worker (Plan 04) reads at call time. Per D-03,
-- stage1_regex_module=null drives the LLM-only path for sales-email.
-- Per D-18, no Stage 2/3 chain yet — stage2_entity_resolver, stage3
-- coordinator, side_effects, canonical_context_shape all null/empty.
--
-- entity_brand defaults to '[]'::jsonb per RESEARCH Open Question 5
-- (operator did not override; sales-email has no Stage 3 brand consumer).

-- 1. swarms row
insert into public.swarms (
  swarm_type, display_name, description, review_route, source_table, enabled,
  ui_config, side_effects,
  stage1_regex_module, stage2_entity_resolver, stage3_coordinator_agent_key,
  canonical_context_shape, entity_brand
) values (
  'sales-email',
  'Sales Email',
  'Sales-email Stage 0->1 classification (Phase 74). LLM-only Stage 1 (no regex module).',
  '/automations/[swarm]/review',
  'automation_runs',
  true,
  jsonb_build_object(
    'tree_levels',  jsonb_build_array('topic','entity','mailbox_id'),
    'row_columns',  jsonb_build_array(
      jsonb_build_object('key','received_at','label','Received','width',140),
      jsonb_build_object('key','sender',     'label','Sender',  'width',220),
      jsonb_build_object('key','subject',    'label','Subject', 'width',420),
      jsonb_build_object('key','rule',       'label','Rule',    'width',180)
    ),
    'drawer_fields', jsonb_build_array('subject','sender','received_at','rule','predicted_category','body_html'),
    'default_sort',  'created_at desc'
  ),
  '[]'::jsonb,                          -- side_effects: none yet (D-18)
  null,                                  -- stage1_regex_module: D-03 null = LLM-only
  null,                                  -- stage2_entity_resolver: none (D-18)
  null,                                  -- stage3_coordinator_agent_key: none (D-18)
  null,                                  -- canonical_context_shape: none (D-18)
  '[]'::jsonb                           -- entity_brand: cross-brand default (operator confirmed 2026-05-06)
)
on conflict (swarm_type) do update set
  description = excluded.description,
  ui_config   = excluded.ui_config,
  updated_at  = now();

-- 2. swarm_categories rows (D-17 — exactly 5 rows)
insert into public.swarm_categories (
  swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order
) values
  ('sales-email','auto_reply',          'Auto-reply',              'Auto-Reply',          'categorize_archive', null, 10),
  ('sales-email','ooo_temporary',       'OOO (temporary)',         'OoO - Temporary',     'categorize_archive', null, 20),
  ('sales-email','ooo_permanent',       'OOO (permanent)',         'OoO - Permanent',     'categorize_archive', null, 30),
  ('sales-email','payment_admittance',  'Payment Admittance',      'Payment Admittance',  'categorize_archive', null, 40),
  ('sales-email','unknown',             'Unknown (manual review)', null,                  'manual_review',      null, 50)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();
