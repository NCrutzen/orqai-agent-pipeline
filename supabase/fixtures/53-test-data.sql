-- Phase 53 test data fixture.
--
-- Adds 8 agent_events on the EASY Email Agent Swarm
-- (project id f8df0bce-ed24-4b77-b921-7fce44cabbbb) building a small
-- delegation tree across the 3 existing swarm_agents so the Phase 53
-- delegation graph and Gantt swimlane have cross-agent edges + bars.
--
-- Tree:
--   EASY_intake (span-dddd-01) --delegates--> EASY_draft (span-dddd-02)
--                              --delegates--> EASY_compliance (span-dddd-03)
--   EASY_draft  (span-dddd-02) --delegates--> EASY_compliance (span-dddd-04)
--
-- Apply via the Management API token in session context.
-- Idempotent: re-running is safe via ON CONFLICT (id) DO NOTHING.
--
-- Verification after apply:
--   SELECT count(*) FROM agent_events
--     WHERE swarm_id = 'f8df0bce-ed24-4b77-b921-7fce44cabbbb';     -- 20
--   SELECT count(*) FROM agent_events
--     WHERE swarm_id = 'f8df0bce-ed24-4b77-b921-7fce44cabbbb'
--     AND parent_span_id LIKE 'span-dddd-%';                        -- 5
--
-- Phase: 53-advanced-observability
-- Date: 2026-04-16

INSERT INTO agent_events (id, swarm_id, agent_name, event_type, span_id, parent_span_id, content, started_at, ended_at) VALUES
  -- Orchestrator span on EASY_intake (span-dddd-01)
  ('dddd4444-0000-0000-0000-000000000001',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_intake',
   'thinking', 'span-dddd-01', NULL,
   '{"trace_id":"trace-dddd-4444","span_id":"span-dddd-01","span_name":"Triage and route"}'::jsonb,
   NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '4 minutes 50 seconds'),
  ('dddd4444-0000-0000-0000-000000000002',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_intake',
   'done', 'span-dddd-01', NULL,
   '{"trace_id":"trace-dddd-4444","span_id":"span-dddd-01","span_name":"Triage and route"}'::jsonb,
   NULL, NOW() - INTERVAL '4 minutes 50 seconds'),

  -- Delegated work on EASY_draft (span-dddd-02), parent: span-dddd-01
  ('dddd4444-0000-0000-0000-000000000003',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_draft',
   'thinking', 'span-dddd-02', 'span-dddd-01',
   '{"trace_id":"trace-dddd-4444","span_id":"span-dddd-02","span_name":"Compose response"}'::jsonb,
   NOW() - INTERVAL '4 minutes 45 seconds', NOW() - INTERVAL '4 minutes'),
  ('dddd4444-0000-0000-0000-000000000004',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_draft',
   'done', 'span-dddd-02', 'span-dddd-01',
   '{"trace_id":"trace-dddd-4444","span_id":"span-dddd-02","span_name":"Compose response"}'::jsonb,
   NULL, NOW() - INTERVAL '4 minutes'),

  -- Delegated work on EASY_compliance (span-dddd-03), parent: span-dddd-01
  ('dddd4444-0000-0000-0000-000000000005',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_compliance',
   'thinking', 'span-dddd-03', 'span-dddd-01',
   '{"trace_id":"trace-dddd-4444","span_id":"span-dddd-03","span_name":"Policy precheck"}'::jsonb,
   NOW() - INTERVAL '4 minutes 40 seconds', NOW() - INTERVAL '4 minutes 10 seconds'),
  ('dddd4444-0000-0000-0000-000000000006',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_compliance',
   'done', 'span-dddd-03', 'span-dddd-01',
   '{"trace_id":"trace-dddd-4444","span_id":"span-dddd-03","span_name":"Policy precheck"}'::jsonb,
   NULL, NOW() - INTERVAL '4 minutes 10 seconds'),

  -- Nested delegation: EASY_compliance secondary span (span-dddd-04), parent: span-dddd-02 (draft)
  ('dddd4444-0000-0000-0000-000000000007',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_compliance',
   'thinking', 'span-dddd-04', 'span-dddd-02',
   '{"trace_id":"trace-dddd-4444","span_id":"span-dddd-04","span_name":"PII scan on draft"}'::jsonb,
   NOW() - INTERVAL '3 minutes 50 seconds', NOW() - INTERVAL '3 minutes 30 seconds'),
  ('dddd4444-0000-0000-0000-000000000008',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_compliance',
   'done', 'span-dddd-04', 'span-dddd-02',
   '{"trace_id":"trace-dddd-4444","span_id":"span-dddd-04","span_name":"PII scan on draft"}'::jsonb,
   NULL, NOW() - INTERVAL '3 minutes 30 seconds')
ON CONFLICT (id) DO NOTHING;
