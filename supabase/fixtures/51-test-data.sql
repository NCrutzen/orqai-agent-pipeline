-- Phase 51 test data fixture.
--
-- Seeds 3 swarm_agents and 12 agent_events for the EASY Email Agent Swarm
-- (project id f8df0bce-ed24-4b77-b921-7fce44cabbbb) so the Phase 51 hero
-- components (fleet cards, briefing panel, drawer timeline) have something
-- to render before the Phase 50 cron is wired to a live Orq.ai project.
--
-- Apply manually via Supabase Studio SQL editor OR via the Management API
-- when a fresh `sbp_*` token is available. Idempotent: re-running is safe
-- thanks to ON CONFLICT clauses.
--
-- Verification after apply:
--   SELECT count(*) FROM swarm_agents
--     WHERE swarm_id = 'f8df0bce-ed24-4b77-b921-7fce44cabbbb';    -- 3
--   SELECT count(*) FROM agent_events
--     WHERE swarm_id = 'f8df0bce-ed24-4b77-b921-7fce44cabbbb';    -- 12
--
-- Phase: 51-hero-components
-- Date: 2026-04-16

-- ---------------------------------------------------------------
-- swarm_agents: 3 rows, distinct statuses for visual coverage
-- ---------------------------------------------------------------

INSERT INTO swarm_agents (id, swarm_id, agent_name, role, status, metrics, skills) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'EASY_intake',
   'Triages inbound emails and routes them to specialists',
   'active',
   '{"active_jobs": 4, "queue_depth": 2, "error_count": 0}'::jsonb,
   '["Email parsing", "Intent detection", "Priority scoring"]'::jsonb),
  ('22222222-2222-2222-2222-222222222222',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'EASY_draft',
   'Drafts replies using templates and recent customer history',
   'idle',
   '{"active_jobs": 0, "queue_depth": 0, "error_count": 0}'::jsonb,
   '["Template fill", "Tone matching", "Context retrieval"]'::jsonb),
  ('33333333-3333-3333-3333-333333333333',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'EASY_compliance',
   'Verifies replies meet policy and flags risky sends',
   'error',
   '{"active_jobs": 1, "queue_depth": 3, "error_count": 2}'::jsonb,
   '["Policy check", "PII scan", "Escalation"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  metrics = EXCLUDED.metrics,
  skills = EXCLUDED.skills,
  updated_at = NOW();

-- ---------------------------------------------------------------
-- agent_events: 12 rows across 3 trace_ids covering all 4 event types
-- the Phase 51 UI renders (thinking, done, tool_call, tool_result, error).
-- ---------------------------------------------------------------

INSERT INTO agent_events (id, swarm_id, agent_name, event_type, span_id, parent_span_id, content, started_at, ended_at) VALUES
  -- trace trace-aaaa-1111 (intake)
  ('aaaa1111-0000-0000-0000-000000000001', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_intake',     'thinking',    'span-aaaa-01', NULL,           '{"trace_id":"trace-aaaa-1111","span_id":"span-aaaa-01","span_name":"Parse inbound"}'::jsonb,               NOW() - INTERVAL '14 minutes',  NOW() - INTERVAL '13 minutes 50 seconds'),
  ('aaaa1111-0000-0000-0000-000000000002', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_intake',     'done',        'span-aaaa-01', NULL,           '{"trace_id":"trace-aaaa-1111","span_id":"span-aaaa-01","span_name":"Parse inbound"}'::jsonb,               NULL,                           NOW() - INTERVAL '13 minutes 50 seconds'),
  ('aaaa1111-0000-0000-0000-000000000003', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_intake',     'tool_call',   'span-aaaa-02', 'span-aaaa-01', '{"trace_id":"trace-aaaa-1111","span_id":"span-aaaa-02","tool":"priority_score"}'::jsonb,                    NOW() - INTERVAL '13 minutes 45 seconds', NULL),
  ('aaaa1111-0000-0000-0000-000000000004', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_intake',     'tool_result', 'span-aaaa-02', 'span-aaaa-01', '{"trace_id":"trace-aaaa-1111","span_id":"span-aaaa-02","tool":"priority_score"}'::jsonb,                    NULL,                           NOW() - INTERVAL '13 minutes 40 seconds'),
  -- trace trace-bbbb-2222 (draft)
  ('bbbb2222-0000-0000-0000-000000000001', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_draft',      'thinking',    'span-bbbb-01', NULL,           '{"trace_id":"trace-bbbb-2222","span_id":"span-bbbb-01","span_name":"Compose reply"}'::jsonb,                NOW() - INTERVAL '8 minutes',   NOW() - INTERVAL '7 minutes 30 seconds'),
  ('bbbb2222-0000-0000-0000-000000000002', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_draft',      'tool_call',   'span-bbbb-02', 'span-bbbb-01', '{"trace_id":"trace-bbbb-2222","span_id":"span-bbbb-02","tool":"fetch_history"}'::jsonb,                     NOW() - INTERVAL '7 minutes 30 seconds', NULL),
  ('bbbb2222-0000-0000-0000-000000000003', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_draft',      'tool_result', 'span-bbbb-02', 'span-bbbb-01', '{"trace_id":"trace-bbbb-2222","span_id":"span-bbbb-02","tool":"fetch_history"}'::jsonb,                     NULL,                           NOW() - INTERVAL '7 minutes 20 seconds'),
  ('bbbb2222-0000-0000-0000-000000000004', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_draft',      'done',        'span-bbbb-01', NULL,           '{"trace_id":"trace-bbbb-2222","span_id":"span-bbbb-01","span_name":"Compose reply"}'::jsonb,                NULL,                           NOW() - INTERVAL '7 minutes'),
  -- trace trace-cccc-3333 (compliance error)
  ('cccc3333-0000-0000-0000-000000000001', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_compliance', 'thinking',    'span-cccc-01', NULL,           '{"trace_id":"trace-cccc-3333","span_id":"span-cccc-01","span_name":"Policy review"}'::jsonb,                NOW() - INTERVAL '4 minutes',   NOW() - INTERVAL '3 minutes 45 seconds'),
  ('cccc3333-0000-0000-0000-000000000002', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_compliance', 'tool_call',   'span-cccc-02', 'span-cccc-01', '{"trace_id":"trace-cccc-3333","span_id":"span-cccc-02","tool":"pii_scan"}'::jsonb,                          NOW() - INTERVAL '3 minutes 45 seconds', NULL),
  ('cccc3333-0000-0000-0000-000000000003', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_compliance', 'tool_result', 'span-cccc-02', 'span-cccc-01', '{"trace_id":"trace-cccc-3333","span_id":"span-cccc-02","tool":"pii_scan","error":"SSN detected"}'::jsonb,   NULL,                           NOW() - INTERVAL '3 minutes 35 seconds'),
  ('cccc3333-0000-0000-0000-000000000004', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_compliance', 'error',       'span-cccc-03', 'span-cccc-01', '{"trace_id":"trace-cccc-3333","span_id":"span-cccc-03","reason":"Escalation required"}'::jsonb,             NULL,                           NOW() - INTERVAL '3 minutes 20 seconds')
ON CONFLICT (id) DO NOTHING;
