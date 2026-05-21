---
phase: 74-stage-1-llm-category-classifier-swarm-agnostic-fills-the-mis
plan: 05
status: complete
subsystem: sales-email-ingest
tags: [ingest, zapier, sugarcrm, registry, stage-0, sales-email]
requires:
  - 74-01
  - 74-02
  - 74-03
  - 74-04
provides:
  - "POST /api/automations/sales-email/ingest (SugarCRM → stage-0/email.received)"
  - "public.zapier_tools row tool_id='sales-email-ingest'"
  - "Operator-runnable 24h verification SQL queries (REQ-7 acceptance)"
affects:
  - "web/app/api/automations/sales-email/ingest/route.ts (created)"
  - "supabase/migrations/20260506_phase74_zapier_tools_sales_email_ingest.sql (created — pending operator apply)"
tech-stack:
  added:
    - "zod (already in project) — SugarEmailSchema validation"
  patterns:
    - "shared-secret body-field auth (CLAUDE.md zapier-patterns.md)"
    - "SendFn cast for inngest.send (CLAUDE.md commit dae6276)"
    - "email_pipeline.emails upsert on (source, source_id) for idempotency"
    - "swarm_type / entity derived at ingest BOUNDARY only (D-01 / D-02)"
key-files:
  created:
    - web/app/api/automations/sales-email/ingest/route.ts
    - supabase/migrations/20260506_phase74_zapier_tools_sales_email_ingest.sql
  modified: []
decisions:
  - "Sales-email source IS SugarCRM (not Outlook). Operator confirmed 2026-05-06 the existing 'MR || Sales email analyzer' zap (SugarAI trigger, 1-min poll on Emails module) is the production wiring; step 3 of that zap (previous direct Orq.ai call) is replaced by this Vercel ingest route."
  - "source_mailbox hardcoded to 'verkoop@smeba.nl' inside the route (only sales mailbox in Phase 74 scope; SugarCRM doesn't expose a per-record mailbox-of-receipt field anyway)."
  - "internet_message_id synthesized as 'sugar:<sugar_id>' when SugarCRM doesn't carry an RFC 822 message-id — keeps the column populated and unique without colliding with real RFC 822 ids."
  - "swarm_type='sales-email' and entity=null are literals at the route file ONLY (registry-driven downstream workers never re-hardcode these — REQ-6)."
  - "auth_method='body_field' (the registry's check constraint enum value), per CLAUDE.md zapier-patterns.md: Catch Hooks don't expose request headers reliably in Zapier's field picker."
metrics:
  duration: "~15 minutes"
  completed: 2026-05-06
  tasks_completed: 3
  files_changed: 2
---

# Phase 74 Plan 05: Sales-Email Ingest Route + 24h Verification Summary

**One-liner:** Sales-email gets a production ingest path: SugarCRM → Zapier → `/api/automations/sales-email/ingest` → `stage-0/email.received` (swarm_type='sales-email', entity=null), wired through the existing `zapier_tools` registry; verification queries shipped for the operator to run 24h post-deploy.

## Operator Decision (Task 1, RESOLVED 2026-05-06)

- **Selected option:** option-a (Zapier-driven, production wiring).
- **Designated sales mailbox:** `verkoop@smeba.nl`.
- **Source system:** SugarCRM (NOT Outlook). Existing zap "MR || Sales email analyzer" — SugarAI trigger on Emails module, 1-min polling — already lives in Zapier in Draft state. Step 3 (previously a direct Orq.ai call) is replaced by the new ingest route.
- **Env var:** `SALES_EMAIL_INGEST_WEBHOOK_SECRET` (new; operator sets value in Vercel separately).

## What Shipped

### 1. Ingest route — `web/app/api/automations/sales-email/ingest/route.ts` (268 LOC)

Mirrors debtor-email/ingest's contract for the parts that overlap (auth, idempotent email_pipeline.emails upsert, automation_runs row, stage-0 emit) and accepts a SugarCRM Emails-record payload.

