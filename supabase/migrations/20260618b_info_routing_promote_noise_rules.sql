-- Operator promotion (2026-06-18): manually promote the 3 clear-cut info-routing
-- noise rules so Stage-1 high-confidence verdicts in these categories AUTO-ARCHIVE.
--
-- WHY: the Stage-1 promotion gate (web/lib/inngest/functions/classifier-screen-worker.ts
-- Step 5) only clears a high-confidence LLM noise verdict to
-- `classifier/verdict.recorded` (→ verdict-worker → Outlook archive) when its
-- `llm:{category}:high` rule is status='promoted' (readWhitelist, cache.ts). The
-- info-routing telemetry that normally drives auto-promotion was starved for the
-- swarm's whole life by the agent_runs swarm_type CHECK bug (fixed 2026-06-16,
-- migration 20260616115210), so the Wilson-CI cron never had data and every noise
-- verdict was held at `requires_review` (no subscriber) — classified but never
-- archived. The operator reviewed the classified samples (clear spam, >90%
-- precision, no invoices/orders) and promotes these three manually.
--
-- HELD BACK (stay candidate, keep human review): spam, automated_security_report,
-- unsolicited_job_application, survey_feedback_invite.
--
-- rule_key format MUST be `llm:{category}:high` — that is the exact string the gate
-- checks (`llm:${finalCategoryKey}:${llmConfidence}`), NOT the bare category key the
-- Phase 130 seed rows use. Promoting the bare key would not clear the gate.
--
-- The `factuur`/`offerte`/... actionable-token carve-out still overrides any noise
-- verdict on a business token, so real mail cannot be archived by these rules.

insert into public.classifier_rules (swarm_type, rule_key, kind, status, promoted_at, notes)
values
  ('info-routing','llm:auto_dealer_spam:high','agent_intent','promoted', now(),
   'Manual operator promotion 2026-06-18 — auto-archive vehicle/auction spam (BAS World etc.).'),
  ('info-routing','llm:cold_sales_outreach:high','agent_intent','promoted', now(),
   'Manual operator promotion 2026-06-18 — auto-archive SEO/cold-B2B outreach.'),
  ('info-routing','llm:marketing_newsletter:high','agent_intent','promoted', now(),
   'Manual operator promotion 2026-06-18 — auto-archive marketing newsletters.')
on conflict (swarm_type, rule_key) do update
  set status='promoted', promoted_at=now(), updated_at=now(), notes=excluded.notes;
