---
phase: 132-forward-side-effect-bulk-review-v9-7-p2
plan: 04
status: complete
completed: 2026-06-18
requirements: [FWD-03, FWD-08]
---

# 132-04 SUMMARY — apply migration + validation gate

## Outcome

Migration `20260618c_phase132_forward_buckets_and_state.sql` applied to the live
Agent-Workforce database (`mvqjhlxfvtqqubqgdvhz`) via the Supabase MCP
`apply_migration`. All four validation gates green. **No forward bucket was
released** — the phase ships in observe/held mode (D-04).

## Task 1 [checkpoint:human-action] — applied + verified

Operator confirmed the production schema write (PRODUCTION banner shown). Applied,
then verified:

### 1. SELECT verification
```
forward_buckets_seed : {}        -- empty = all buckets HELD (D-04)
rls_enabled          : true
policies             : info_routing_forwards_auth_select:r (authenticated SELECT),
                       info_routing_forwards_service_all:* (service_role ALL)
anon_policies        : 0          -- anon fully denied (no policy)
```
- `info-routing` swarm now carries `dry_run_config -> 'stage_4_forward_buckets' = {}` (jsonb `||` merge preserved the existing per-stage flags).
- `public.info_routing_forwards` exists with `email_id` PK, RLS enabled, service_role FOR ALL + authenticated FOR SELECT, no anon.

### 2. codegen drift gate
```
npm run codegen  -> all 4 generators "already up-to-date — no write"
git diff (generated files only) -> clean
```
The jsonb-map gate needs no codegen (RESEARCH A2 confirmed): drift gate clean.

### 3. Supabase advisor gate
```
npm run check:supabase -> 0 ERROR, 6 WARN, 23 INFO. OK.
```
RLS on the new table passes the ERROR-level lint.

### 4. Full web test suite
```
cd web && npm test
Test Files  337 passed | 23 skipped (360)
Tests       2887 passed | 41 skipped | 95 todo (3023)
0 failed
```

## Decisions covered
- **D-04** — migration seeds an EMPTY held-by-default forward-bucket map; no
  release flip ships in this phase. Releasing a bucket later is a one-line jsonb
  UPDATE (operator action) after the live-smoke observation window.

## Notes
- Migration filename is `20260618c_…` (renamed from the plan's `20260617e` by
  Plan 02 — `20260617e` was already taken by phase-131; content unchanged).
- The phase branch still carries the OLD hardcoded `OUTLOOK_CONNECTION_ID`
  (`56014785`); the env-var fix lives on `main` (PR #112). The live pipeline runs
  off `main` / the deployed app, so this is a branch-merge reconciliation item,
  not a runtime issue.
- Send-scope was confirmed live (2026-06-18 smoke); replyTo is stripped on send
  for the shared mailbox → forwards convey the original sender in the comment
  (D-01 sender-in-comment fallback, baked into Plan 01/02).

## Self-Check: PASSED
- [x] Migration applied to remote
- [x] SELECT confirms held-by-default seed + RLS table (no anon)
- [x] codegen drift clean
- [x] check:supabase 0 ERROR
- [x] full suite green
- [x] no bucket released
