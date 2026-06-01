-- ============================================================================
-- 20260601a_support_tickets_phase3_coordinator.sql
--
-- Phase 3 (Stage 3 Coordinator) — additive schema for the coordinator agent's
-- output persistence on public.support_tickets.
--
-- Adds four NULLable columns:
--   - proposed_intent_confidence text       (CHECK: high|medium|low|NULL)
--   - proposed_intent_reasoning  text       (LLM rationale, surfaced in admin)
--   - stage3_completed_at        timestamptz
--   - stage3_cost_cents          numeric(10,4)
--
-- Already in place from Phase 1 (20260526a) — NOT re-added here:
--   - proposed_intent       text NULL
--   - final_intent          text NULL
--   - completeness_verdict  text NULL  CHECK (NULL | 'complete' | 'incomplete')
--   - clarification_questions  jsonb
--   - clarification_responses  jsonb
--
-- Idempotency: every ALTER uses IF NOT EXISTS; the CHECK constraint is added
-- in a DO block guarded by a pg_constraint lookup so re-apply is a no-op.
--
-- Additive only — no DEFAULTs that touch existing rows, no RLS changes (Phase 1
-- enabled RLS + service_role ALL + authenticated SELECT policies; new columns
-- inherit). No DROP / RENAME / DELETE.
--
-- Apply via:
--   cd agent-workforce
--   npx supabase db query --linked --file supabase/migrations/20260601a_support_tickets_phase3_coordinator.sql
--
-- Hallucination guard for `proposed_intent` itself lives in app code (Plan 03-03
-- cross-checks the value against public.swarm_intents WHERE swarm_type =
-- 'support-tickets'). A DB-level CHECK would force a migration whenever the
-- registry grows for support-tickets, defeating the registry-driven design
-- (ROUTE-03). Confidence is bounded forever to {high, medium, low}, so a
-- CHECK enum IS used there.
-- ============================================================================

BEGIN;

-- (1) proposed_intent_confidence + CHECK enum
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS proposed_intent_confidence text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.support_tickets'::regclass
      AND conname  = 'support_tickets_proposed_intent_confidence_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_proposed_intent_confidence_check
      CHECK (proposed_intent_confidence IS NULL
             OR proposed_intent_confidence IN ('high', 'medium', 'low'));
  END IF;
END
$$;

-- (2) proposed_intent_reasoning
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS proposed_intent_reasoning text NULL;

-- (3) stage3_completed_at
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS stage3_completed_at timestamptz NULL;

-- (4) stage3_cost_cents — mirror Phase 2's numeric(10,4) precision
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS stage3_cost_cents numeric(10,4) NULL;

-- Documentation comments (idempotent — re-running just overwrites).
COMMENT ON COLUMN public.support_tickets.proposed_intent_confidence IS
  'Stage 3 confidence in the proposed_intent classification — one of high/medium/low. NULL until Stage 3 completes.';

COMMENT ON COLUMN public.support_tickets.proposed_intent_reasoning IS
  'Stage 3 LLM rationale for proposed_intent — short prose, used in admin view (Phase 5).';

COMMENT ON COLUMN public.support_tickets.stage3_completed_at IS
  'Wall-clock timestamp of Stage 3 coordinator completion (after Zod-validated agent output is persisted).';

COMMENT ON COLUMN public.support_tickets.stage3_cost_cents IS
  'Cumulative cost of the Stage 3 coordinator agent call (USD cents, numeric(10,4) precision). Add to stage2_cost_cents for total per-submission spend.';

COMMIT;

-- ============================================================================
-- Post-apply verification:
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='support_tickets'
--   AND column_name IN ('proposed_intent_confidence','proposed_intent_reasoning',
--                       'stage3_completed_at','stage3_cost_cents')
-- ORDER BY column_name;
-- → 4 rows. stage3_cost_cents data_type='numeric'; stage3_completed_at='timestamp with time zone'.
--
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.support_tickets'::regclass
--   AND conname = 'support_tickets_proposed_intent_confidence_check';
-- → 1 row, definition mentions 'high','medium','low'.
-- ============================================================================
