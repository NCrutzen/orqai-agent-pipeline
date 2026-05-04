---
phase: 67-stage-2-closure-icontroller-dom-tagging
plan: 02
subsystem: icontroller
tags: [url-helper, migration, schema, tdd]
requires: [67-01]
provides:
  - buildIcontrollerMessageUrl helper (mailbox-list URL builder)
  - debtor.email_labels.icontroller_tag_status column (live in production Supabase)
  - debtor.email_labels.icontroller_msg_id column (live in production Supabase)
  - email_labels_icontroller_tag_status_idx partial index
affects:
  - debtor.email_labels (schema)
key-files:
  created:
    - web/lib/automations/icontroller/url.ts
  modified:
    - web/lib/automations/icontroller/__tests__/url.test.ts
decisions:
  - BASE_URLS duplicated locally in url.ts rather than re-exported from session.ts (no runtime coupling to Browserless connect path; Phase 68 swarms registry will collapse this)
metrics:
  duration_minutes: 2
  completed_date: 2026-05-04
---

# Phase 67 Plan 02: iController URL helper + email_labels schema columns Summary

Shipped the `buildIcontrollerMessageUrl` helper (Option A: mailbox-list URL, not detail URL) with 5 unit tests, and verified the Plan 01 migration is live in production Supabase.

## Tasks

### Task 1 — [BLOCKING] Apply migration to live Supabase

**Status:** schema push verified live in production.

The migration `supabase/migrations/20260504a_email_labels_icontroller_tag_status.sql` was applied to production Supabase (project `mvqjhlxfvtqqubqgdvhz`) via Supabase MCP `apply_migration` BEFORE this executor ran. Verified columns present:

- `debtor.email_labels.icontroller_tag_status text` — nullable, default `'pending'`, CHECK constraint covers 5 values
- `debtor.email_labels.icontroller_msg_id text` — nullable, no default
- `email_labels_icontroller_tag_status_idx` partial index present

No commit was needed for this task in this plan run — the migration file landed in Plan 01 Task 2 (commit history) and was applied out-of-band via MCP. There is intentionally no `chore: db push` commit in this plan; the SQL file already lives on `main`.

### Task 2 — Implement buildIcontrollerMessageUrl helper

**Commits:**
- `c77d2ca` — `feat(67.02): add buildIcontrollerMessageUrl helper`
- `1c01b24` — `test(67.02): cover url helper`

**Behavior:**
- Pure URL builder. Returns `${BASE_URLS[env]}/messages/index/mailbox/{mailbox_id}` per Option A from 67-RESEARCH.md § URL Construction.
- Allowlists `source_mailbox` via `isKnownMailbox` from `web/lib/automations/debtor-email/mailboxes.ts` (T-67-04 mitigation).
- Throws `Error("buildIcontrollerMessageUrl: unknown source_mailbox '...'")` on unknown values.
- `BASE_URLS` is a local `const` rather than a re-export from `session.ts` so the helper has no runtime dependency on the Browserless connect path.

**Tests** (`web/lib/automations/icontroller/__tests__/url.test.ts`, 5 cases all passing):

1. smeba acceptance → `https://test-walkerfire-testing.icontroller.billtrust.com/messages/index/mailbox/4`
2. smeba production → `https://walkerfire.icontroller.eu/messages/index/mailbox/4`
3. sicli-noord production → `.../messages/index/mailbox/15`
4. berki production → `.../messages/index/mailbox/171`
5. unknown source_mailbox → throws matching `/unknown source_mailbox/`

## Verification

- `cd web && npx vitest run lib/automations/icontroller/__tests__/url.test.ts` → `Test Files 1 passed (1) | Tests 5 passed (5)` in 686ms.
- `cd web && npx tsc --noEmit` → exit 0, zero output.
- `test -f web/lib/automations/icontroller/url.ts` → present.
- `grep -q "export function buildIcontrollerMessageUrl" web/lib/automations/icontroller/url.ts` → match.
- `grep -q "messages/index/mailbox" web/lib/automations/icontroller/url.ts` → match.
- Schema columns + partial index verified live via Supabase MCP before this executor ran.

## Deviations from Plan

### Interface contract: prompt vs plan

The execution-context prompt described a slightly different signature (`{ icontroller_mailbox_id, env }` taking a numeric ID and defaulting `env` from `process.env.ICONTROLLER_ENV`). The PLAN.md (canonical) specifies `{ source_mailbox, env }` taking a mailbox email string and looking up the numeric ID via `ICONTROLLER_MAILBOXES`. I followed the plan because:

- The plan's behavior bullets, test scaffold (Wave 0 commit `461e0d4`), threat-model entry T-67-04 ("isKnownMailbox allowlist; throws on unknown"), and downstream callers (Plans 03/05 will pass `source_mailbox` from email rows) all assume the plan's signature.
- The prompt's signature would skip the allowlist check that mitigates T-67-04.

No env-default behavior was added. Callers pass `env` explicitly, matching the plan's behavior bullets. This is recorded as a documented deviation but not a Rule 1-3 auto-fix — it's an interpretation choice between two specs where the plan is authoritative.

### Schema-push commit absence

The plan's Task 1 implies an operator-driven `supabase db push`. In practice the migration was applied via Supabase MCP `apply_migration` before this executor was spawned, so there is no fresh "apply migration" commit in this plan. The SQL file itself is already on `main` from Plan 01 Task 2. Documented above and not treated as a deviation requiring rework.

## Threat Flags

None — the helper does not introduce new network surface. The migration's lock duration risk (T-67-03, accepted) was mitigated by Postgres 15 constant-default behavior; verified live without observable lock contention.

## Self-Check: PASSED

- FOUND: web/lib/automations/icontroller/url.ts
- FOUND: web/lib/automations/icontroller/__tests__/url.test.ts (modified)
- FOUND: c77d2ca (feat commit)
- FOUND: 1c01b24 (test commit)
- VERIFIED: 5/5 vitest passes, tsc clean
