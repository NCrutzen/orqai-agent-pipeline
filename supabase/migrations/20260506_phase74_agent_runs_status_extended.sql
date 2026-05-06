-- Phase 74 — extend agent_runs.status CHECK to accept Stage-1 classifier states.
-- Original list was debtor-intent-agent (Stage 3 coordinator) specific.
-- Stage 1 classifier-screen-worker writes status='predicted' (success) and
-- status='failed' (LLM error / schema-fail). Both were silently rejected by
-- the original CHECK, causing the INSERT to no-op and agent_runs rows to be
-- absent for sales-email LLM-only path.

alter table public.agent_runs drop constraint if exists agent_runs_status_check;

alter table public.agent_runs add constraint agent_runs_status_check check (
  status in (
    -- Stage 1 classifier-screen-worker (Phase 74)
    'predicted',
    'failed',
    -- Stage 3 debtor-intent-agent legacy states
    'classifying',
    'routed_human_queue',
    'fetching_document',
    'generating_body',
    'creating_draft',
    'copy_document_drafted',
    'copy_document_needs_review',
    'copy_document_failed_not_found',
    'copy_document_failed_transient',
    'login_failed_blocked',
    'done'
  )
);
