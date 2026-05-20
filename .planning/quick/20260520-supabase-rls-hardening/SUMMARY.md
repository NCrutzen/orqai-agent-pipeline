---
slug: supabase-rls-hardening
status: complete
date: 2026-05-20
---

# Supabase RLS hardening — summary

## Outcome
Supabase security advisor: **0 ERROR**, 31 WARN, 23 INFO (was: 4 ERROR before).

## Live changes (applied via Management API)
- `sales.kb_chunks` — RLS enabled + service-role-only policy.
- `email_pipeline.conversation_context` — RLS enabled + service-role-only policy.
- `public.agent_runs_stuck_classifying_with_kanban_count` — view set to `security_invoker = true`.
- `public.classifier_rule_telemetry` — view set to `security_invoker = true`.
- `public.learnings` — dropped anon SELECT/INSERT (qual=true) policies; service role + authenticated SELECT only. MCP writes survive (use service-role access token).
- `public.dashboard_snapshots` — dropped anon SELECT; service role only (writer + reader both use createAdminClient already).
- Defense-in-depth: revoked anon INSERT/UPDATE/DELETE/TRUNCATE on all existing tables in `public, debtor, sales, email_pipeline, email_insights` and set default privileges so future tables stay revoked too. (`automation` schema didn't exist; loop skips it.)

## Future-proofing
- `supabase/migrations/_template.sql` — copy-paste template that enforces ENABLE RLS + service-role policy + no anon writes.
- `CLAUDE.md` Supabase section updated with explicit RLS-on-every-new-table rule + view security_invoker rule.
- `web/scripts/check-supabase-advisors.ts` + `npm run check:supabase` — hits advisor API, exits non-zero on any ERROR-level lint. Run pre-push or wire into CI.

## Out of scope (left as WARN/INFO)
- 18 `function_search_path_mutable` — functions missing `SET search_path`. Separate sweep.
- 10 `*_security_definer_function_executable` — functions executable by anon/authenticated. Audit each one.
- 2 `extension_in_public` — extensions installed in public schema (move to `extensions`).
- 1 `auth_leaked_password_protection` — Supabase auth setting (project-level, not migration).
- 23 `rls_enabled_no_policy` (INFO) — RLS on, no policy = service-role-only access. Safe today but should add explicit deny policies on the next sweep.

## Verification
```
$ npm run check:supabase
Supabase advisor: 0 ERROR, 31 WARN, 23 INFO. OK.
```
