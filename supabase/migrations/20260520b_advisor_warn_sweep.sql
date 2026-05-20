-- Quick task 20260520-supabase-rls-hardening (follow-up sweep).
--
-- Closes the WARN-level advisor findings that don't require touching extension
-- placement or breaking RLS:
--   - 18× function_search_path_mutable
--   - 4× anon_security_definer_function_executable  (1 kept by design)
--   - 4× authenticated_security_definer_function_executable (1 kept by design)
--
-- Deferred (NOT in this migration):
--   - extension_in_public (pg_trgm, vector) — needs a coordinated audit; see
--     .planning/todos/pending/2026-05-20-move-public-extensions-out.md.
--   - public.auth_user_project_ids EXECUTE for authenticated — referenced by
--     RLS policies on projects/project_members; revoking breaks RLS.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. function_search_path_mutable — pin search_path on every flagged function.
--    Standard target: 'public, pg_catalog, pg_temp' (or schema-qualified for
--    non-public). This blocks the search-path hijack attack class where an
--    unprivileged user creates an object in their schema that shadows a
--    catalog symbol the function relies on.
-- ───────────────────────────────────────────────────────────────────────────

-- public schema (most are trigger-side updated_at setters)
ALTER FUNCTION public.add_creator_as_member()                       SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.agent_names_touch_updated_at()                SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.agent_runs_set_updated_at()                   SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.automation_runs_with_outlier(text, integer, integer, numeric) SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.classifier_queue_counts(text)                 SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.classifier_rules_set_updated_at()             SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.orq_agents_set_updated_at()                   SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.set_updated_at()                              SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.stage0_backfill_candidates(integer)           SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.stage0_coverage_24h(text, text)               SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.swarm_categories_set_updated_at()             SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.swarm_intents_set_updated_at()                SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.swarms_set_updated_at()                       SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.update_heeren_staging_updated_at()            SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.update_updated_at()                           SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.zapier_tools_set_updated_at()                 SET search_path = public, pg_catalog, pg_temp;

-- debtor schema
ALTER FUNCTION debtor.agent_runs_set_updated_at()                   SET search_path = debtor, public, pg_catalog, pg_temp;

-- sales schema — search_kb uses pgvector ops; vector currently lives in public
-- so the public entry resolves the operators. Once vector moves to `extensions`
-- the deferred follow-up will switch this to 'sales, extensions, pg_catalog, pg_temp'.
ALTER FUNCTION sales.search_kb(vector, text, text, text[], integer) SET search_path = sales, public, pg_catalog, pg_temp;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Lock down SECURITY DEFINER functions that don't need anon/authenticated
--    execution. service_role bypasses, so backend RPCs keep working.
--
--    NOTE on add_creator_as_member: it's a trigger function on projects. The
--    trigger fires regardless of who runs the INSERT — EXECUTE on the function
--    itself is not required to fire a trigger. Safe to revoke from public.
-- ───────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.add_creator_as_member()                          FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.coordinator_complete_handler(uuid, boolean)      FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.label_dashboard_counts(text)                     FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()                                FROM anon, authenticated, public;

-- auth_user_project_ids: keep EXECUTE for `authenticated` (RLS policies on
-- projects/project_members reference it). Revoke from anon and public only.
REVOKE EXECUTE ON FUNCTION public.auth_user_project_ids()                          FROM anon, public;

COMMIT;
