---
phase: 260618-iwx-cross-swarm-noise-rules
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/lib/swarms/registry.ts
  - web/lib/swarms/__tests__/registry.test.ts
  - web/lib/inngest/functions/classifier-llm-rules-seed.ts
  - web/lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts
  - supabase/migrations/20260618_crossswarm_noise_shared_scope.sql
  - docs/agentic-pipeline/stage-1-regex.md
autonomous: true
requirements: [CROSS-SWARM-NOISE-01]
user_setup: []

must_haves:
  truths:
    - "loadSwarmNoiseCategories returns a swarm's own rows UNIONed with shared '*' rows, with an own-swarm row shadowing the shared row of the same category_key"
    - "An own-swarm shadow row with enabled=false removes (opts out of) a shared category from the resolved list"
    - "Re-firing classifier/llm-rules-seed.run does NOT reset info-routing's promoted llm:*:high rules back to candidate"
    - "info-routing's 7 junk categories are scoped swarm_type='*' so debtor-email + sales-email see them in their Stage-1 closed list"
    - "A cross-swarm telemetry view aggregates human_verdict by rule_key across all swarms, readable by service_role"
    - "readWhitelist stays per-swarm (no '*' union) — promotion never leaks across swarms"
  artifacts:
    - path: "web/lib/swarms/registry.ts"
      provides: "Union + JS-side precedence + JS-side enabled filter in loadSwarmNoiseCategories"
      contains: "in(\"swarm_type\""
    - path: "supabase/migrations/20260618_crossswarm_noise_shared_scope.sql"
      provides: "Re-scope 7 junk cats to '*' + cross-swarm telemetry view"
      contains: "classifier_rule_telemetry_crossswarm"
    - path: "web/lib/inngest/functions/classifier-llm-rules-seed.ts"
      provides: "ignoreDuplicates:true on the classifier_rules upsert (DO NOTHING)"
      contains: "ignoreDuplicates"
    - path: "docs/agentic-pipeline/stage-1-regex.md"
      provides: "Shared-scope ('*') + per-swarm-gate note"
      contains: "Shared scope"
  key_links:
    - from: "web/lib/swarms/registry.ts"
      to: "swarm_noise_categories"
      via: ".in('swarm_type', [swarmType, '*'])"
      pattern: "in\\(\"swarm_type\""
    - from: "web/lib/inngest/functions/classifier-llm-rules-seed.ts"
      to: "loadSwarmNoiseCategories"
      via: "seeds per-consuming-swarm candidate rules for the now-unioned shared cats"
      pattern: "loadSwarmNoiseCategories"
---

<objective>
Give `swarm_noise_categories` a shared scope via a reserved `swarm_type='*'` sentinel so info-routing's junk-mail categories stop being siloed and immediately benefit verkoop@ (sales-email) + debiteuren@ (debtor-email). The runtime union lives in exactly one place — `loadSwarmNoiseCategories` — with JS-side own-swarm precedence and a JS-side enabled filter that doubles as per-swarm opt-out. The per-swarm PROMOTION gate is preserved untouched: `readWhitelist` does NOT union `'*'`, and the candidate-seed flow scopes candidate rules to the consuming swarm_type.

Purpose: Solve the "~92% of verkoop mail lands in `unknown`" pain (memory `cross-swarm-noise-rules`) by sharing category DEFINITIONS while keeping auto-archive trust strictly per-swarm (Wilson-CI gate earned independently per swarm).

Output: registry union, seed idempotency fix, one migration (re-scope 7 cats + cross-swarm view), regression tests, and a stage-1-regex.md doc note.
</objective>

<execution_context>
@/Users/nickcrutzen/.claude/get-shit-done/workflows/execute-plan.md
@/Users/nickcrutzen/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260618-iwx-cross-swarm-noise-rules-shared-scope-op-/260618-iwx-CONTEXT.md
@.planning/quick/260618-iwx-cross-swarm-noise-rules-shared-scope-op-/260618-iwx-RESEARCH.md
@CLAUDE.md

<interfaces>
<!-- Extracted from the codebase — executor needs these; no exploration required. -->

