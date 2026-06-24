-- Phase 130 NOISE-01 — six paired classifier_rules candidates for info-routing
-- (one per swarm_noise_categories key seeded in
-- 20260616b_phase130_info_routing_noise_categories.sql).
--
-- Pitfall-4 pairing (RESEARCH): every swarm_noise_categories INSERT MUST be
-- paired with a classifier_rules INSERT. The classifier_rule_telemetry view
-- derives n/agree from agent_runs.rule_key (20260428_classifier_rule_telemetry),
-- and classifier-promotion-cron joins to classifier_rules for status. A missing
-- classifier_rules row = the rule never appears cleanly in promotion output.
--
-- All six rows: kind='agent_intent' — info-routing has NO Pass-1 regex module
-- (it shares the debtor classify module and these classes are LLM Pass-2, not
-- regex). The regex kind is NEVER used here. status='candidate' for ALL — these run in
-- SHADOW; promotion is strictly via classifier-promotion-cron Wilson-CI
-- (N>=30, CI-lo>=0.92) AND only when env CLASSIFIER_CRON_MUTATE=true. No blind
-- auto-archive (NOISE-02).
--
-- Hard separation: this migration writes ONLY to classifier_rules (Stage-1
-- promotion-gate telemetry). NO row added to the Stage-3 intent registry.
-- Static-check at web/__tests__/static-checks/swarm-hard-separation.test.ts
-- enforces.
--
-- Idempotent: `on conflict (swarm_type, rule_key) do nothing` keeps re-runs
-- safe and preserves any operator-modified / hand-promoted status (a row an
-- operator promoted to 'promoted' stays promoted on re-run).

BEGIN;

-- Flat rule_key naming = category_key verbatim (Phase 84 / Phase 60 D-05
-- pattern). Zero counters at seed; the cron promotes.
insert into public.classifier_rules (swarm_type, rule_key, kind, status, notes)
values
  ('info-routing', 'automated_security_report',   'agent_intent', 'candidate', 'Phase 130 NOISE-01. LLM Pass-2 attribution; promotion via classifier-promotion-cron Wilson-CI (N>=30, CI-lo>=0.92). Shadow until CLASSIFIER_CRON_MUTATE=true.'),
  ('info-routing', 'cold_sales_outreach',         'agent_intent', 'candidate', 'Phase 130 NOISE-01. LLM Pass-2 attribution; promotion via classifier-promotion-cron Wilson-CI (N>=30, CI-lo>=0.92). Shadow until CLASSIFIER_CRON_MUTATE=true.'),
  ('info-routing', 'marketing_newsletter',        'agent_intent', 'candidate', 'Phase 130 NOISE-01. LLM Pass-2 attribution; promotion via classifier-promotion-cron Wilson-CI (N>=30, CI-lo>=0.92). Shadow until CLASSIFIER_CRON_MUTATE=true.'),
  ('info-routing', 'auto_dealer_spam',            'agent_intent', 'candidate', 'Phase 130 NOISE-01. LLM Pass-2 attribution; promotion via classifier-promotion-cron Wilson-CI (N>=30, CI-lo>=0.92). Shadow until CLASSIFIER_CRON_MUTATE=true.'),
  ('info-routing', 'unsolicited_job_application', 'agent_intent', 'candidate', 'Phase 130 NOISE-01. LLM Pass-2 attribution; promotion via classifier-promotion-cron Wilson-CI (N>=30, CI-lo>=0.92). Shadow until CLASSIFIER_CRON_MUTATE=true.'),
  ('info-routing', 'survey_feedback_invite',      'agent_intent', 'candidate', 'Phase 130 NOISE-01. LLM Pass-2 attribution; promotion via classifier-promotion-cron Wilson-CI (N>=30, CI-lo>=0.92). Shadow until CLASSIFIER_CRON_MUTATE=true.')
on conflict (swarm_type, rule_key) do nothing;

COMMIT;
