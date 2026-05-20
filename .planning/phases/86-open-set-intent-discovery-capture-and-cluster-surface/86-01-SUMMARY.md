---
phase: 86-open-set-intent-discovery-capture-and-cluster-surface
plan: 01
subsystem: intent-proposals
tags: [data-layer, view, snapshot-table, telemetry, types, tdd]
requires:
  - pipeline_events.decision_details (Phase 85 V3 writes intent_proposal/proposal_reason here)
  - email_pipeline.emails (LEFT JOIN target for subject + sender_email)
provides:
  - public.intent_proposals_v1 (regular VIEW, 10 columns, security_invoker)
  - public.intent_proposal_clusters (snapshot table, RLS, 4 indexes)
  - public.intent_proposal_views (telemetry table, RLS, 2 indexes)
  - web/lib/automations/intent-proposals/types.ts (ProposalRow, ClusterRow, ViewEvent)
affects:
  - none (read-only over pipeline_events; no edits to swarm_intents / swarm_noise_categories / stage-3-dispatcher.ts / Stage 4 handlers)
tech_stack:
  added: []
  patterns:
    - "Regular VIEW + snapshot-table over MATERIALIZED VIEW (drift #2 lock — RLS-compatible, no REFRESH CONCURRENTLY)"
    - "security_invoker=true on public-schema views (Supabase advisor requirement)"
    - "RLS on every new table in PostgREST-exposed schema (supabase/migrations/_template.sql contract)"
    - "Pure-types module — zero runtime imports — for cross-plan contract pinning"
key_files:
  created:
    - supabase/migrations/20260520_phase86_intent_proposals_v1.sql
    - supabase/migrations/20260520_phase86_intent_proposal_clusters.sql
    - supabase/migrations/20260520_phase86_intent_proposal_views.sql
    - web/lib/automations/intent-proposals/types.ts
    - web/lib/automations/intent-proposals/__tests__/view-shape.test.ts
  modified: []
decisions:
  - "View primary table = pipeline_events (NOT coordinator_runs) — Phase 85 spread-conditional emit lives in emitPipelineEvent() at debtor-email-coordinator.ts:329-332; coordinator_runs.decision_details exists but is not written by Phase 85"
  - "Added WITH (security_invoker = true) to the view (not in the plan's verbatim DDL) because CLAUDE.md/Supabase advisor forbids SECURITY DEFINER on public-schema views — minimal Rule 2 deviation"
  - "Wrapped both new-table migrations in BEGIN/COMMIT per supabase/migrations/_template.sql contract — minimal Rule 2 deviation"
  - "ProposalRow.email_id typed as `string | null` (not `string`) because pipeline_events.email_id is uuid NULL — type honesty over plan's draft string-only signature"
  - "Shape-lock tests written GREEN (not RED) because plan's Task 3 <done> requires `tsc clean + tests green`; the RED-via-stub-helper alternative would have broken tsc"
metrics:
  duration_minutes: 18
  completed_at: 2026-05-20T16:50:00Z
  tasks_completed: 3
  files_created: 5
  files_modified: 0
  commits: 3
---

# Phase 86 Plan 01: Intent Proposals Data Layer Summary

Regular SQL view `intent_proposals_v1` over `pipeline_events.decision_details` plus two
RLS-on snapshot/telemetry tables and a pure-types module — the foundation that Plan 02
(cron clustering) and Plan 03 (Bulk Review tab) build on.

## Tasks Completed

| # | Task | Commit | Files |
|---|---|---|---|
| 1 | View migration (`intent_proposals_v1`) | `6adc6051` | `supabase/migrations/20260520_phase86_intent_proposals_v1.sql` |
| 2 | Snapshot table migration (`intent_proposal_clusters`) | `f2fd4f99` | `supabase/migrations/20260520_phase86_intent_proposal_clusters.sql` |
| 3 | Telemetry table + TS types + shape-lock tests | `e5a472a9` | `supabase/migrations/20260520_phase86_intent_proposal_views.sql`, `web/lib/automations/intent-proposals/types.ts`, `web/lib/automations/intent-proposals/__tests__/view-shape.test.ts` |

## Verified Locally

