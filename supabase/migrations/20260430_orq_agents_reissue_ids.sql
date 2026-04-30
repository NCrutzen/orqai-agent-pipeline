-- Phase 56-02 wave 3 part 2: re-issue Orq.ai agent IDs.
--
-- Both seeded debtor-email agents were deleted from Orq.ai and recreated on
-- 2026-04-30. New orqai_ids point at the freshly-provisioned agents in the
-- "Debtor Team" project (workspace: cura). Specs unchanged — same instructions,
-- same response_format, same models, same body_version / intent_version
-- ("2026-04-23.v1"). Bumping orqai_id only.
--
-- Reference:
--   intent  → https://my.orq.ai/cura/agents/01KQECK191GE21CH8D8KEMTM9J
--   body    → https://my.orq.ai/cura/agents/01KQECMBEMRKX28E0F0T64A43K
--
-- The label-tiebreaker placeholder row (enabled=false) is left untouched.

update public.orq_agents
   set orqai_id   = '01KQECK191GE21CH8D8KEMTM9J',
       updated_at = now()
 where agent_key = 'debtor-intent-agent';

update public.orq_agents
   set orqai_id   = '01KQECMBEMRKX28E0F0T64A43K',
       updated_at = now()
 where agent_key = 'debtor-copy-document-body-agent';
