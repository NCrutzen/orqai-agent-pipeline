-- Phase: ad-hoc / quick task 20260520-supabase-rls-hardening
--
-- Purpose: fix Supabase advisor ERROR-level findings and add defense-in-depth
-- against future tables being created without RLS. The Supabase project exposes
-- the following schemas via PostgREST (see /v1/projects/.../postgrest db_schema):
--   public, graphql_public, debtor, sales, email_pipeline, email_insights, automation
-- Every table in those schemas is reachable with the anon key unless RLS denies.

BEGIN;

-- 1. sales.kb_chunks: RLS was disabled → anyone with anon key could read/edit/delete.
--    All writes go through web/lib/automations/sales-email-analyzer/src/build-kb.ts
--    using the service role key, which bypasses RLS. Enable RLS with a service-role-
--    only ALL policy so the surface is fully closed to anon/authenticated.
ALTER TABLE sales.kb_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kb_chunks_service_all ON sales.kb_chunks;
CREATE POLICY kb_chunks_service_all
  ON sales.kb_chunks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. email_pipeline.conversation_context: same situation. All writers
--    (sales-email/ingest, debtor-email/ingest, debtor-email-coordinator,
--    backfill-bodies.ts) use createAdminClient() → service role.
ALTER TABLE email_pipeline.conversation_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_context_service_all ON email_pipeline.conversation_context;
CREATE POLICY conversation_context_service_all
  ON email_pipeline.conversation_context
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. SECURITY DEFINER views — switch to security_invoker so RLS of the
--    querying role is enforced instead of the view owner's (postgres) privs.
ALTER VIEW public.agent_runs_stuck_classifying_with_kanban_count
  SET (security_invoker = true);

ALTER VIEW public.classifier_rule_telemetry
  SET (security_invoker = true);

-- 4. learnings: previously anon SELECT/INSERT with qual=true (rls_policy_always_true).
--    The only writer is the /mr-automations:learn skill which runs through the
--    Supabase MCP using the service role. Drop the anon policies; service role
--    bypasses RLS so writes still work. Authenticated users keep read access.
DROP POLICY IF EXISTS anon_insert_learnings ON public.learnings;
DROP POLICY IF EXISTS anon_select_learnings ON public.learnings;

DROP POLICY IF EXISTS learnings_service_all ON public.learnings;
CREATE POLICY learnings_service_all
  ON public.learnings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS learnings_authenticated_select ON public.learnings;
CREATE POLICY learnings_authenticated_select
  ON public.learnings
  FOR SELECT
  TO authenticated
  USING (true);

-- 5. dashboard_snapshots: previously anon SELECT (qual=true). Both the writer
--    (lib/inngest/functions/dashboard-aggregator.ts) and the reader
--    (app/(dashboard)/executive/page.tsx) use createAdminClient() → service role,
--    so dropping anon access is safe.
DROP POLICY IF EXISTS "Anyone can read dashboard snapshots" ON public.dashboard_snapshots;
DROP POLICY IF EXISTS "Service role full access on dashboard_snapshots" ON public.dashboard_snapshots;

DROP POLICY IF EXISTS dashboard_snapshots_service_all ON public.dashboard_snapshots;
CREATE POLICY dashboard_snapshots_service_all
  ON public.dashboard_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. Defense in depth: revoke anon INSERT/UPDATE/DELETE on every existing table
--    in every PostgREST-exposed schema, and set default privileges so future
--    tables created by anyone (Claude, migrations, the studio UI) don't grant
--    anon writes either. RLS is the primary gate; this is a redundant second
--    barrier in case a future policy mistakenly allows anon ALL.
DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public','debtor','sales','email_pipeline','email_insights','automation']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      RAISE NOTICE 'skipping schema % (does not exist)', s;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA %I FROM anon', s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon', s);
    -- Also revoke from postgres-as-creator default privileges so tables
    -- created by the Studio UI or migrations under the postgres role inherit
    -- the restriction.
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon', s);
  END LOOP;
END $$;

COMMIT;
