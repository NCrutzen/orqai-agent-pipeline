-- Corrective fix: support-tickets swarm_intents.handler_event must equal
-- 'support-tickets/<intent_key>.requested' so it matches each Stage 4 handler's
-- Inngest trigger.
--
-- Root cause: the Phase-4 migration (20260602a §C) only rewrote rows whose
-- handler_event did NOT match the loose pattern 'support-tickets/%.requested':
--
--     where swarm_type = 'support-tickets'
--       and (handler_event is null
--            or handler_event not like 'support-tickets/%.requested');
--
-- The stale Phase-1 seed value 'support-tickets/clarification.requested'
-- (intent_key = 'clarification-needed') slipped through — it matched that loose
-- pattern but did NOT match its intent_key. As a result the Stage 4 dispatcher
-- read that value from the registry and emitted 'support-tickets/clarification.requested',
-- which NO function listens to (the clarification handler is triggered by
-- 'support-tickets/clarification-needed.requested'). clarification-needed tickets
-- therefore completed the dispatcher but never reached the handler — confirmed
-- live 2026-06-09 (dispatcher: Completed, clarification-handler: 0 runs).
--
-- This rewrites any divergent support-tickets row to the canonical form, using
-- an EXACT comparison against '<intent_key>.requested' instead of the loose
-- pattern. Idempotent: re-running is a no-op once every row is canonical.
-- No schema/table changes, so no RLS work is required.

BEGIN;

UPDATE public.swarm_intents
   SET handler_event = 'support-tickets/' || intent_key || '.requested',
       updated_at    = now()
 WHERE swarm_type = 'support-tickets'
   AND handler_event IS DISTINCT FROM 'support-tickets/' || intent_key || '.requested';

COMMIT;
