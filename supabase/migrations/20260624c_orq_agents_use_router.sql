-- Problem #2 (Stage-1 reliability) — opt-in queue-free Router transport.
--
-- The blocking agents-path (/v2/agents/{key}/responses, configuration.blocking)
-- enqueues an agent run and intermittently hit the 45s client deadline under
-- burst ("Orq agents-path deadline exceeded for stage-1-category-classifier
-- after 45000ms"). A timeout coerces the email to ('unknown','low') in the
-- Stage-1 screen-worker → spam slips through unarchived. The Orq Router
-- (/v3/router/responses) is a direct, queue-free model call (measured
-- output-equivalent, ~1.4s) that removes the agent-queue as a burst failure
-- mode. `use_router` selects it per agent in web/lib/automations/orq-agents/
-- client.ts; Studio stays the source of truth (instructions/model/
-- response_format are fetched and replayed inline).
--
-- Default FALSE → debtor/sales and every other agents-path caller are byte-
-- neutral. Only the highest-volume classifier (every inbound email) opts in.

ALTER TABLE public.orq_agents
  ADD COLUMN IF NOT EXISTS use_router boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orq_agents.use_router IS
  'When true, invokeOrqAgent uses the queue-free Orq Router (/v3/router/responses) instead of the blocking agents-path. Default false. Studio remains source of truth; the agent definition is fetched and replayed inline.';

UPDATE public.orq_agents
  SET use_router = true
  WHERE agent_key = 'stage-1-category-classifier';

-- RLS already enabled on public.orq_agents (existing table); no new policy
-- needed for an added column.
