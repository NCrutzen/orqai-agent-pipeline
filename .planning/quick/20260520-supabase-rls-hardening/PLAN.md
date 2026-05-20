---
slug: supabase-rls-hardening
status: in-progress
date: 2026-05-20
---

# Supabase RLS hardening

Fix Supabase advisor ERROR-level findings and add guardrails so future tables created by Claude (or anyone) stay locked by default.

## Findings (live advisor, 2026-05-20)

ERROR-level (4):
1. `sales.kb_chunks` — RLS disabled. Exposed via PostgREST (`db_schema` includes `sales`).
2. `email_pipeline.conversation_context` — RLS disabled. Created 2026-05-19, post-dates advisor snapshot.
3. `public.agent_runs_stuck_classifying_with_kanban_count` — SECURITY DEFINER view (bypasses RLS).
4. `public.classifier_rule_telemetry` — SECURITY DEFINER view.

WARN-level addressed opportunistically:
- `public.learnings` — anon SELECT+INSERT with `qual=true` (rls_policy_always_true). User confirmed: tighten.
- `public.dashboard_snapshots` — anon SELECT with `qual=true`. User confirmed: tighten.
- Defense-in-depth: revoke anon INSERT/UPDATE/DELETE table grants in all PostgREST-exposed schemas.

## Tasks

1. Write migration `supabase/migrations/20260520_harden_rls.sql`:
   - `ENABLE ROW LEVEL SECURITY` on `sales.kb_chunks` + service-role-only policy.
   - `ENABLE ROW LEVEL SECURITY` on `email_pipeline.conversation_context` + service-role-only policy.
   - `ALTER VIEW ... SET (security_invoker = true)` on both flagged views.
   - `DROP POLICY` permissive anon policies on `learnings` and `dashboard_snapshots`; replace with service-role-only writes (both writers already use service role).
   - `REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA <each exposed schema> FROM anon`.
   - `ALTER DEFAULT PRIVILEGES ... REVOKE INSERT, UPDATE, DELETE ... FROM anon` so future tables in those schemas don't grant anon writes.
2. Apply migration via Management API.
3. Re-fetch advisor; confirm zero ERROR-level findings.
4. Write `supabase/migrations/_template.sql` with mandatory ENABLE RLS + default-deny boilerplate.
5. Update `CLAUDE.md` with "Supabase RLS rules" subsection under "Kritieke Patronen → Supabase".
6. Write `web/scripts/check-supabase-advisors.ts` that calls the advisor API and exits non-zero on any ERROR-level lint. Add as `npm run check:supabase` in `web/package.json`.
7. Commit atomically.

## Verification

- `curl https://api.supabase.com/v1/projects/.../advisors/security` returns no `level=ERROR` lints.
- Smoke-test: anon key can no longer write to `learnings` (`POST` returns 401/403).
- Existing service-role-driven writers (build-kb, debtor-email-coordinator, dashboard-aggregator) continue working — unchanged code path.

## Out of scope

- 23 INFO `rls_enabled_no_policy` findings (tables are already locked since they have RLS + no permissive policies; only service_role can write).
- WARN-level `function_search_path_mutable`, `extension_in_public`, `auth_leaked_password_protection`. Separate hardening pass.
- Removing the `mr-automations:learn` skill anon path — covered by switching writes to service role.