From web/lib/swarms/registry.ts — current loader (THE single chokepoint, ~25 readers):

  loadSwarmNoiseCategories(admin, swarmType) currently does:
    .from("swarm_noise_categories").select("*")
    .eq("swarm_type", swarmType)
    .eq("enabled", true)                      // <-- MOVE this filter to JS (Pitfall A)
    .order("display_order", { ascending: true })
  then caches under swarmType (CATEGORIES_CACHE = Map<string,{value,expires}>, 60s TTL),
  returns [] on null, last-known-good on error. __resetCacheForTests() clears it.
  '*' is NEVER passed as a swarmType, so no extra cache entry is created.

From web/lib/swarms/types.ts — SwarmNoiseCategoryRow fields:
  swarm_type, category_key, display_label, outlook_label|null, action (SwarmAction),
  swarm_dispatch|null, display_order (number), enabled (boolean), requires_orchestration?:boolean

From web/lib/classifier/cache.ts — readWhitelist (LEAVE UNCHANGED; union here is UNSAFE):
    .from("classifier_rules").select("rule_key")
    .eq("swarm_type", swarmType).eq("status", "promoted")

From web/lib/inngest/functions/classifier-llm-rules-seed.ts — the upsert to fix:
    .from("classifier_rules").upsert(
      { swarm_type: sw.swarm_type, rule_key, kind:"agent_intent", status:"candidate", n:0, agree:0, ... },
      { onConflict: "swarm_type,rule_key" }    // <-- ADD ignoreDuplicates: true
    )
  Seed already filters `c.category_key !== "unknown" && c.enabled !== false` and reads through
  loadSwarmNoiseCategories — so after Task 1 it auto-seeds the shared cats per CONSUMING swarm,
  scoped to that swarm (NOT '*'). This IS the per-swarm gate.

From supabase/migrations/20260428_classifier_rule_telemetry.sql — view pattern to mirror:
  create or replace view public.classifier_rule_telemetry as
  select ar.swarm_type, ar.rule_key,
    count(*)::int as n,
    count(*) filter (where ar.human_verdict in ('approved','edited_minor'))::int as agree
  from public.agent_runs ar
  where ar.rule_key is not null and ar.human_verdict is not null
  group by ar.swarm_type, ar.rule_key;
  grant select on public.classifier_rule_telemetry to service_role;
  (Confirms agent_runs.swarm_type / rule_key / human_verdict all exist.)
</interfaces>
</context>

