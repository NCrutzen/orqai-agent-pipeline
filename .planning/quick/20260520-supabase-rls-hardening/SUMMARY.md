---
slug: supabase-rls-hardening
status: complete
date: 2026-05-20
---

# Supabase RLS hardening — summary

## Outcome
Supabase security advisor: **0 ERROR, 3 WARN, 23 INFO** (was: 4 ERROR + 31 WARN before this task).

The 3 remaining WARNs are intentional or deferred:
- 2× `extension_in_public` (`vector`, `pg_trgm`) — deferred to `.planning/todos/pending/2026-05-20-move-public-extensions-out.md`. Moving them is moderate-risk; needs its own audit.
- 1× `authenticated_security_definer_function_executable` for `auth_user_project_ids()` — kept by design. RLS policies on `projects`/`project_members` reference it; revoking breaks RLS.

## Live changes (applied via Management API)

### Migration `20260520_harden_rls.sql` (initial pass)
- `sales.kb_chunks` — RLS enabled + service-role-only policy.
- `email_pipeline.conversation_context` — RLS enabled + service-role-only policy.
- `public.agent_runs_stuck_classifying_with_kanban_count` — view set to `security_invoker = true`.
- `public.classifier_rule_telemetry` — view set to `security_invoker = true`.
- `public.learnings` — dropped anon SELECT/INSERT (qual=true) policies; service role + authenticated SELECT only. MCP writes survive (service-role access token).
- `public.dashboard_snapshots` — dropped anon SELECT; service role only (writer + reader both use createAdminClient already).
- Defense-in-depth: revoked anon INSERT/UPDATE/DELETE/TRUNCATE on all existing tables in `public, debtor, sales, email_pipeline, email_insights` and set default privileges so future tables stay revoked.

### Migration `20260520b_advisor_warn_sweep.sql` (WARN sweep)
- Pinned `search_path` on 18 mutable-search-path functions across `public`, `debtor`, `sales`.
- Revoked EXECUTE from anon/authenticated/public on 4 SECURITY DEFINER functions (`add_creator_as_member`, `coordinator_complete_handler`, `label_dashboard_counts`, `rls_auto_enable`) — all called via service role or as triggers, not by anon/authenticated.
- Revoked EXECUTE from anon (kept for authenticated, since RLS policies reference it) on `auth_user_project_ids`.

### Auth config (Management API)
- `password_hibp_enabled: true` — Supabase Auth now blocks compromised passwords against HaveIBeenPwned.

## Future-proofing
- `supabase/migrations/_template.sql` — copy-paste template that enforces ENABLE RLS + service-role policy + no anon writes.
- `CLAUDE.md` Supabase section updated with explicit rules — RLS, anon-write ban, SECURITY DEFINER hygiene, view security_invoker, extensions out of `public`.
- `web/scripts/check-supabase-advisors.ts` + `npm run check:supabase` — hits advisor API, exits non-zero on any ERROR-level lint.
- `scripts/git-hooks/pre-push` + `scripts/install-git-hooks.sh` — pre-push hook that runs `check:supabase`. Installed via `bash scripts/install-git-hooks.sh` (idempotent, run once per clone). Bypass: `git push --no-verify`.

## Deferred (separate todos)
- `.planning/todos/pending/2026-05-20-move-public-extensions-out.md` — move `vector` and `pg_trgm` to `extensions` schema.
- 23 `rls_enabled_no_policy` (INFO) — RLS on, no policy = service-role-only access (already safe today). A future sweep should add explicit deny policies for clarity.

## Verification
```
$ npm run check:supabase
Supabase advisor: 0 ERROR, 3 WARN, 23 INFO. OK.

$ bash .git/hooks/pre-push
[pre-push] Running Supabase advisor check...
Supabase advisor: 0 ERROR, 3 WARN, 23 INFO. OK.
```

## Post-migration impact audit

Question we asked after applying both migrations: *did anything in the codebase break?*
Method: enumerate every Supabase write call (`.insert/.update/.upsert/.delete/.rpc`), classify by client role, then live-check service-role grants against the touched tables/functions. Cross-checked with live REST smoke (service-role positive + anon-key negative).

### Write call sites — codebase-wide
249 write call sites across 99 unique files.

| Bucket | Files | Verdict |
|---|---|---|
| `createAdminClient` (service role) | 67 | Bypasses RLS — unaffected. |
| Raw `@supabase/supabase-js` with `serviceKey`/`SUPABASE_SERVICE_KEY` | 19 | Confirmed service-role key in every file. |
| Server client (authenticated session) | 0 | None. |
| Browser client (authenticated session) | 2 | `run-detail-client.tsx` reads only (the `.delete` is `URL.searchParams.delete`, not Supabase); `create-project-modal.tsx` inserts into `projects` under the unchanged `auth.uid() = created_by` policy. |
| "Other" (no Supabase client) | 11 | 10 are React state setters / URL API; 1 is `crypto.ts` using Node's cipher `.update()`. Zero Supabase writes. |

### Inngest deep-dive (36 functions)

| Bucket | Count |
|---|---|
| `createAdminClient` | 34 |
| No Supabase access (`browserless-keepalive.ts`, `debtor-email-bridge.ts`) | 2 |
| Anon / authenticated | 0 |

RPCs called by Inngest (3 unique), live-checked for `service_role` EXECUTE:
- `coordinator_complete_handler(uuid, boolean)` — ✅ EXECUTE
- `stage0_backfill_candidates(integer)` — ✅ EXECUTE
- `stage0_coverage_24h(text, text)` — ✅ EXECUTE

Tables written by Inngest (31 unique across `public, debtor, email_pipeline`): live-checked — `service_role` has `INSERT + UPDATE + DELETE = true` on every one, including the two newly RLS-locked tables (`email_pipeline.conversation_context`, `public.dashboard_snapshots`).

### Live REST smoke
- Service role: 200 OK with rows on every touched surface (`sales.kb_chunks`, `email_pipeline.conversation_context`, `learnings`, `dashboard_snapshots`, `classifier_rule_telemetry` view).
- Anon key on the same surfaces: 200 `[]` (RLS-denied) or 401 (grant-denied). Anon INSERT into `learnings` — previously allowed by the dropped `qual=true` policy — now `401 permission denied for table`.

### Verdict
**No write path in the codebase is broken.** All backend writes go through service-role clients (RLS bypass, full write grants). The two authenticated-client writes target tables whose policies were not modified. Zero anon writers existed before or after.