- `npx vitest run lib/automations/intent-proposals/__tests__/view-shape.test.ts` → **4/4 passing** (938ms).
- `npx tsc --noEmit` (full web workspace) → **exit 0**, zero errors.
- `npm ci` ran clean in this worktree (1375 packages, no lock drift).

## Decisions Made

### View primary table = `pipeline_events`

Confirmed via the plan's `<storage_truth>` section (live-verified by orchestrator 2026-05-20):
Phase 85's spread-conditional emit at `debtor-email-coordinator.ts:329-332` sinks
`intent_proposal` + `proposal_reason` into `pipeline_events.decision_details`. The
`coordinator_runs.decision_details` column exists but is **not** written by Phase 85, so
reading from it would silently return zero proposal rows. The view's `WHERE` clause
filters `stage = 3 AND decision_details->>'intent_proposal' IS NOT NULL` so V2 telemetry
rows drop out naturally — no backfill.

### `security_invoker = true` on the view (added vs plan DDL)

Plan DDL omitted this clause. CLAUDE.md Supabase block requires
`WITH (security_invoker = true)` on every view in a PostgREST-exposed schema; otherwise
the Supabase security advisor flags the view as bypassing caller RLS. Added the clause
without altering the projection. **Rule 2 deviation** (critical correctness — would have
flipped the build-time advisor gate red).

### Migrations wrapped in `BEGIN/COMMIT`

`supabase/migrations/_template.sql` wraps every new-table migration in a transaction.
Plan DDL was naked. Added the wrapper to both table migrations (view migration left
unwrapped — `CREATE OR REPLACE VIEW` + GRANT do not need transactional grouping).
**Rule 2 deviation** (matches in-repo standard).

### `ProposalRow.email_id` typed `string | null`

Plan's `<interfaces>` section declared `email_id: string`, but the underlying
`pipeline_events.email_id` is `uuid NULL` (verified in the plan's `<schema_facts>`).
Typing it non-nullable would cause TS lies the moment Plan 02 SELECTs orphan rows.
**Rule 1 deviation** (correctness — the LEFT JOIN test explicitly exercises the
all-NULL orphan case to lock this).

### Shape-lock tests GREEN, not RED

Executor objective asked for "RED tests pinning the view shape", but the plan's
own Task 3 `<done>` requires `tsc clean + tests green`. The only way to write a
RED test for the right reason (e.g. import a not-yet-implemented helper) would
have broken `tsc --noEmit`, failing Task 3's done criterion. Tests are written
as type-shape contract locks via `satisfies` so any Plan 02/03 drift breaks at
type-check time AND at runtime invariant level. The TDD `tdd="true"` marker on
each task is honored by writing the test alongside the code that satisfies it
(the contracts in `types.ts`), not by introducing an artificial RED-then-GREEN
cycle that would force breaking the tsc gate.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 2 — Critical infra] Added `WITH (security_invoker = true)` to the view.**
   - Found during: Task 1 write
   - Reason: Supabase advisor + CLAUDE.md forbid SECURITY DEFINER (the implicit default) on public views.
   - Files: `supabase/migrations/20260520_phase86_intent_proposals_v1.sql`
   - Commit: `6adc6051`

2. **[Rule 2 — Critical infra] Wrapped both table migrations in `BEGIN/COMMIT`.**
   - Found during: Task 2 + Task 3 write
   - Reason: matches `supabase/migrations/_template.sql` standard.
   - Files: clusters + views migrations
   - Commits: `f2fd4f99`, `e5a472a9`

3. **[Rule 1 — Bug / type honesty] `ProposalRow.email_id` widened to `string | null`.**
   - Found during: Task 3 type-write
   - Reason: `pipeline_events.email_id` is `uuid NULL`; non-nullable TS would lie to consumers.
   - Files: `web/lib/automations/intent-proposals/types.ts`, `__tests__/view-shape.test.ts`
   - Commit: `e5a472a9`

### Architectural Changes

None.

## BLOCKING Gate — Live DB Apply + n>=1 Verify

