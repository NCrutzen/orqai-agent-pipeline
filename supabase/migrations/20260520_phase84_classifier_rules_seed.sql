-- Phase 84 D-01 / D-05 — seed 16 candidate rows in public.classifier_rules
-- (8 keys × 2 swarms). All rows land with status='candidate' and zero
-- counters; the Wilson-CI cron (classifier-promotion-cron) or operator
-- corpus-evidence flip is the promotion gate per D-05.
--
-- kind asymmetry per swarm (per docs/agentic-pipeline/stage-1-regex.md and
-- RESEARCH Pitfall 5):
--   - debtor-email rows use kind='regex' — the 7 in-classifier matchers
--     wired in Wave 2 live in web/lib/debtor-email/classify.ts; the 8th
--     loopback rule lives in classifier-screen-worker.ts but still emits a
--     `rule_key` matching its category_key, so telemetry rolls up uniformly.
--   - sales-email rows use kind='agent_intent' — sales-email has no Pass 1
--     regex module; the Pass 2 LLM (`stage-1-category-classifier`) picks
--     the category_key from the call-time closed list of enabled
--     swarm_noise_categories rows.
--
-- Hard separation: this migration writes only to classifier_rules (Stage 1
-- promotion-gate telemetry). NO swarm_intents row is added. Static-check at
-- web/__tests__/static-checks/swarm-hard-separation.test.ts enforces.
--
-- Idempotent: `on conflict (swarm_type, rule_key) do nothing` keeps re-runs
-- safe and preserves any operator-modified status (e.g. a hand-promoted
-- 'promoted' row stays promoted).

BEGIN;

-- 16 candidate rows. Flat rule_key naming = category_key verbatim (Phase 60
-- D-05 pattern; Open Q #3 confirmed).
insert into public.classifier_rules (swarm_type, rule_key, kind, status, notes)
values
  -- debtor-email — 8 rows, kind='regex' (Pass 1 + loopback both emit
  -- rule_key into agent_runs telemetry; promotion gate is Wilson-CI or D-05
  -- corpus-evidence).
  ('debtor-email', 'coupa_invoice_paid_notification',     'regex', 'candidate', 'Phase 84 D-01. Promotion gate per D-05 (Wilson-CI OR corpus-evidence).'),
  ('debtor-email', 'coupa_invoice_approved_notification', 'regex', 'candidate', 'Phase 84 D-01. Promotion gate per D-05 (Wilson-CI OR corpus-evidence).'),
  ('debtor-email', 'iss_ptp_autoreply',                   'regex', 'candidate', 'Phase 84 D-01. Promotion gate per D-05 (Wilson-CI OR corpus-evidence).'),
  ('debtor-email', 'frieslandcampina_portal_reject',      'regex', 'candidate', 'Phase 84 D-01. Promotion gate per D-05 (Wilson-CI OR corpus-evidence).'),
  ('debtor-email', 'm365_quarantine',                     'regex', 'candidate', 'Phase 84 D-01. Promotion gate per D-05 (Wilson-CI OR corpus-evidence).'),
  ('debtor-email', 'sender_phishing_notice',              'regex', 'candidate', 'Phase 84 D-01. Promotion gate per D-05 (Wilson-CI OR corpus-evidence).'),
  ('debtor-email', 'supplier_bank_change_notification',   'regex', 'candidate', 'Phase 84 D-01. Promotion gate per D-05 (Wilson-CI OR corpus-evidence). Corpus-very-short (N=1) — keep shadow-only path until volume grows.'),
  ('debtor-email', 'own_outbound_invoice_loopback',       'regex', 'candidate', 'Phase 84 D-01 / D-03. Loopback rule lives in classifier-screen-worker.ts, not classify.ts. Promotion gate per D-05.'),

  -- sales-email — 8 rows, kind='agent_intent' (no regex module; LLM Pass 2
  -- attributes the category_key from the call-time closed list).
  ('sales-email',  'coupa_invoice_paid_notification',     'agent_intent', 'candidate', 'Phase 84 D-08. LLM 2nd-pass attribution; no regex module for sales-email.'),
  ('sales-email',  'coupa_invoice_approved_notification', 'agent_intent', 'candidate', 'Phase 84 D-08. LLM 2nd-pass attribution; no regex module for sales-email.'),
  ('sales-email',  'iss_ptp_autoreply',                   'agent_intent', 'candidate', 'Phase 84 D-08. LLM 2nd-pass attribution; no regex module for sales-email.'),
  ('sales-email',  'frieslandcampina_portal_reject',      'agent_intent', 'candidate', 'Phase 84 D-08. LLM 2nd-pass attribution; no regex module for sales-email.'),
  ('sales-email',  'm365_quarantine',                     'agent_intent', 'candidate', 'Phase 84 D-08. LLM 2nd-pass attribution; no regex module for sales-email.'),
  ('sales-email',  'sender_phishing_notice',              'agent_intent', 'candidate', 'Phase 84 D-08. LLM 2nd-pass attribution; no regex module for sales-email.'),
  ('sales-email',  'supplier_bank_change_notification',   'agent_intent', 'candidate', 'Phase 84 D-08. LLM 2nd-pass attribution; no regex module for sales-email.'),
  ('sales-email',  'own_outbound_invoice_loopback',       'agent_intent', 'candidate', 'Phase 84 D-08 / D-03. Tenant-domain self-scoping; sales-email has 1 tenant domain (smeba.nl).')
on conflict (swarm_type, rule_key) do nothing;

COMMIT;
