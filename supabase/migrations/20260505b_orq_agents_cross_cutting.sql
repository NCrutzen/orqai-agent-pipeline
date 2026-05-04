-- Phase 69 (CANO-03, D-08). Mark `debtor-copy-document-body-agent` as
-- `swarm_type='cross-cutting'` in public.orq_agents.
--
-- After Phase 69 the body agent is fully data-driven (one brand per
-- invocation, sourced from swarms.entity_brand registry). Marking it
-- `cross-cutting` is an organisational hint for tooling + Bulk Review
-- filters; the runtime read-path keys on agent_key (see
-- web/lib/automations/orq-agents/client.ts:35) and is unaffected.
--
-- Convention: swarm_type IN ('debtor-email', 'sales-email', 'cross-cutting').
-- No CHECK constraint added in Phase 69 (D-Specific-7 / YAGNI).
--
-- Idempotent: safe to re-run; UPDATE is a no-op when already cross-cutting.
-- Wave 1 of Phase 69 applies this via Supabase MCP under operator gate.
-- Wave 0 (this commit) only stages the migration file.

update public.orq_agents
   set swarm_type = 'cross-cutting'
 where agent_key = 'debtor-copy-document-body-agent'
   and swarm_type is distinct from 'cross-cutting';
