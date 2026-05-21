---
phase: 87
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260521_phase87_stage_3_retro_runs.sql
  - supabase/migrations/20260521_phase87_intent_volume_baselines.sql
autonomous: false
requirements: [REQ-87-02, REQ-87-03]
tags: [phase-87, retro-classify, migrations, rls]
must_haves:
  truths:
    - "stage_3_retro_runs table exists in production with RLS enabled and service-role policy"
    - "intent_volume_baselines table exists in production with RLS enabled and service-role policy"
    - "Both tables survive the npm run check:supabase pre-push hook (no rls_disabled_in_public ERROR)"
    - "(run_id, email_id) UNIQUE constraint on stage_3_retro_runs prevents duplicate inserts on Inngest replay"
  artifacts:
    - path: supabase/migrations/20260521_phase87_stage_3_retro_runs.sql
      provides: "stage_3_retro_runs table + indices + RLS"
      contains: "ENABLE ROW LEVEL SECURITY"
    - path: supabase/migrations/20260521_phase87_intent_volume_baselines.sql
      provides: "intent_volume_baselines table + RLS (D-05 locked schema)"
      contains: "intent_source"
  key_links:
    - from: supabase/migrations/20260521_phase87_stage_3_retro_runs.sql
      to: web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts
      via: "Inngest function inserts via service-role admin client"
      pattern: "stage_3_retro_runs"
    - from: supabase/migrations/20260521_phase87_intent_volume_baselines.sql
      to: "V8.2 / V9.0 / V11.0 readers"
      via: "service-role SELECT (or future authenticated SELECT) for dashboards"
      pattern: "intent_volume_baselines"
---

<objective>
Create the two new tables Phase 87 writes to — `stage_3_retro_runs` (per-email retro verdict, isolated from live pipeline) and `intent_volume_baselines` (D-05 LOCKED schema, snapshot read by V8.2/V9.0/V11.0). Both in `public`, both RLS-enabled per CLAUDE.md Supabase rules. The migrations land via `supabase db push --linked` so live tables exist before Plan 03/04 try to write.

Purpose: Plan 02 (helpers) and Plan 04 (Inngest function) cannot be verified without these tables existing in the linked DB — type-gen alone would give a false-positive green.

Output: Two committed migration files, applied to the linked Supabase project, RLS green under `npm run check:supabase`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/87-retro-classification-and-intent-volume-baseline/87-CONTEXT.md
@.planning/phases/87-retro-classification-and-intent-volume-baseline/87-RESEARCH.md
@CLAUDE.md
@supabase/migrations/_template.sql

<interfaces>
<!-- D-05 LOCKED schema for intent_volume_baselines (CONTEXT.md §D-05) -->
intent_volume_baselines:
  baseline_id   uuid PRIMARY KEY DEFAULT gen_random_uuid()
  swarm_type    text NOT NULL
  window_start  date NOT NULL
  window_end    date NOT NULL
  intent_key    text NOT NULL                                   -- closed-list intent OR proposal cluster centroid
  intent_source text NOT NULL CHECK (intent_source IN ('closed_list','proposal_cluster'))
  count         integer NOT NULL
  share         numeric(5,4) NOT NULL                           -- count / total in window
  created_at    timestamptz NOT NULL DEFAULT now()

<!-- stage_3_retro_runs schema (RESEARCH.md § Code Examples / New table schemas) -->
stage_3_retro_runs:
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid()
  run_id               uuid NOT NULL
  email_id             uuid NOT NULL
  swarm_type           text NOT NULL
  original_top_intent  text
  original_confidence  numeric(4,3)
  new_top_intent       text NOT NULL
  new_confidence       text                                     -- agent V3 returns 'low'|'medium'|'high'
  intent_proposal      text
  proposal_reason      text
  ranked_intents       jsonb NOT NULL
  token_usage_total    int NOT NULL DEFAULT 0
  created_at           timestamptz NOT NULL DEFAULT now()
  UNIQUE(run_id, email_id)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write stage_3_retro_runs migration</name>
  <files>supabase/migrations/20260521_phase87_stage_3_retro_runs.sql</files>
  <action>
    Copy `supabase/migrations/_template.sql` to `supabase/migrations/20260521_phase87_stage_3_retro_runs.sql`. Replace the example table with the `stage_3_retro_runs` schema from RESEARCH.md § "New table schemas". Required elements:
    - `CREATE TABLE IF NOT EXISTS public.stage_3_retro_runs (...)` exactly as the interfaces block above.
    - `CREATE UNIQUE INDEX stage_3_retro_runs_run_email_uniq ON public.stage_3_retro_runs (run_id, email_id);` — protects against replay-id collisions (CLAUDE.md Phase 65 replay-safety pattern; D-02 idempotency).
    - `CREATE INDEX stage_3_retro_runs_run_idx ON public.stage_3_retro_runs (run_id, created_at DESC);` — for end-of-run aggregation scan.
    - `CREATE INDEX stage_3_retro_runs_diff_idx ON public.stage_3_retro_runs (run_id) WHERE original_top_intent IS DISTINCT FROM new_top_intent;` — partial index for the 20-row diff sample query (D-04 step 3).
    - `ALTER TABLE public.stage_3_retro_runs ENABLE ROW LEVEL SECURITY;`
    - `CREATE POLICY stage_3_retro_runs_service_all ON public.stage_3_retro_runs FOR ALL TO service_role USING (true) WITH CHECK (true);`
    - `CREATE POLICY stage_3_retro_runs_auth_select ON public.stage_3_retro_runs FOR SELECT TO authenticated USING (true);` — operator dashboards (V11.0) read via authenticated role.
    - `GRANT SELECT ON public.stage_3_retro_runs TO authenticated; GRANT ALL ON public.stage_3_retro_runs TO service_role;`
    - Wrap everything in `BEGIN; ... COMMIT;`.
    Do NOT add anon policies (CLAUDE.md prohibition).
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260521_phase87_stage_3_retro_runs.sql && grep -q "ENABLE ROW LEVEL SECURITY" supabase/migrations/20260521_phase87_stage_3_retro_runs.sql && grep -q "stage_3_retro_runs_run_email_uniq" supabase/migrations/20260521_phase87_stage_3_retro_runs.sql && grep -q "service_role" supabase/migrations/20260521_phase87_stage_3_retro_runs.sql && ! grep -q "TO anon" supabase/migrations/20260521_phase87_stage_3_retro_runs.sql</automated>
  </verify>
  <done>Migration file exists, RLS enabled, unique index on (run_id, email_id), service_role policy present, no anon policy.</done>
