-- Phase 116-04 Task 1 — registry rewire: sales 'unknown' swarm_dispatch now
-- fires the attachment-extraction funnel step instead of Stage 2 directly.
--
-- D-01 / D-02: extraction is a funnel step BETWEEN the Stage 1 verdict and the
-- Stage 2 request. The classifier-verdict-worker (untouched) emits whatever
-- event name lives in swarm_noise_categories.swarm_dispatch. By repointing the
-- sales 'unknown' (Stage-2-handoff) row from
--   'sales-email/stage-2.customer-resolve.requested'   (seeded 20260604b)
-- to
--   'sales-email/attachments.extract.requested'
-- the verdict worker now fires the NEW stage-1.5 extractor worker, which:
--   1. runs registry-gated extraction over the captured 'pending' attachments,
--   2. then ALWAYS re-emits the downstream Stage 2 event whose name it reads
--      from the registry: public.swarms.attachment_config.stage2_dispatch_event
--      (= 'sales-email/stage-2.customer-resolve.requested', seeded in 20260605b).
-- The extractor is therefore a TRANSPARENT interposition — Stage 2 still runs;
-- it just sees attachment text now. No worker-code change is needed for this
-- rewire; it is pure registry data (SWARM-02 / D-04).
--
-- Debtor is NOT touched: debtor's attachment_config.extract = false (D-13) and
-- debtor's 'unknown' swarm_dispatch still points straight at
-- 'debtor-email/stage-2.customer-resolve.requested' — debtor does not route
-- through the extractor at all. (Even if it did, extract=OFF makes the worker a
-- pure pass-through.)
--
-- Idempotent UPDATE — re-running sets the same value. Scoped precisely to the
-- sales 'unknown' / swarm_dispatch row only.

BEGIN;

-- Repoint ONLY the sales Stage-2-handoff row. The 'unknown' fall-through bucket
-- is the swarm_dispatch category for sales (flipped to action='swarm_dispatch'
-- in 20260604b). Scope on swarm_type + category_key='unknown' AND
-- action='swarm_dispatch' so no other sales noise row is affected.
UPDATE public.swarm_noise_categories
   SET swarm_dispatch = 'sales-email/attachments.extract.requested'
 WHERE swarm_type = 'sales-email'
   AND category_key = 'unknown'
   AND action = 'swarm_dispatch';

COMMIT;
