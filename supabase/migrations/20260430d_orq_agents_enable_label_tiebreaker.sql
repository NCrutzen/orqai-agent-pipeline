-- Phase 56-02 wave 3 part 2 follow-up: activate the label-tiebreaker agent.
--
-- Created on Orq.ai 2026-04-30 in "Debtor Team/debtor-email-swarm" with
-- the spec at Agents/debtor-email-swarm/agents/label-tiebreaker.md.
-- Smoke test: invoice-anchor disambiguation returned the correct candidate
-- with confidence=high and a well-formed reason.
--
-- This migration replaces the placeholder slug + flips enabled=true so
-- llm-tiebreaker.ts switches off the LABEL_TIEBREAKER_AGENT_SLUG env-var
-- fallback path and onto the registry-driven invokeOrqAgent path.
--
-- Reference: https://my.orq.ai/cura/agents/01KQEEZ5KH37TZQJXS9C5TA8RQ

update public.orq_agents
   set orqai_id   = '01KQEEZ5KH37TZQJXS9C5TA8RQ',
       version    = '2026-04-30.v1',
       enabled    = true,
       notes      = 'Active. Spec: Agents/debtor-email-swarm/agents/label-tiebreaker.md. Pre-fetched candidate context only — no NXT tool access. Post-validator in llm-tiebreaker.ts asserts selected_account_id is in the candidates set.',
       updated_at = now()
 where agent_key = 'label-tiebreaker';