Field mapping (Sugar → canonical):

| SugarCRM field        | Canonical column / event field                 | Notes                                                  |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `id`                  | `email_pipeline.emails.source_id` + `message_id` event field | Sugar's stable record id; used for idempotency.        |
| `name`                | `subject`                                      | Falls back to `"(no subject)"` if absent.              |
| `description`         | `body_text`                                    | Plain text preferred.                                  |
| `description_html`    | `body_html` + body_text fallback (html-stripped) | Used for body_text only when description is empty.   |
| `from_addr_name`      | `sender_name`                                  |                                                        |
| `from_addr_email`     | `sender_email`                                 |                                                        |
| `date_sent` ?? `date_entered` | `received_at`                          | ISO timestamp.                                         |
| `message_id` (Sugar)  | `internet_message_id`                          | Synthesized as `sugar:<sugar_id>` when absent.         |
| (route-local literal) | `source_mailbox = "verkoop@smeba.nl"`          | Only sales mailbox in Phase 74 scope.                  |
| (route-local literal) | `swarm_type = "sales-email"`                   | Phase 74 D-01.                                          |
| (route-local literal) | `entity = null`                                | Phase 74 D-02.                                          |

Acceptance grep checks all GREEN:

```
grep -c 'swarm_type: "sales-email"' route.ts                  → 2 (≥1)
grep -c 'entity: null' route.ts                                → 2 (≥1)
grep -c 'name: "stage-0/email.received"' route.ts              → 1 (==1)
grep -c 'Authorization' route.ts                               → 0 (==0)
```

`tsc --noEmit`: clean for the new route. (Two pre-existing test-file errors in `debtor-email-coordinator.test.ts` and `debtor-email-orchestrator.test.ts` from Phase 70-04 — unrelated, out of scope per executor scope-boundary rule.)

### 2. zapier_tools registry row — `supabase/migrations/20260506_phase74_zapier_tools_sales_email_ingest.sql`

```sql
-- inserts tool_id='sales-email-ingest' with:
--   backend         = 'vercel'
--   pattern         = 'sync'
--   target_url      = 'https://agent-workforce.vercel.app/api/automations/sales-email/ingest'
--   auth_method     = 'body_field'
--   auth_secret_env = 'SALES_EMAIL_INGEST_WEBHOOK_SECRET'
--   auth_field_name = 'auth'
--   input_schema    = (SugarCRM Emails-record subset)
--   on conflict (tool_id) do update set ...
```

**NOT auto-applied to production.** The Supabase Management API token in repo is expired (known blocker — STATE.md "Supabase Management API token expired -- Phase 50 migration apply blocked"). The migration is committed to disk; operator applies via Studio SQL editor OR by providing a fresh `sbp_*` token to the next session.

After apply, verify:

```sql
select tool_id, backend, target_url, auth_method, auth_secret_env, enabled
  from public.zapier_tools
 where tool_id = 'sales-email-ingest';
```

Expected: 1 row, `enabled = true`.

## Operator Action Items (post-merge, before 24h verification)

1. **Apply the migration** to production Supabase (Studio SQL editor or fresh `sbp_*` token).
2. **Set the env var** `SALES_EMAIL_INGEST_WEBHOOK_SECRET` in Vercel for the agent-workforce project (production, preview, dev).
3. **Update the Zapier zap "MR || Sales email analyzer"** Step 3 to:
   - Method: POST
   - URL: `https://agent-workforce.vercel.app/api/automations/sales-email/ingest`
   - Body (JSON): `{"auth": "<value of SALES_EMAIL_INGEST_WEBHOOK_SECRET>", "id": "{{Sugar id}}", "name": "{{Sugar name}}", "description": "{{Sugar description}}", "description_html": "{{Sugar description_html}}", "from_addr_name": "{{Sugar from_addr_name}}", "from_addr_email": "{{Sugar from_addr_email}}", "date_sent": "{{Sugar date_sent}}", "date_entered": "{{Sugar date_entered}}", "message_id": "{{Sugar message_id}}"}`
