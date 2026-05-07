-- Phase 999.4 Fix C — agent_runs.result jsonb.
--
-- Stage 1 classifier-screen-worker (and future swarm-agnostic predict
-- workers) writes the gated verdict in one place so downstream observers
-- don't have to reconstruct it from (confidence column) +
-- (tool_outputs.gated_to). The success path mirrors:
--
--   result = { category_key: <gated_key>, confidence: <low|medium|high> }
--
-- The D-11 catch path mirrors:
--
--   result = { category_key: 'unknown', confidence: 'low' }
--
-- Backwards compatible: nullable, default '{}'::jsonb. Existing pre-Phase-999.4
-- rows keep their tool_outputs-only shape; new rows from classifier-screen-
-- worker carry both `result` and `tool_outputs`.

alter table public.agent_runs
  add column if not exists result jsonb not null default '{}'::jsonb;

comment on column public.agent_runs.result is
  'Phase 999.4 Fix C — gated verdict shape { category_key, confidence }. '
  'Populated by Stage 1 classifier-screen-worker (success + D-11 catch). '
  'Stage 3 coordinator workers may extend this shape later.';
