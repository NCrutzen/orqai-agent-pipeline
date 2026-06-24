-- Quick 260624 — seed 2 candidate rows in public.classifier_rules for the two
-- new debtor-email Pass-1 regex matchers added in web/lib/debtor-email/classify.ts:
--   - basecone_upload_confirmation  (no-reply@mailtobasecone.com + "Succesvol …")
--   - hofwonen_autoreply_ack        (facturen@hofwonen.nl + "Bedankt voor uw e-mail")
--
-- Both classify deterministically as category 'auto_reply'. These pure-noise
-- system auto-replies previously reached the LLM 2nd-pass as no_match and piled
-- into Bulk Review (19 + 18 in the live corpus). The regex now catches them; the
-- candidate rows make them visible in the classifier-rules dashboard and let the
-- Wilson-CI cron (classifier-promotion-cron) accumulate operator signal toward
-- promotion. Per graduated-automation (docs/agentic-pipeline/graduated-automation.md)
-- they auto-archive ONLY once promoted — this migration does NOT promote them.
--
-- kind='regex' mirrors the Phase 84 debtor-email seed (20260520_phase84_classifier
-- _rules_seed.sql): Pass-1 matchers emit their rule_key into agent_runs/pipeline_
-- events telemetry, so promotion math rolls up uniformly.
--
-- Hard separation: writes ONLY to classifier_rules (Stage 1 promotion-gate
-- telemetry). NO swarm_noise_categories or swarm_intents row is added — 'auto_reply'
-- already exists in swarm_noise_categories. Static-check at
-- web/__tests__/static-checks/swarm-hard-separation.test.ts enforces.
--
-- Idempotent: on conflict (swarm_type, rule_key) do nothing preserves any
-- operator-modified status (e.g. a hand-promoted row stays promoted).

BEGIN;

insert into public.classifier_rules (swarm_type, rule_key, kind, status, notes)
values
  ('debtor-email', 'basecone_upload_confirmation', 'regex', 'candidate', 'Quick 260624. Sender-pinned (@mailtobasecone.com + "Succesvol"). category=auto_reply. Promotion gate = Wilson-CI cron.'),
  ('debtor-email', 'hofwonen_autoreply_ack',       'regex', 'candidate', 'Quick 260624. Sender-pinned (facturen@hofwonen.nl + "Bedankt voor uw e-mail"). category=auto_reply. Promotion gate = Wilson-CI cron.')
on conflict (swarm_type, rule_key) do nothing;

COMMIT;
