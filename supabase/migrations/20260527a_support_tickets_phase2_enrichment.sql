-- ============================================================================
-- 20260527a_support_tickets_phase2_enrichment.sql
--
-- Phase 2 (support-tickets swarm) — Stage 2 entity-enrichment additive schema.
-- Adds 5 columns to public.support_tickets (where Stage 2 enrichment Plans
-- 02-02..02-05 write their outputs) AND defines support.match_tickets(vector,
-- int) — the similar-tickets RPC consumed by Plan 02-05's embed-and-search
-- step. ONE migration, ONE [BLOCKING] human checkpoint — schema for Phase 2
-- lives in exactly one place.
--
-- Scope (additive only):
--   (A) ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS x 5
--        - frame_urls            text[]            NOT NULL DEFAULT '{}'  (ENRICH-02)
--        - proposed_system_status text             NULL CHECK (...)       (ENRICH-04)
--        - pii_quarantine         boolean          NOT NULL DEFAULT false (SAFETY-04)
--        - stage2_cost_cents      numeric(10,4)    NULL                   (SAFETY-05)
--        - stage2_completed_at    timestamptz      NULL                   (ENRICH-06)
--   (B) CREATE OR REPLACE FUNCTION support.match_tickets(vector(1536), int)
--        - SECURITY INVOKER + explicit search_path (no privilege escalation)
--        - REVOKE EXECUTE FROM anon/authenticated/public; GRANT TO service_role
--        - reads support.ticket_embeddings (Phase 1 DATA-03 table)         (ENRICH-05)
--
-- What this migration explicitly does NOT do:
--   - Does NOT re-add quarantine_state text NULL (already exists from Phase 1
--     migration 20260526a line 107 — Plan 02-03 writes the PII reason there).
--   - Does NOT touch RLS on public.support_tickets (Phase 1 enabled RLS + the
--     service_role ALL + authenticated SELECT policies — new columns inherit).
--   - Does NOT alter the supabase_realtime publication (support_tickets is
--     already in the publication; ADD COLUMN inherits).
--   - Does NOT create indexes on the new columns (none needed in Phase 2).
--   - Does NOT touch swarms.canonical_context_shape (2026-05-26.v1 stays).
--   - Does NOT install any packages.
--
-- Idempotency strategy (T-02-03 mitigation):
--   - All ADD COLUMN use IF NOT EXISTS.
--   - CHECK constraint guarded by pg_constraint lookup in a DO block.
--   - RPC via CREATE OR REPLACE FUNCTION.
--   - REVOKE/GRANT are idempotent by Postgres semantics.
--   Verified by re-running this migration in Task 2 step 6.
--
-- Trust boundaries (see plan 02-01 threat_model):
--   T-02-04 InfoDisclosure: RPC is REVOKE EXECUTE FROM anon/authenticated/
--     public; GRANT EXECUTE TO service_role. Phase 2 callers go through the
--     service-role admin client.
--   T-02-EI EoP: RPC is SECURITY INVOKER (NOT DEFINER) + explicit search_path
--     = support, public, pg_catalog, pg_temp — no search_path hijacking.
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- (A) ALTER public.support_tickets — 5 net-new columns.
--     All additive, IF NOT EXISTS, safe DEFAULTs for the (currently empty)
--     Phase 1 row set. ALTER ADD COLUMN with constant DEFAULT is metadata-
--     only in PG 12+ — no table rewrite, lock held for microseconds.
-- ───────────────────────────────────────────────────────────────────────────

-- (A1) frame_urls — Plan 02-04 ffmpeg frame writer stores Storage keys here
--      (NOT signed URLs; signing happens at read-time).
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS frame_urls text[] NOT NULL DEFAULT '{}';

-- (A2) proposed_system_status — Plan 02-05 sets 'detected' on registry hit,
--      'unknown' when no match (ENRICH-04 explicit operator flag), or
--      'cost_ceiling_exceeded' when SAFETY-05 trips after embed (B-4 fix
--      in 02-05). NULL pre-Stage 2. CHECK constraint added separately so
--      we can guard its creation (ALTER ADD CONSTRAINT has no IF NOT EXISTS).
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS proposed_system_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_tickets_proposed_system_status_check'
      AND conrelid = 'public.support_tickets'::regclass
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_proposed_system_status_check
      CHECK (
        proposed_system_status IS NULL
        OR proposed_system_status IN ('detected','unknown','cost_ceiling_exceeded')
      );
  END IF;
END
$$;

-- (A3) pii_quarantine — SAFETY-04 trigger flag written by Plan 02-03 if the
--      PII detector flags. Human-readable reason goes into the existing
--      quarantine_state column (Phase 1 line 107).
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS pii_quarantine boolean NOT NULL DEFAULT false;

-- (A4) stage2_cost_cents — SAFETY-05 per-submission Stage 2 cost rollup.
--      numeric(10,4) mirrors public.pipeline_events.cost_cents shape (verified
--      in 20260506a_pipeline_events.sql line 35) so downstream telemetry
--      aggregations stay arithmetic-compatible.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS stage2_cost_cents numeric(10,4);

-- (A5) stage2_completed_at — Plan 02-05 sets when Stage 2 emits its final
--      PipelineStageContext (i.e. all four enrichment fields filled).
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS stage2_completed_at timestamptz;