4. **Publish the zap** (currently Draft).
5. **Record deploy timestamp** as `<deploy_ts>` for the verification queries below.

## 24h Verification SQL (Operator runs against production Supabase)

Run all four checks 24 hours after deploy. REQ-7 is satisfied iff queries 1, 2, 3 return the expected results AND query 4 (static-check grep on the deployed worker) is empty.

### Query 1 — Stage-1 rows exist for all three target mailboxes

```sql
select e.mailbox as source_mailbox, count(*) as stage1_rows
  from public.pipeline_events pe
  join email_pipeline.emails e on e.id = pe.email_id
 where pe.stage = 1
   and pe.created_at > '<deploy_ts>'::timestamptz
   and e.mailbox in (
     'administratie@fire-control.nl',
     'debiteuren@smeba-fire.be',
     'verkoop@smeba.nl'
   )
 group by e.mailbox
 order by e.mailbox;
```

**Expected:** three rows, each with `stage1_rows >= 1`. (REQ-7 acceptance — "+1 stage-1 row per mailbox in 24h".)

### Query 2 — No new-worker-caused failures on the three mailboxes

```sql
select ar.id, ar.error_message, e.mailbox as source_mailbox, ar.created_at
  from public.automation_runs ar
  join email_pipeline.emails e
    on e.id = (ar.result->>'email_id')::uuid
       or (ar.result->>'message_id') = e.source_id
 where ar.status = 'failed'
   and ar.created_at > '<deploy_ts>'::timestamptz
   and e.mailbox in (
     'administratie@fire-control.nl',
     'debiteuren@smeba-fire.be',
     'verkoop@smeba.nl'
   )
   and (ar.error_message ilike '%classifier-screen-worker%'
        or ar.error_message ilike '%stage-1-category-classifier%'
        or ar.error_message ilike '%swarms row not found%'
        or ar.error_message ilike '%swarm_categories%');
```

**Expected:** zero rows. (REQ-7 acceptance — failures NOT caused by the new worker. Pre-existing failures from upstream/unrelated issues are out of scope.)

### Query 3 — LLM dual-write integrity for sales-email

```sql
select count(*) as agent_runs_count
  from public.agent_runs
 where swarm_type = 'sales-email'
   and inngest_run_id is not null
   and created_at > '<deploy_ts>'::timestamptz;
```

**Expected:** `count > 0` — at least one LLM call landed for the sales mailbox in the 24h window. (Sales-email always invokes the LLM because the regex classifier has no sales rules; every sales mail flows through the Stage 1 LLM.)

### Query 4 — Static check: no swarm_type literals leaked into the deployed worker (REQ-6)

```bash
git -C /path/to/agent-workforce grep -E "swarm_type\s*===\s*['\"](sales-email|debtor-email)['\"]" \
  web/lib/inngest/functions/classifier-screen-worker.ts
```

**Expected:** empty output. (Confirms the classifier-screen-worker stays registry-driven across the deploy.)

### Optional spot-check — decision_details shape

Pick one row from Query 1 and inspect `decision_details`:

```sql
select pe.id, e.mailbox, pe.decision, pe.confidence, pe.decision_details
  from public.pipeline_events pe
  join email_pipeline.emails e on e.id = pe.email_id
 where pe.stage = 1
   and e.mailbox = 'verkoop@smeba.nl'
   and pe.created_at > '<deploy_ts>'::timestamptz
 order by pe.created_at desc
 limit 5;
```

**Expected:** `decision_details.regex` set, `decision_details.llm_invoked = true` for sales-email rows; for debtor mailboxes most rows show `regex` matched and `llm_invoked` false.

## Resume Signal

