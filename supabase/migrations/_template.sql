-- Migration template — copy, rename to YYYYMMDD<suffix>_<purpose>.sql, and edit.
--
-- ────────────────────────────────────────────────────────────────────────────
-- MANDATORY for every new table in a PostgREST-exposed schema
-- (public, debtor, sales, email_pipeline, email_insights, automation):
--
--   1. Create the table.
--   2. ENABLE ROW LEVEL SECURITY immediately, in the same migration.
--   3. Add at least one explicit policy. If only backend code touches the
--      table, the policy is service_role-only — anon/authenticated stay
--      denied by default (no policy = no access under RLS).
--   4. NEVER grant INSERT/UPDATE/DELETE to anon. The
--      20260520_harden_rls migration revoked these globally and set default
--      privileges to keep them off; do not re-grant them.
--
-- Skipping any of these = the Supabase security advisor flags it as ERROR-
-- level `rls_disabled_in_public` and the table is reachable with the anon
-- key. CI (`npm run check:supabase`) fails the build when that happens.
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Schema (optional — only if you need to create a new schema)
-- CREATE SCHEMA IF NOT EXISTS my_schema;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.example_table (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  payload     jsonb NOT NULL
);

-- 3. Enable RLS — required.
ALTER TABLE public.example_table ENABLE ROW LEVEL SECURITY;

-- 4. Policies.
-- 4a. Service role (backend code via createAdminClient) gets full access.
DROP POLICY IF EXISTS example_table_service_all ON public.example_table;
CREATE POLICY example_table_service_all
  ON public.example_table
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4b. Authenticated users — add ONLY if the UI reads this table directly.
--     Comment out if the table is backend-only.
-- DROP POLICY IF EXISTS example_table_auth_select ON public.example_table;
-- CREATE POLICY example_table_auth_select
--   ON public.example_table
--   FOR SELECT
--   TO authenticated
--   USING (true);

-- 4c. anon — DO NOT add anon policies. If you really need anon access,
--     justify it in the PR description AND in a comment here.

COMMIT;
