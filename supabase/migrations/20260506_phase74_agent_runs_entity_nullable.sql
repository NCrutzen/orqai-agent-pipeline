-- Phase 74 — Stage 1 LLM classifier needs agent_runs to accept rows for
-- sales-email LLM calls. Sales-email has no debtor entity; entity is a
-- debtor-specific concept that does not generalize. Drop the CHECK and
-- the NOT NULL — swarm_type column already provides cross-swarm
-- discrimination.
-- Source: 74-RESEARCH.md Pitfall 1, Open Question 4.

alter table public.agent_runs
  drop constraint if exists agent_runs_entity_check;

alter table public.agent_runs
  alter column entity drop not null;

-- Phase 74 D-11 contract: classifier-screen-worker writes a top-level
-- error_message on LLM error/timeout/schema-fail. Ensure the column
-- exists (idempotent — no-op if 20260428 schema already has it).
alter table public.agent_runs
  add column if not exists error_message text null;