-- ───────────────────────────────────────────────────────────────────────────
-- (B) support.match_tickets — semantic-similarity RPC reading
--     support.ticket_embeddings (HNSW vector_cosine_ops index from Phase 1).
--     Mirrors the sales.kb_chunks pattern.
--
--     Contract (consumed by Plan 02-05 via
--       supabase.schema('support').rpc('match_tickets', {...}) ):
--       - query_embedding : vector(1536) — same dimension as Phase 1 column.
--       - top_k           : int          — clamped to [1, 50] server-side.
--       - returns         : top-K rows ordered by cosine distance ASC.
--
--     SECURITY INVOKER + explicit search_path. NEVER SECURITY DEFINER —
--     callers run with their own privileges, search_path can't be hijacked.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION support.match_tickets(
  query_embedding vector(1536),
  top_k           int
)
RETURNS TABLE (
  ticket_id        uuid,
  source_key       text,
  summary_text     text,
  resolution_text  text,
  final_intent     text,
  final_system     text,
  cosine_distance  double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = support, public, pg_catalog, pg_temp
AS $$
  SELECT
    id,
    source_key,
    summary_text,
    resolution_text,
    final_intent,
    final_system,
    (embedding <=> query_embedding)::double precision AS cosine_distance
  FROM support.ticket_embeddings
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT GREATEST(LEAST(top_k, 50), 1);
$$;

-- Anon/authenticated MUST NOT be able to probe the embedding index. Phase 2
-- callers go through the service-role admin client only.
REVOKE EXECUTE ON FUNCTION support.match_tickets(vector, int) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION support.match_tickets(vector, int) TO   service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- (C) Column / function documentation — links each artifact to the
--     requirement ID it satisfies. Audit-friendly for the Phase 2 review.
-- ───────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.support_tickets.frame_urls IS
  'ENRICH-02 — Supabase Storage keys (NOT signed URLs) for ffmpeg-extracted '
  'video frames written by Plan 02-04. Signing happens at read-time.';

COMMENT ON COLUMN public.support_tickets.proposed_system_status IS
  'ENRICH-04 — Stage 2 software-system detector status. NULL pre-Stage 2; '
  '''detected'' on registry hit; ''unknown'' when no match (explicit operator '
  'flag per ENRICH-04 spec); ''cost_ceiling_exceeded'' when SAFETY-05 trips '
  'after embed (B-4 fix in Plan 02-05).';

COMMENT ON COLUMN public.support_tickets.pii_quarantine IS
  'SAFETY-04 — true when the Stage 2 PII detector (Plan 02-03) flags PII in '
  'the transcript or frames. Human-readable reason string lives in the '
  'pre-existing quarantine_state column.';

COMMENT ON COLUMN public.support_tickets.stage2_cost_cents IS
  'SAFETY-05 — per-submission Stage 2 cost rollup written by Plan 02-05. '
  'numeric(10,4) mirrors public.pipeline_events.cost_cents for arithmetic '
  'compatibility with cross-swarm telemetry.';

COMMENT ON COLUMN public.support_tickets.stage2_completed_at IS
  'ENRICH-06 — set by Plan 02-05 when Stage 2 emits its final '
  'PipelineStageContext (all four enrichment fields filled and persisted).';

COMMENT ON FUNCTION support.match_tickets(vector, int) IS
  'ENRICH-05 — top-K cosine-similarity search over support.ticket_embeddings '
  '(Phase 1 DATA-03). SECURITY INVOKER + explicit search_path; EXECUTE granted '
  'only to service_role. Consumed by Plan 02-05 embedAndSearchSimilar.';

COMMIT;

-- ============================================================================
-- Post-apply verification (run separately in Supabase Dashboard SQL editor —
-- the canonical [BLOCKING] human-verify steps for Task 2 of plan 02-01):
--
-- (1) Columns present with correct types/defaults/nullability:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='support_tickets'
--     AND column_name IN ('frame_urls','proposed_system_status',
--                         'pii_quarantine','stage2_cost_cents',
--                         'stage2_completed_at')
--   ORDER BY column_name;
--   → 5 rows; stage2_cost_cents data_type=numeric, precision=10, scale=4.
--
-- (2) RPC presence + security posture:
--   SELECT proname, prosecdef, proconfig
--   FROM pg_proc
--   WHERE pronamespace = 'support'::regnamespace AND proname = 'match_tickets';
--   → 1 row; prosecdef=false (INVOKER); proconfig contains
--     'search_path=support,public,pg_catalog,pg_temp'.
--
-- (3) Sanity-call against the (empty in dev) embeddings table:
--   SELECT * FROM support.match_tickets(
--     array_fill(0::float4, ARRAY[1536])::vector, 5);
--   → 0 rows, no error.
--
-- (4) Idempotency — re-run this whole migration: must succeed silently.
--
-- (5) Cross-swarm regression check (Phase 1 telemetry intact):
--   SELECT swarm_type, count(*) FROM public.pipeline_events
--   WHERE created_at > now() - interval '24 hours' GROUP BY 1;
--   → rows for debtor-email, info-routing, sales-email ≥ 1 each.
--
-- (6) `cd agent-workforce && npm run check:supabase` exits 0.
-- ============================================================================