</task>

<task type="auto">
  <name>Task 2: Write intent_volume_baselines migration</name>
  <files>supabase/migrations/20260521_phase87_intent_volume_baselines.sql</files>
  <action>
    Copy `_template.sql` to `supabase/migrations/20260521_phase87_intent_volume_baselines.sql`. Implement the D-05 LOCKED schema from CONTEXT.md verbatim (see interfaces block above). Required elements:
    - `CREATE TABLE IF NOT EXISTS public.intent_volume_baselines (...)` per D-05 schema; add `CHECK (intent_source IN ('closed_list','proposal_cluster'))` constraint (D-05 declares the closed enum).
    - `CREATE INDEX intent_volume_baselines_swarm_window_idx ON public.intent_volume_baselines (swarm_type, window_end DESC);` — primary read pattern from V8.2/V9.0/V11.0 (top-N uncovered intents by recency).
    - `ALTER TABLE public.intent_volume_baselines ENABLE ROW LEVEL SECURITY;`
    - `CREATE POLICY intent_volume_baselines_service_all ON public.intent_volume_baselines FOR ALL TO service_role USING (true) WITH CHECK (true);`
    - `CREATE POLICY intent_volume_baselines_auth_select ON public.intent_volume_baselines FOR SELECT TO authenticated USING (true);` (V11.0 dashboard reads this).
    - `GRANT SELECT ON public.intent_volume_baselines TO authenticated; GRANT ALL ON public.intent_volume_baselines TO service_role;`
    - BEGIN/COMMIT wrapper.
    NO anon policies. NO `SECURITY DEFINER` views.
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260521_phase87_intent_volume_baselines.sql && grep -q "ENABLE ROW LEVEL SECURITY" supabase/migrations/20260521_phase87_intent_volume_baselines.sql && grep -q "intent_source" supabase/migrations/20260521_phase87_intent_volume_baselines.sql && grep -q "CHECK (intent_source" supabase/migrations/20260521_phase87_intent_volume_baselines.sql && grep -q "service_role" supabase/migrations/20260521_phase87_intent_volume_baselines.sql && ! grep -q "TO anon" supabase/migrations/20260521_phase87_intent_volume_baselines.sql</automated>
  </verify>
  <done>Migration file exists, D-05 schema verbatim with intent_source CHECK, RLS enabled, service_role + authenticated SELECT policies, no anon.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: [BLOCKING] Apply migrations to linked Supabase project</name>
  <what-built>Two migration files (Tasks 1 + 2) are committed in `supabase/migrations/`.</what-built>
  <how-to-verify>
    Operator runs from repo root:

    ```
    npx supabase db push --linked
    ```

    Expected: both migrations apply, exit 0. If the linked project is interactive (auth prompt), operator authenticates. After push, verify via Supabase MCP (`list_tables` for `public` schema) or `psql`:

    1. `public.stage_3_retro_runs` exists with the 12 columns from interfaces block.
    2. `public.intent_volume_baselines` exists with the 9 columns from D-05.
    3. RLS enabled on both (Supabase Studio → Table editor → "RLS enabled" indicator, or `\d+ public.stage_3_retro_runs` shows `Row security: enabled`).
    4. Run `npm run check:supabase` from `web/` — must exit 0 with no `rls_disabled_in_public` ERROR.

    If push fails: read the error, fix the migration file, re-push. Do NOT bypass the pre-push hook with `--no-verify`.
  </how-to-verify>
  <resume-signal>Type "migrations applied" once both tables exist in the linked project AND `npm run check:supabase` is green.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Supabase PostgREST exposure | New tables in `public` schema are reachable via anon key unless RLS blocks |
| Service-role writer | Inngest function (Plan 04) writes via service-role admin client |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-87-05 | I (Info Disclosure) | `stage_3_retro_runs` + `intent_volume_baselines` via anon key | mitigate | Both tables RLS-enabled; service_role policy + authenticated SELECT only; NO anon policy. `npm run check:supabase` pre-push hook gates this. |
| T-87-05b | T (Tampering) | Direct INSERT/UPDATE via anon | mitigate | Anon writes globally revoked (migration `20260520_harden_rls`); template enforces this. |
</threat_model>

<verification>
After all three tasks: `npx supabase db push --linked` succeeded, both tables visible in Supabase Studio with RLS, `npm run check:supabase` exits 0.
</verification>

<success_criteria>
- [ ] `supabase/migrations/20260521_phase87_stage_3_retro_runs.sql` committed
- [ ] `supabase/migrations/20260521_phase87_intent_volume_baselines.sql` committed
- [ ] `npx supabase db push --linked` succeeded
- [ ] Both tables exist in linked project with RLS enabled and service_role + authenticated SELECT policies
- [ ] `npm run check:supabase` green (zero ERROR-level advisor lints)
</success_criteria>

<output>
Create `.planning/phases/87-retro-classification-and-intent-volume-baseline/87-01-SUMMARY.md` per template.
</output>
