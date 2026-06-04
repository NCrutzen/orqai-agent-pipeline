-- ============================================================================
-- 20260528a_support_match_tickets_public_wrapper.sql
--
-- Public-schema wrapper for support.match_tickets(vector, int).
--
-- Reason: PostgREST only exposes schemas listed in pgrst.db_schemas (defaults
-- to 'public,storage'). Adding 'support' there would require Dashboard config
-- change. A `public.match_support_tickets` wrapper RPC is portable across envs
-- and doesn't require operator config.
--
-- The wrapper has the same signature + return type as support.match_tickets
-- and simply delegates. SECURITY INVOKER so the caller's role (service_role)
-- still has to have EXECUTE on the underlying function (already granted in
-- 20260527a).
--
-- Discovered during 2026-05-28 mega smoke: supabase-js `.schema('support').rpc(...)`
-- returned "Invalid schema: support".
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.match_support_tickets(
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
SET search_path = public, support, pg_catalog, pg_temp
AS $$
  SELECT * FROM support.match_tickets(query_embedding, top_k);
$$;

-- Same access posture as the underlying function: service_role only.
REVOKE EXECUTE ON FUNCTION public.match_support_tickets(vector, int) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.match_support_tickets(vector, int) TO   service_role;

COMMIT;

-- Post-apply verification:
--
-- SELECT proname FROM pg_proc
--  WHERE pronamespace = 'public'::regnamespace AND proname = 'match_support_tickets';
-- → must return 1 row.
--
-- SELECT * FROM public.match_support_tickets(array_fill(0::float4, ARRAY[1536])::vector, 5);
-- → 0 rows, no error (support.ticket_embeddings empty in dev).
