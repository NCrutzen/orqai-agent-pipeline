-- ============================================================================
-- 20260526c_user_scoped_rls.sql
--
-- Phase 1 Foundation (support-tickets swarm) — AUTH-03 / DATA-scope.
-- Replaces the over-broad USING(true) authenticated SELECT policy on
-- public.support_tickets with a user-scoped policy so end-users can only
-- read their own tickets. Defense-in-depth alongside the explicit
-- .eq('submitter_id', user.id) filter in app/(app)/tickets/page.tsx.
--
-- The admin-view reads support_tickets via createAdminClient() (service_role),
-- so it is NOT affected by this policy change.
-- The service_all policy (service_role FOR ALL) is preserved unchanged.
--
-- submitter_id field holds Supabase user.id (UUID cast to text).
-- auth.uid() returns uuid; cast to text matches the text column type.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS support_tickets_auth_select ON public.support_tickets;
CREATE POLICY support_tickets_user_select ON public.support_tickets
  FOR SELECT TO authenticated
  USING (submitter_id = auth.uid()::text);

COMMIT;
