-- Phase 999.8 D-07 — agent_runs.predictor attribution column.
--
-- Records WHICH Stage 1 predictor decided a given row:
--   'regex'        = Pass 1 regex hit a noise key
--   'llm_2nd_pass' = Pass 1 abstained (unknown) → Pass 2 LLM classifier ran
--
-- Historical rows stay NULL (forward-only cutover, D-09). Plan 05 writes the
-- value in recordVerdict by reading pipeline_events.decision_details (which
-- Plan 02 Task 3 denormalizes), and Plan 06's per-predictor labeling-flip
-- cron filters on .eq('predictor', ...).
--
-- Idempotency idiom matches 20260506_phase74_agent_runs_entity_nullable.sql
-- (add column if not exists / drop constraint if exists / add constraint).
--
-- NO index added: RESEARCH §0 explicitly recommends against — selectivity
-- is low (two values) and the dominant filter is the jsonb path
-- decision_details->>predictor on pipeline_events.

alter table public.agent_runs
  add column if not exists predictor text;

alter table public.agent_runs
  drop constraint if exists agent_runs_predictor_check;

alter table public.agent_runs
  add constraint agent_runs_predictor_check check (
    predictor is null or predictor in ('regex', 'llm_2nd_pass')
  );

comment on column public.agent_runs.predictor is
  'Phase 999.8 D-07 — which Stage 1 predictor decided this row. '
  '''regex'' = Pass 1 hit. ''llm_2nd_pass'' = Pass 2 LLM gated through '
  'the high-confidence gate. NULL on rows predating cutover (forward-only D-09).';
