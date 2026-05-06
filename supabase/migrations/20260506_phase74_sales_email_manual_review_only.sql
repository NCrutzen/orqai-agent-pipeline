-- Phase 74 — sales-email noise categories temporarily set to manual_review.
--
-- Reason: classifier-verdict-worker.ts hardcodes 'categorize_archive' to Outlook
-- (categorizeEmail + archiveEmail). Sugar emails have no Outlook mailbox so
-- the Outlook dispatch would fail. Until Phase 75 ships the registry-driven
-- swarms.side_effects refactor + the Sugar resolve route, sales-email LLM
-- classifies but archive is operator-driven via Bulk Review.
--
-- All 5 sales-email categories → manual_review.

update public.swarm_categories
set
  action         = 'manual_review',
  swarm_dispatch = null,
  updated_at     = now()
where swarm_type = 'sales-email';