<scope_boundaries>
OUT OF SCOPE (state in SUMMARY; do NOT implement):
- Outlook-delta verdict harvesting (Phase 112.5 Graph-delta / Phase 117 intent-label). Telemetry + promotion read `agent_runs.human_verdict` source-agnostically so that work feeds the gates with zero rework here — that is the only seam to honor.
- Sharing the 8 AP-noise cats (already duplicated per swarm; later migration).
- Sharing `classifier_rules` ROWS themselves. Only category DEFINITIONS are shared; rules stay per-swarm.
- Any `'*'` union in `readWhitelist` / `web/lib/classifier/cache.ts` — INVIOLABLE per-swarm promotion gate.
- Codegen — noise categories are not codegen'd (RFC stage-1-regex.md:89). No `*.generated.ts` change.
- New tables — opt-out is a shadow row in the existing (already-RLS'd) `swarm_noise_categories`.
</scope_boundaries>

<ops_step>
POST-DEPLOY (manual, NOT code): after the migration is applied to the remote, RE-FIRE the `classifier/llm-rules-seed.run` Inngest event once (Inngest dashboard or `inngest.send`). This mints per-swarm `llm:{cat}:high` status='candidate' rules for debtor-email + sales-email across all 7 newly-shared cats, scoped to each consuming swarm (NOT '*'). Safe to re-run thanks to Task 2's `ignoreDuplicates` fix — info-routing's 3 promoted rules survive. Document this as a run-step in the SUMMARY; do NOT add a cron or auto-fire.
</ops_step>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Union shared categories in loadSwarmNoiseCategories (JS precedence + JS enabled filter)</name>
  <files>web/lib/swarms/registry.ts, web/lib/swarms/__tests__/registry.test.ts</files>
  <behavior>
    - Own-swarm + shared: query returns rows for `[swarmType, '*']`; result includes a swarm's own rows AND shared '*' rows whose category_key is not owned by the swarm.
    - Precedence: when an own-swarm row and a '*' row share the same category_key, the OWN row wins (shadows the shared one) — exactly one row per category_key in the output.
    - Opt-out via shadow: an own-swarm row with `enabled=false` and the same category_key as a shared `enabled=true` '*' row -> that category_key is ABSENT from the output (Pitfall A: the enabled filter runs in JS AFTER precedence, so the opt-out row is fetched and can shadow).
    - A shared '*' row with `enabled=false` (no own shadow) -> absent from output.
    - Ordering by display_order preserved; cache still keyed by swarmType; last-known-good on error unchanged; '*' is never used as a cache key.
  </behavior>
  <action>
    In `loadSwarmNoiseCategories`, replace `.eq("swarm_type", swarmType)` with `.in("swarm_type", [swarmType, "*"])` and REMOVE `.eq("enabled", true)` from the DB query (per RESEARCH Pitfall A: keeping it at the DB makes opt-out shadow rows un-fetchable, silently breaking opt-out). Keep `.order("display_order", { ascending: true })`.

    After fetching, resolve in JS BEFORE caching: group rows by `category_key`; for each key pick the own-swarm row (`row.swarm_type === swarmType`) if present, else the `'*'` row (own shadows shared). THEN drop any key whose winning row has `enabled === false`. Re-sort the surviving rows by `display_order` ascending (the union may interleave). Cache the resolved per-swarm list under `swarmType` exactly as today. Do not introduce a `'*'` cache entry. Leave the error / last-known-good branch and the cache TTL untouched.

    Add tests in registry.test.ts following the existing `makeAdmin`/`sampleCategory` harness. NOTE: the existing categories mock chain ends at `.order(...)`; add `.in(...)` to that builder as `vi.fn().mockReturnThis()` so the chain still resolves at `.order`. Reuse `sampleCategory(swarm_type, key, order)` (already sets `enabled:true`); build opt-out/disabled rows via `{ ...sampleCategory(...), enabled: false }` or a distinct `display_label`. Cover all five behaviors above under a `describe("Cross-swarm shared scope ...")`. Assert exactly one row per category_key and that the own-swarm row's display_label/action win over the '*' row of the same key.
  </action>
  <verify>
    <automated>cd web && npx vitest run lib/swarms/__tests__/registry.test.ts</automated>
  </verify>
  <done>registry.test.ts passes including the 5 new cross-swarm cases (union, precedence, opt-out shadow, disabled-shared, ordering). `loadSwarmNoiseCategories` uses `.in("swarm_type", [swarmType, "*"])`, has NO `.eq("enabled", ...)` at the DB, and applies precedence + enabled filter in JS. readWhitelist / cache.ts UNCHANGED.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fix seed-flow promoted-status clobber (ignoreDuplicates) + regression test</name>
  <files>web/lib/inngest/functions/classifier-llm-rules-seed.ts, web/lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts</files>
  <behavior>
    - Idempotent re-fire: every `classifier_rules` upsert is called with `{ onConflict: "swarm_type,rule_key", ignoreDuplicates: true }` so an existing row (incl. a promoted info-routing rule) is left untouched (DO NOTHING) — never reset to status='candidate'.
    - Existing seeding behavior unchanged: still seeds `llm:{cat}:high` for every (enabled swarm x enabled cat != 'unknown'); still skips 'unknown' and disabled categories; payload still `status='candidate', kind='agent_intent', n=0, agree=0`.
  </behavior>
  <action>
    In `classifier-llm-rules-seed.ts`, change the upsert options from `{ onConflict: "swarm_type,rule_key" }` to `{ onConflict: "swarm_type,rule_key", ignoreDuplicates: true }`. This makes supabase-js emit `ON CONFLICT DO NOTHING` (the file header already CLAIMS this contract; the code currently contradicts it, defaulting to DO UPDATE which would reset info-routing's 3 promoted `llm:*:high` rules to candidate on re-fire). No other logic change.

    In the test file, update the existing assertion `expect(call.opts).toEqual({ onConflict: "swarm_type,rule_key" })` to include `ignoreDuplicates: true`. Add ONE regression test asserting that for an info-routing swarm with a promoted-family category (e.g. `marketing_newsletter`), the upsert opts carry `ignoreDuplicates: true` — documenting that re-fire cannot demote a promoted row. Use the existing hoisted `h.catsQueue` / `h.swarmsData` harness; no new mock infrastructure.
  </action>
  <verify>
    <automated>cd web && npx vitest run lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts</automated>
  </verify>
  <done>seed test passes; every upsert opt object equals `{ onConflict: "swarm_type,rule_key", ignoreDuplicates: true }`; regression test asserts promoted-status preservation intent. Source file emits DO NOTHING.</done>
</task>

<task type="auto">
  <name>Task 3: Migration — re-scope 7 junk cats to '*' + cross-swarm telemetry view + doc note</name>
  <files>supabase/migrations/20260618_crossswarm_noise_shared_scope.sql, docs/agentic-pipeline/stage-1-regex.md</files>
  <action>
    Create `supabase/migrations/20260618_crossswarm_noise_shared_scope.sql` with TWO statements (header comment referencing this quick task + CONTEXT/RESEARCH):

    (1) Re-scope in place (NOT additive copies — avoids duplicate-row drift; info-routing keeps seeing them via the Task-1 union):
    `UPDATE public.swarm_noise_categories SET swarm_type='*' WHERE swarm_type='info-routing' AND category_key IN ('spam','marketing_newsletter','cold_sales_outreach','auto_dealer_spam','unsolicited_job_application','survey_feedback_invite','automated_security_report');`
    PK is `(swarm_type, category_key)`, no FK, no `'*'` rows yet -> no conflict. (If the table has an `updated_at` column, also set `updated_at=now()`; verify against live schema first — it is non-essential to the re-scope, so omit if absent rather than guess.)

    (2) Cross-swarm telemetry VIEW (visibility only — promotion stays per-swarm), mirroring `20260428_classifier_rule_telemetry.sql` but WITHOUT `swarm_type` in GROUP BY so it pools per `rule_key`, plus a `swarm_count`. MUST use `WITH (security_invoker = true)` (CLAUDE.md) and `GRANT SELECT ... TO service_role`:
    `CREATE OR REPLACE VIEW public.classifier_rule_telemetry_crossswarm WITH (security_invoker = true) AS SELECT ar.rule_key, COUNT(*)::int AS n_total, COUNT(*) FILTER (WHERE ar.human_verdict IN ('approved','edited_minor'))::int AS agree_total, COUNT(DISTINCT ar.swarm_type)::int AS swarm_count FROM public.agent_runs ar WHERE ar.rule_key IS NOT NULL AND ar.human_verdict IS NOT NULL GROUP BY ar.rule_key;` then `GRANT SELECT ON public.classifier_rule_telemetry_crossswarm TO service_role;`. Source-agnostic on `human_verdict` (honors the future Outlook-delta seam). No new table; no RLS-enable statement (it is a view, not a table) — the `security_invoker` flag is the requirement.

    In `docs/agentic-pipeline/stage-1-regex.md`, add a short subsection after the "Source-of-truth invariant" block (after the line ending "...no hand-edited generated file.", before "### Inherited AP-noise rule disposition"). Title it "### Shared scope (`swarm_type='*'`) + per-swarm promotion gate". State: (a) a reserved `swarm_type='*'` row is a SHARED noise category that unions into EVERY swarm's call-time closed list via `loadSwarmNoiseCategories` (`.in('swarm_type',[swarm,'*'])`, JS own-row-shadows-shared precedence, JS enabled filter); (b) an own-swarm row with `enabled=false` and the same `category_key` OPTS OUT of a shared category (shadow row, no new table); (c) promotion remains strictly PER-SWARM — `readWhitelist` deliberately does NOT union `'*'`; each swarm earns auto-archive via its own Wilson-CI gate on per-swarm `classifier_rules`; a `'*'` promoted row would violate the gate and is forbidden; (d) info-routing's 7 junk cats are shared as of `20260618_crossswarm_noise_shared_scope.sql`. Keep it tight (one paragraph + a 3-bullet list). RFC wins over code, so this note is load-bearing.
  </action>
  <verify>
    <automated>cd web && npm run check:supabase 2>&1 | tail -5; grep -q "classifier_rule_telemetry_crossswarm" /Volumes/Developer/aw-cross-swarm-noise/supabase/migrations/20260618_crossswarm_noise_shared_scope.sql && grep -q "security_invoker" /Volumes/Developer/aw-cross-swarm-noise/supabase/migrations/20260618_crossswarm_noise_shared_scope.sql && grep -q "Shared scope" /Volumes/Developer/aw-cross-swarm-noise/docs/agentic-pipeline/stage-1-regex.md && echo GATES_OK</automated>
  </verify>
  <done>Migration file exists with the re-scope UPDATE (7 cats -> '*') + the cross-swarm view (`security_invoker=true` + service_role GRANT). `npm run check:supabase` stays green (0 ERROR-level advisors). stage-1-regex.md has the shared-scope + per-swarm-gate note. GATES_OK printed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| registry loader -> Stage-1 closed list | Shared `'*'` rows enter every swarm's call-time category list; a malformed/over-broad shared row would widen archiving scope across all swarms. |
| seed flow -> classifier_rules | A bad upsert option (DO UPDATE) could silently demote earned promoted rules, removing a swarm's auto-archive gate. |
| new view -> agent_runs | Cross-swarm read of human_verdict; must not expose rows under a more-privileged role than the caller. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-iwx-01 | Elevation of Privilege | `classifier_rule_telemetry_crossswarm` view | mitigate | `WITH (security_invoker = true)` so the caller's RLS applies (CLAUDE.md), service_role-only GRANT; `npm run check:supabase` gates ERROR-level advisors. |
| T-iwx-02 | Tampering | `readWhitelist` promotion gate | mitigate | Leave `cache.ts` unchanged — NO `'*'` union. A `'*'` promoted row is forbidden; candidate rules stay scoped to the consuming swarm. Test T1 asserts cache.ts untouched. |
| T-iwx-03 | Tampering | seed upsert demoting promoted rows | mitigate | `ignoreDuplicates: true` (DO NOTHING); Task 2 regression test pins the opt object. |
| T-iwx-04 | Information Disclosure | shared '*' category leaking unintended archive scope | accept | Per-swarm gate keeps everything in observe (status='predicted') until earned; per-swarm opt-out (shadow row) is the safety valve. Bounded risk per CONTEXT "Blast radius" decision. |
| T-iwx-SC | Tampering | npm/pip/cargo installs | accept | No new packages installed in this plan; no package-manager install tasks. |
</threat_model>

<verification>
- `cd web && npx vitest run lib/swarms/__tests__/registry.test.ts lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts` — both green.
- `cd web && npx tsc --noEmit` — 0 type errors (loader return shape unchanged; `SwarmNoiseCategoryRow[]`).
- `cd web && npm run check:supabase` — 0 ERROR-level advisors (new view is security_invoker).
- `grep -n "in(\"swarm_type\"" web/lib/swarms/registry.ts` — union present.
- `grep -c "'\\*'" web/lib/classifier/cache.ts` — readWhitelist still has NO `'*'` union (cache.ts unchanged; per-swarm gate intact).
- Migration contains the 7-cat UPDATE and the `security_invoker` view + service_role GRANT.
</verification>

<success_criteria>
- `loadSwarmNoiseCategories` unions `[swarmType, '*']`, applies own-row-shadows-shared precedence + enabled filter in JS, caches per swarmType. 5 new tests pass.
- `classifier-llm-rules-seed` upserts with `ignoreDuplicates: true`; promoted rules survive re-fire; regression test passes.
- Migration re-scopes the 7 junk cats to `'*'` and creates the cross-swarm telemetry view (security_invoker + service_role GRANT); `check:supabase` green.
- `readWhitelist` / `cache.ts` UNCHANGED — per-swarm promotion gate inviolable.
- No new table, no codegen, no `*.generated.ts` change.
- stage-1-regex.md documents the shared-scope + per-swarm-gate mechanism (RFC wins over code).
- SUMMARY records the OUT-OF-SCOPE list and the post-deploy ops step (re-fire `classifier/llm-rules-seed.run`).
</success_criteria>

<output>
Create `.planning/quick/260618-iwx-cross-swarm-noise-rules-shared-scope-op-/260618-iwx-SUMMARY.md` when done.
</output>
