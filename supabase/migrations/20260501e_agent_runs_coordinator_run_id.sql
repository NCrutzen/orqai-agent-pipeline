-- Phase 65 Plan 04 — agent_runs.coordinator_run_id FK column.
-- Allows coordinator-synthesis to gather HandlerOutput[] for a given coordinator
-- run by querying agent_runs WHERE coordinator_run_id = <run_id>. Per-handler
-- agent_runs rows already exist for Stage 4 work (debtor-email-triage v1 path);
-- this column links them back to the orchestrator fan-in counter.
--
-- Idempotent (`if not exists`) so re-application is safe.

alter table public.agent_runs
  add column if not exists coordinator_run_id uuid references public.coordinator_runs(run_id);

create index if not exists agent_runs_coordinator_run_idx
  on public.agent_runs (coordinator_run_id);