**The three migrations are committed as source-of-truth files but have NOT been
applied to the live Supabase project `mvqjhlxfvtqqubqgdvhz`.** This executor
runs in a sandboxed worktree with no Supabase MCP, no `supabase` CLI, no `psql`,
and no `SUPABASE_ACCESS_TOKEN` available (env file in the worktree has
`SUPABASE_SERVICE_ROLE_KEY` only, which cannot execute DDL via PostgREST).

The plan's `<verify>` block prescribes:

```
mcp__supabase__apply_migration project_id=mvqjhlxfvtqqubqgdvhz
mcp__supabase__execute_sql query="SELECT count(*) FROM public.intent_proposals_v1;"
# n=0 is a BLOCKING ESCALATION — see plan Task 1 verify notes
```

Neither step has been run. Per the plan's deviation_rules block:

> If the view returns n=0 after migration apply, STOP and escalate. Do not
> write a SUMMARY.md claiming success.

This SUMMARY does NOT claim n>=1 success — it claims the file-level artifacts
+ types + tests + commits are done, and flags the live-apply step as the next
required action. The orchestrator (or a follow-up agent with MCP tools) must:

1. Run `mcp__supabase__apply_migration` for each of the three SQL files.
2. Run the five `<verify>` SELECTs in Task 1 (count, column shape, filter
   sanity, live sample, ranked-top sanity).
3. If `count(*) >= 1` and column shape matches: this plan is fully done.
4. If `count(*) = 0`: ESCALATE per plan (root cause = wrong primary table,
   broken Phase 85 V3 emit, or no Stage 3 traffic in window).

This is a **`human-action` checkpoint** (infra/auth gate, not a bug): the
migrations cannot be applied from this sandbox.

## View Column Order (for Plan 02 positional SELECTs)

The view projection in source order, matching `ProposalRow` exactly:

```
1.  pipeline_event_id   uuid          (pipeline_events.id)
2.  email_id            uuid NULL     (pipeline_events.email_id)
3.  swarm_type          text          (pipeline_events.swarm_type)
4.  proposal_label      text          (decision_details->>'intent_proposal', never NULL per WHERE)
5.  proposal_reason     text NULL     (decision_details->>'proposal_reason')
6.  intent_version      text NULL     (decision_details->>'intent_version')
7.  ranked_top_intent   text NULL     (decision_details->'ranked'->0->>'intent')
8.  created_at          timestamptz   (pipeline_events.created_at)
9.  subject             text NULL     (email_pipeline.emails.subject via LEFT JOIN)
10. sender_email        text NULL     (email_pipeline.emails.sender_email via LEFT JOIN)
```

## Known Stubs

None. The cluster table is intentionally empty (Plan 02 cron fills it). The
telemetry table is intentionally empty (Plan 03 UI tab open fills it). Neither
empty state is a stub — they are documented post-apply states.

## Threat Flags

None. All new surface is server-side / RLS-gated; no new network endpoint;
read-only over an existing trust boundary (`pipeline_events`).

## TDD Gate Compliance

Plan declares `type: execute` (not `type: tdd`), so the plan-level RED/GREEN/REFACTOR
gate does not apply. Per-task `tdd="true"` is honored by co-shipping the shape-lock
test with the contract module (rationale documented above under "Shape-lock tests
GREEN, not RED").

## Self-Check: PARTIAL

**FOUND (file-level):**
- `supabase/migrations/20260520_phase86_intent_proposals_v1.sql`
- `supabase/migrations/20260520_phase86_intent_proposal_clusters.sql`
- `supabase/migrations/20260520_phase86_intent_proposal_views.sql`
- `web/lib/automations/intent-proposals/types.ts`
- `web/lib/automations/intent-proposals/__tests__/view-shape.test.ts`
- Commits: `6adc6051`, `f2fd4f99`, `e5a472a9` (verified via `git log --oneline`)
- vitest: 4/4 passing
- tsc --noEmit: exit 0

**MISSING (DB-level):**
- Live apply of 3 migrations against project `mvqjhlxfvtqqubqgdvhz` (no MCP/CLI available)
- Live `SELECT count(*) FROM public.intent_proposals_v1` ≥ 1 verification
- Live column-shape `information_schema.columns` verification
- Live `intent_proposal_clusters` + `intent_proposal_views` schema verification
- Live RLS policy + index verification

See the BLOCKING Gate section above for the resolution path.
