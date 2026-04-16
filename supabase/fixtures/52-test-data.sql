-- Phase 52 test data fixture.
--
-- Seeds 10 swarm_jobs across all 5 stages on the EASY Email Agent
-- Swarm (project id f8df0bce-ed24-4b77-b921-7fce44cabbbb) so the
-- Phase 52 Kanban board has cards to render and drag.
--
-- Distribution:
--   backlog : 2  (1 high+sla, 1 normal+new)
--   ready   : 2  (1 high+sla,  1 normal)
--   progress: 3  (1 urgent+blocked, 1 normal, 1 low)
--   review  : 2  (1 high+blocked,    1 normal)
--   done    : 1  (1 normal+approved)
--
-- Apply via the Management API:
--   curl -X POST 'https://api.supabase.com/v1/projects/mvqjhlxfvtqqubqgdvhz/database/query' \
--     -H 'Authorization: Bearer <SBP_TOKEN>' \
--     -H 'Content-Type: application/json' \
--     --data "{\"query\": $(cat supabase/fixtures/52-test-data.sql | jq -Rs .)}"
--
-- Verification:
--   SELECT stage, count(*) FROM swarm_jobs
--     WHERE swarm_id = 'f8df0bce-ed24-4b77-b921-7fce44cabbbb'
--     GROUP BY stage;     -- should return: backlog 2 / ready 2 / progress 3 / review 2 / done 1
--
-- Idempotent: ON CONFLICT (id) DO UPDATE preserves repeatability.
--
-- Phase: 52-live-interactivity
-- Date: 2026-04-16

INSERT INTO swarm_jobs
  (id, swarm_id, title, description, stage, priority, assigned_agent, tags, position)
VALUES
  -- Backlog
  ('52000000-0000-0000-0000-000000000001',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'Triage backlog from overnight inbox',
   'Sort 47 inbound emails into priority lanes for the morning batch.',
   'backlog', 'high', 'EASY_intake',
   '["sla","new"]'::jsonb, 1),
  ('52000000-0000-0000-0000-000000000002',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'New supplier onboarding request',
   'AcmeCorp wants integration -- needs intake form pulled and routed.',
   'backlog', 'normal', NULL,
   '["new"]'::jsonb, 2),

  -- Ready
  ('52000000-0000-0000-0000-000000000003',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'Customer escalation: missing invoice copy',
   'Reply with last 3 invoices via secure link; SLA expires 14:00.',
   'ready', 'high', 'EASY_draft',
   '["sla"]'::jsonb, 1),
  ('52000000-0000-0000-0000-000000000004',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'Confirm meeting reschedule',
   'Standard reply ready -- waiting on calendar confirmation pull.',
   'ready', 'normal', 'EASY_draft',
   '[]'::jsonb, 2),

  -- In progress
  ('52000000-0000-0000-0000-000000000005',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'Compliance review: contract draft v3',
   'Compliance agent flagged PII; orchestrator is rerouting to legal.',
   'progress', 'urgent', 'EASY_compliance',
   '["blocked","sla"]'::jsonb, 1),
  ('52000000-0000-0000-0000-000000000006',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'Quarterly newsletter draft',
   'Drafter agent composing first pass against approved brief.',
   'progress', 'normal', 'EASY_draft',
   '[]'::jsonb, 2),
  ('52000000-0000-0000-0000-000000000007',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'Update knowledge base entry',
   'Refresh KB entry on holiday OOO policy after HR amendment.',
   'progress', 'low', NULL,
   '[]'::jsonb, 3),

  -- Human review
  ('52000000-0000-0000-0000-000000000008',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'Refund request: order #44102',
   'Drafter prepared response; awaiting human approval before send.',
   'review', 'high', 'EASY_compliance',
   '["blocked"]'::jsonb, 1),
  ('52000000-0000-0000-0000-000000000009',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'Tone check: complaint reply',
   'Reply ready; reviewer should verify tone before sending.',
   'review', 'normal', 'EASY_compliance',
   '[]'::jsonb, 2),

  -- Done
  ('52000000-0000-0000-0000-00000000000a',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'Welcome email to new client',
   'Sent and archived earlier today; awaiting client acknowledgement.',
   'done', 'normal', 'EASY_draft',
   '["approved"]'::jsonb, 1)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  stage = EXCLUDED.stage,
  priority = EXCLUDED.priority,
  assigned_agent = EXCLUDED.assigned_agent,
  tags = EXCLUDED.tags,
  position = EXCLUDED.position,
  updated_at = NOW();
