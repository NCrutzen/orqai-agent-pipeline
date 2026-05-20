-- Distinguish deterministic workers (regex rules, scripts) from reasoning
-- workers (Orq.ai agents) on swarm_agents. The briefing LLM narrates rule
-- workers as if they were reasoning agents ("no thinking events, must be
-- stalled") which is wrong — rules never emit thinking events by design.
--
-- worker_kind:
--   rule   — deterministic (regex, script, SQL). No LLM, no thinking events.
--   agent  — LLM-backed (Orq.ai). Thinking/llm_call events are meaningful.
--   hybrid — router that delegates to rule or agent workers.

alter table swarm_agents
  add column if not exists worker_kind text not null default 'agent'
    check (worker_kind in ('rule', 'agent', 'hybrid'));

-- Backfill Debtor Email swarm — today's only automation-backed swarm. The
-- Rule · * rows are regex patterns; AutoReplyHandler is a deterministic
-- Browserless cleanup script; Classifier Orchestrator is the entry shim
-- that picks a rule (will become hybrid once the LLM fallback lands).
update swarm_agents
  set worker_kind = 'rule'
  where swarm_id = '60c730a3-be04-4b59-87e8-d9698b468fc9'
    and (agent_name like 'Rule · %' or agent_name = 'AutoReplyHandler');

update swarm_agents
  set worker_kind = 'hybrid'
  where swarm_id = '60c730a3-be04-4b59-87e8-d9698b468fc9'
    and agent_name = 'Classifier Orchestrator';
