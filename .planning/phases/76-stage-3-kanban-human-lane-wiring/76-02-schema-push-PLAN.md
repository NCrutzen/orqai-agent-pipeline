---
phase: 76
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified: []
autonomous: false
requirements: []
must_haves:
  truths:
    - "supabase db push has applied 20260507_phase76_swarm_intents_handler_status.sql to the live project"
    - "swarm_intents table in production has handler_status column"
    - "8 placeholder intents flagged in production data"
    - "invoice_copy_request remains 'registered'"
  artifacts:
    - path: "supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql"
      provides: "Already created in Plan 01; this plan APPLIES it"
  key_links:
    - from: "Plan 01 migration file"
      to: "Live Supabase project ref mvqjhlxfvtqqubqgdvhz"
      via: "supabase db push (or mcp__supabase__apply_migration)"
      pattern: "handler_status text NOT NULL"
---

<objective>
[BLOCKING] Apply the Plan 01 migration to the live Supabase project so Stage 3 dispatch logic in Plan 03 reads a column that actually exists. Without this push, TypeScript and unit tests pass against generated types while the runtime SELECT silently returns no `handler_status` field — a class of false-positive verification CLAUDE.md / GSD explicitly guards against.

Purpose: Close the schema-push gap. Phase 76 cannot pass verification without this — the runtime check `intent.handler_status === 'placeholder'` will always be `undefined === 'placeholder' → false`, and EVERY intent will dispatch even when no handler exists, defeating the entire phase.

Output: Migration applied; smoke query confirms column + placeholder seeds present in live data.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md
@supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql

<interfaces>
<!-- Project ref: mvqjhlxfvtqqubqgdvhz (per CLAUDE.md). -->
<!-- Push command: `cd supabase && supabase db push` requires SUPABASE_ACCESS_TOKEN env var. -->
<!-- Alternative: mcp__supabase__apply_migration with project_id=mvqjhlxfvtqqubqgdvhz. -->
<!-- This plan is autonomous: false because supabase db push may prompt interactively. -->
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Apply migration via supabase db push (or MCP apply_migration)</name>
  <what-built>Plan 01 wrote `supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql` (DDL + UPDATE). It is committed but UNAPPLIED.</what-built>
  <how-to-verify>
    1. Confirm the migration file exists:
       `ls supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql`
    2. Apply it. Two options:
       (a) **CLI:** `cd /Users/nickcrutzen/Developer/agent-workforce && supabase db push`
           - Requires `SUPABASE_ACCESS_TOKEN` env var (sbp_*) currently in scope.
           - May prompt to confirm pending migrations.
       (b) **MCP (preferred when CLI prompt blocks):** invoke `mcp__supabase__apply_migration`
           with `project_id=mvqjhlxfvtqqubqgdvhz`, `name=phase76_swarm_intents_handler_status`,
           and `query` set to the file's contents.
    3. Verify the column exists in live data:
       `mcp__supabase__execute_sql` with project_id=mvqjhlxfvtqqubqgdvhz and query:
       ```sql
       SELECT intent_key, handler_status
       FROM public.swarm_intents
       WHERE swarm_type = 'debtor-email'
       ORDER BY intent_key;
       ```
       Expected: 9 rows, exactly 1 row with `handler_status='registered'` (intent_key='invoice_copy_request'), exactly 8 rows with `handler_status='placeholder'`.
    4. Verify CHECK constraint:
       ```sql
       INSERT INTO public.swarm_intents (swarm_type, intent_key, handler_event, handler_status)
       VALUES ('debtor-email', '__test_invalid__', 'noop', 'unknown_status');
       ```
       Expected: ERROR — constraint violation. Then ROLLBACK / do not commit.
  </how-to-verify>
  <resume-signal>
    Type "applied" once the SELECT in step 3 returns the expected 1 registered + 8 placeholder split. If applied returns a different shape, paste the actual rows so the planner can diagnose.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Local migration file → Supabase production | DDL-grade access via SUPABASE_ACCESS_TOKEN; same posture as every prior phase migration |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-76-02-01 | T (Tampering) | swarm_intents UPDATE WHERE clause | mitigate | UPDATE filters on `swarm_type='debtor-email' AND intent_key IN (8 keys)` — cannot affect other swarm rows; transactional (BEGIN/COMMIT) so partial application impossible |
| T-76-02-02 | E (Elevation of privilege) | supabase db push requires SUPABASE_ACCESS_TOKEN | accept | Token is operator-scoped; same posture as Phase 75 migration apply (no new threat surface) |
| T-76-02-03 | D (Denial of service) | ALTER TABLE on swarm_intents (low row count, ~9 rows for debtor-email) | accept | Table is tiny; ALTER ADD COLUMN with DEFAULT is fast (no full table rewrite for small table); no production downtime |
</threat_model>

<verification>
- SELECT against `public.swarm_intents` returns 9 debtor-email rows.
- Exactly 1 row has `handler_status='registered'` (invoice_copy_request).
- Exactly 8 rows have `handler_status='placeholder'`.
- CHECK constraint rejects `handler_status='unknown_status'`.
</verification>

<success_criteria>
- Migration applied to live project (mvqjhlxfvtqqubqgdvhz).
- Schema query confirms 1+8 split.
- Subsequent plans (03, 04, 05) can read `intent.handler_status` and trust it.
</success_criteria>

<output>
After completion, create `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-02-SUMMARY.md` documenting:
- Apply method used (CLI vs MCP)
- Output of the verification SELECT (rendered as a markdown table)
- Confirmation of CHECK constraint enforcement (one-line)
</output>