Operator pastes results of queries 1-4 (and optional spot-check). If all green: `REQ-7 verified`. Otherwise: `REQ-7 gaps: <description>` → planner switches to `/gsd-plan-phase --gaps`.

## SPEC REQ-1..REQ-7 Production Status (post-deploy expected matrix)

| REQ   | Source of truth                                                                                              | Status (post-deploy expected)             |
| ----- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| REQ-1 | `orq_agents` row enabled, agent invokable, Studio JSON Schema persisted                                     | Plan 03 + smoke ✓                          |
| REQ-2 | `classifier-screen-worker` registered (retries:0, step.run discipline)                                       | Plan 04 + Inngest dashboard ✓              |
| REQ-3 | Per-mailbox query #1 distribution: debtor mostly regex-hit, sales-email always LLM-invoked                   | 24h verify (query #1 + spot-check)         |
| REQ-4 | Low-confidence coercion exercised in unit tests + observable in production decision_details                  | Plan 04 unit tests ✓ ; production observation in spot-check |
| REQ-5 | `pipeline_events` + `agent_runs` row counts match contract (queries #1 + #3)                                 | 24h verify                                 |
| REQ-6 | Zero swarm_type literals (query #4); 5 sales-email swarm_categories rows (Plan 01 SQL probe)                 | Plan 01 ✓ + 24h re-verify (query #4)        |
| REQ-7 | ≥1 stage-1 row per mailbox in 24h (query #1) AND no failures caused by new worker (query #2)                 | 24h verify (this plan)                     |

## Deviations from Plan

### Adjustments (Rule 2 / 3 — added critical correctness, no architectural change)

**1. [Rule 2 — auth field name in registry] auth_method=`body_field` not `shared_secret_body_field`.**
- **Found during:** Task 3 reading the existing `zapier_tools` migration.
- **Issue:** The plan text used the loose label `'shared_secret_body_field'` for `auth_method`, but the table's CHECK constraint enumerates only `'body_field'` and `'header_bearer'`.
- **Fix:** Used `'body_field'` (the canonical enum value); semantics are identical (shared secret in a body field).
- **Files modified:** `supabase/migrations/20260506_phase74_zapier_tools_sales_email_ingest.sql`.
- **Commit:** 6dbc0b1.

**2. [Rule 2 — wording] "Authorization" string removed from route comments.**
- **Found during:** Task 2 acceptance grep.
- **Issue:** Plan acceptance criterion `grep -c "Authorization" route.ts == 0`. Comments saying "NEVER use Authorization header" violated this even though the route used no header auth.
- **Fix:** Reworded comments to say "NOT a request header" / "NEVER use a request-header auth scheme (Bearer / X-*-Secret style)".
- **Commit:** 92719da.

### Auth Gates

**1. Supabase Management API token expired (pre-existing, STATE.md blocker).**
- **Impact:** Migration not auto-applied. File ships in `supabase/migrations/` and is committed to disk; operator applies via Studio SQL editor or fresh `sbp_*` token.
- **Resolution path:** documented in "Operator Action Items" section above.

### Pre-existing TypeScript Errors (out of scope)

`web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts:440` and `web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts:265` have `TS2345` errors from Phase 70-04 (commit 90f098f). They are unrelated to Phase 74 changes — left to the relevant phase's clean-up plan.

## Self-Check: PASSED

- `web/app/api/automations/sales-email/ingest/route.ts` — FOUND
- `supabase/migrations/20260506_phase74_zapier_tools_sales_email_ingest.sql` — FOUND
- Commit `92719da` (route) — FOUND in `git log`
- Commit `6dbc0b1` (migration) — FOUND in `git log`
- Acceptance greps — all GREEN (see above)
- `tsc --noEmit` — clean for the new route (pre-existing errors unrelated)

## Threat Flags

None — the new route uses the same shared-secret body-field auth pattern already audited for debtor-email; no new attack surface.
