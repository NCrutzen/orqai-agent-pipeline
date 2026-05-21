---
phase: 87
plan: 04
type: execute
wave: 3
depends_on: [01, 02, 03]
files_modified:
  - web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts
  - web/lib/inngest/events.ts
  - web/lib/inngest/index.ts
  - web/lib/inngest/functions/__tests__/debtor-email-stage-3-retro-classify.test.ts
  - web/lib/automations/debtor-email/__tests__/retro-classify-precondition.test.ts
  - web/lib/automations/debtor-email/__tests__/retro-classify-cache-isolation.test.ts
  - web/lib/automations/debtor-email/__tests__/retro-classify-side-channel-isolation.test.ts
  - web/scripts/run-retro-classify.ts
autonomous: false
requirements: [REQ-87-01, REQ-87-02, REQ-87-06, REQ-87-07]
tags: [phase-87, inngest, retro-classify, side-channel-isolation]
must_haves:
  truths:
    - "Inngest function `debtor-email-stage-3-retro-classify` registered and triggerable via inngest.send"
    - "Precondition gate refuses to run when intent_proposal_clusters has <5 clusters OR last refresh >7d (R-04)"
    - "run_id is generated INSIDE step.run('resolve-run-id', ...) — replay-safe per CLAUDE.md Phase 65 lesson"
    - "inngest.send is called inline (never destructured) — preserves this-binding per CLAUDE.md Phase 65 lesson"
    - "Function writes ONLY to stage_3_retro_runs + intent_volume_baselines — never to agent_runs / coordinator_runs / pipeline_events; never emits <swarm>/predicted (Side-Channel Isolation)"
    - "Retro path calls invokeIntentAgent directly — bypasses the coordinator's findCachedOutput cache (Pitfall 3)"
    - "Per-email step.run returns ONLY the token count — not the full output (Pitfall 4: step-memo bloat)"
    - "CLI script `web/scripts/run-retro-classify.ts` parses {since, until, sample-limit?} and calls inngest.send"
    - "50-email smoke run on production completes with zero step failures and total_tokens > 0"
  artifacts:
    - path: web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts
      provides: "Inngest one-shot retro function"
      exports: ["debtorEmailStage3RetroClassify"]
    - path: web/scripts/run-retro-classify.ts
      provides: "Operator CLI ingress"
      contains: "inngest.send"
    - path: web/lib/inngest/events.ts
      provides: "Event type registration"
      contains: "debtor-email/retro-classify.requested"
  key_links:
    - from: web/scripts/run-retro-classify.ts
      to: web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts
      via: "inngest.send('debtor-email/retro-classify.requested', payload)"
      pattern: "retro-classify.requested"
    - from: web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts
      to: stage_3_retro_runs
      via: "per-email INSERT inside step.run"
      pattern: "stage_3_retro_runs"
    - from: web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts
      to: intent_volume_baselines
      via: "end-of-run aggregateBaseline()"
      pattern: "intent_volume_baselines"
---

<objective>
Wire Plans 01-03 into the durable Inngest function. The function:

1. **Precondition gate** (R-04): refuse to run if `intent_proposal_clusters` for `debtor-email` has <5 rows OR `max(refreshed_at) < now() - 7 days`.
2. **Resolve run_id INSIDE step.run** (CLAUDE.md Phase 65 lock-in).
3. **Select candidates** via `selectCandidates()` (Plan 02) — fails loud if >5000.
4. **Sequential per-email loop**: each `step.run(\`classify-\${email_id}\`)` reconstructs input → calls `invokeIntentAgent` directly (NO coordinator cache path) → INSERTs `stage_3_retro_runs` row → returns ONLY `total_tokens` (Pitfall 4).
5. **Aggregate** end-of-run via `aggregateBaseline()` (Plan 02).
6. **Emit summary** `{ run_id, processed, total_tokens, baseline_rows }` to function output.

**Side-Channel Isolation (NEW for this phase, hard rule):** the function MUST NOT touch live pipeline telemetry — no writes to `agent_runs`, `coordinator_runs`, `pipeline_events`; no `inngest.send` of `<swarm>/predicted`. Writing those would trigger Stage 3.5 dispatch on historical email and create real Outlook drafts / iController taggings. This rule has two dedicated guard tests.

Plus the CLI script + a 50-email smoke checkpoint on production before any full 5000-email run.

Purpose: deliver the executable retro pass with all three architectural locks (replay-safety, side-channel isolation, cache bypass) verified by automated tests, not just code review.

Output: registered Inngest function, CLI ingress, 4 test files green, 50-email smoke logged.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/87-retro-classification-and-intent-volume-baseline/87-CONTEXT.md
@.planning/phases/87-retro-classification-and-intent-volume-baseline/87-RESEARCH.md
@.planning/phases/87-retro-classification-and-intent-volume-baseline/87-VALIDATION.md
@CLAUDE.md
@web/lib/inngest/functions/intent-proposals-refresh.ts
@web/lib/automations/debtor-email/coordinator/invoke-intent.ts
@web/lib/automations/debtor-email/retro/select-candidates.ts
@web/lib/automations/debtor-email/retro/reconstruct-input.ts
@web/lib/automations/debtor-email/retro/aggregate-baseline.ts

<interfaces>
Event payload (web/lib/inngest/events.ts addition):
```typescript
"debtor-email/retro-classify.requested": {
  data: {
    swarm_type: "debtor-email";
    since: string;          // ISO date "YYYY-MM-DD"
    until: string;          // ISO date "YYYY-MM-DD"
    sample_limit?: number;  // optional; default = all <= 5000
    run_id?: string;        // optional; if absent, function generates INSIDE step.run
  };
};
```

CRITICAL CLAUDE.md patterns (NON-NEGOTIABLE):

1. **Replay-safe run_id** (Phase 65 commit dae6276):
   ```typescript
   const run_id = await step.run("resolve-run-id", async () =>
     event.data.run_id ?? crypto.randomUUID()
   );
   // NEVER outside step.run — replay regenerates → orphan rows.
   ```

2. **inngest.send binding** (Phase 65 commit dd2583a):
   ```typescript
   // ❌ NEVER: const send = inngest.send;  send(...)   → TypeError on first call
   // ✅ inline: await inngest.send({ name: "...", data: {...} });
   ```

3. **Side-Channel Isolation** (RESEARCH.md § Architectural Responsibility Map):
   - Forbidden imports/calls inside this function: `mergeToolOutputs`, `updateRun` (anything targeting `agent_runs`), `emitPipelineEvent`, any insert into `coordinator_runs`, any `inngest.send("debtor-email/predicted")` or `<any-swarm>/predicted`.
   - Allowed writes: `stage_3_retro_runs`, `intent_volume_baselines` ONLY.

4. **Cache bypass** (Pitfall 3): call `invokeIntentAgent()` directly. Do NOT route through `debtor-email-coordinator`'s `findCachedOutput` wrapper.

5. **Step-memo discipline** (Pitfall 4): each per-email `step.run` returns ONLY the token count (`number`). Persist the full agent output to Supabase INSIDE the step.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Wave 0 guard tests — precondition + cache-isolation + side-channel-isolation</name>
  <files>
    web/lib/automations/debtor-email/__tests__/retro-classify-precondition.test.ts,
    web/lib/automations/debtor-email/__tests__/retro-classify-cache-isolation.test.ts,
    web/lib/automations/debtor-email/__tests__/retro-classify-side-channel-isolation.test.ts
  </files>
  <behavior>
    Three guard test files written BEFORE the function exists. All initially RED.

    **retro-classify-precondition.test.ts** (R-04):
    - Case 1: when `intent_proposal_clusters` returns 0 rows for `debtor-email`, the precondition step throws with message containing "Phase 87 precondition" and "need ≥5".
    - Case 2: when 5 clusters exist but `max(refreshed_at) = now - 8 days`, throws with message containing "need ≥7 days".
    - Case 3: 5 clusters + refreshed_at within 7 days → passes (no throw).

    **retro-classify-cache-isolation.test.ts** (Pitfall 3):
    - Case 1: import the function module; assert it does NOT import `findCachedOutput` from `web/lib/automations/debtor-email/coordinator/debtor-email-coordinator.ts` (or wherever cache helper lives). Use vitest `expect(moduleSource).not.toContain('findCachedOutput')` after `fs.readFile`.
    - Case 2: assert it imports `invokeIntentAgent` from `coordinator/invoke-intent.ts` directly.

    **retro-classify-side-channel-isolation.test.ts** (NEW hard rule):
    - Case 1: source-grep `retro-classify` function file — must NOT contain literal strings: `agent_runs`, `coordinator_runs`, `pipeline_events`, `/predicted`, `mergeToolOutputs`, `updateRun`, `emitPipelineEvent`.
    - Case 2 (runtime): run the function against a mock with stubbed `invokeIntentAgent` and assert that `admin.from('agent_runs')`, `admin.from('coordinator_runs')`, `admin.from('pipeline_events')` were NEVER called (use vitest spy on the chainable mock factory).
    - Case 3 (runtime): assert `inngest.send` was NEVER called with a `name` matching `/\/predicted$/` during the run.
  </behavior>
  <action>
    Create the 3 test files. Each uses a mocked supabase admin (extend the buildMockAdmin pattern from Plan 02) and a mocked `invokeIntentAgent`. Run `cd web && npx vitest run lib/automations/debtor-email/__tests__/retro-classify-*` — all three MUST fail (function doesn't exist yet). Commit: `test(87-04): add Wave 0 guards (precondition, cache-isolation, side-channel-isolation)`.

    These tests stay RED until Task 2 lands; that is the contract.
  </action>
  <verify>
    <automated>cd web && npx vitest run --no-coverage lib/automations/debtor-email/__tests__/retro-classify-precondition.test.ts lib/automations/debtor-email/__tests__/retro-classify-cache-isolation.test.ts lib/automations/debtor-email/__tests__/retro-classify-side-channel-isolation.test.ts || echo "expected-red"</automated>
  </verify>
  <done>Three test files committed; all currently RED (function not implemented).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement the Inngest function + event registration + function spec</name>
  <files>
    web/lib/inngest/events.ts,
    web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts,
    web/lib/inngest/index.ts,
    web/lib/inngest/functions/__tests__/debtor-email-stage-3-retro-classify.test.ts
  </files>
  <behavior>
    Function spec (`debtor-email-stage-3-retro-classify.test.ts`):
    - Case 1: end-to-end happy path with 3 fixture emails — function processes all 3, INSERTs 3 stage_3_retro_runs rows, aggregates baseline, returns `{ run_id, processed: 3, total_tokens, baseline_rows: {closed_list, proposal} }`.
    - Case 2: token-usage sum equals the sum of per-call `usage.total_tokens` from mocked `invokeIntentAgent` (REQ-87-06).
    - Case 3: re-invoking with the same explicit `run_id` does NOT double-insert (UNIQUE constraint on (run_id, email_id) — assert mock supabase sees `onConflict` or ignore-duplicates handling).
    - Case 4: precondition failure short-circuits — when clusters mock returns 0 rows, NO per-email step runs (assert `invokeIntentAgent` mock was never called).
  </behavior>
  <action>
    1. **Event registration.** Edit `web/lib/inngest/events.ts`: add the event type from the <interfaces> block. No other types touched.

    2. **Function implementation.** Create `web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts`. Pattern-match `web/lib/inngest/functions/intent-proposals-refresh.ts` for shape:
       ```typescript
       export const debtorEmailStage3RetroClassify = inngest.createFunction(
         {
           id: "debtor-email-stage-3-retro-classify",
           retries: 3,
           concurrency: { limit: 1 },  // one retro run at a time
         },
         { event: "debtor-email/retro-classify.requested" },
         async ({ event, step }) => {
           const admin = createAdminClient();

           // R-04 precondition (Task 1 case 3)
           await step.run("precondition-gate", async () => {
             const { data, error } = await admin
               .from("intent_proposal_clusters")
               .select("refreshed_at", { count: "exact" })
               .eq("swarm_type", "debtor-email");
             // throw with the exact messages from Task 1 cases
           });

           // Phase 65 lesson: run_id INSIDE step.run
           const run_id = await step.run("resolve-run-id", async () =>
             event.data.run_id ?? crypto.randomUUID()
           );

           const candidates = await step.run("select-candidates", () =>
             selectCandidates(admin, {
               swarm_type: event.data.swarm_type,
               since: event.data.since,
               until: event.data.until,
               cap: event.data.sample_limit,
             })
           );

           let total_tokens = 0;
           for (const c of candidates) {
             // Per-email step returns ONLY token count (Pitfall 4)
             const tokens = await step.run(`classify-${c.email_id}`, async () => {
               const input = await reconstructInput(admin, c.email_id, run_id);
               const { output, usage } = await invokeIntentAgent(input);
               // Persist full output INSIDE the step.
               // Use upsert with onConflict (run_id, email_id) + ignoreDuplicates:
               // on Inngest replay (W-3 fix) the UNIQUE constraint would otherwise
               // throw 23505 → infinite retry until function fails. Idempotent re-run
               // is required by Plan 04 Task 2 spec Case 3.
               await admin
                 .from("stage_3_retro_runs")
                 .upsert(
                   {
                     run_id,
                     email_id: c.email_id,
                     swarm_type: event.data.swarm_type,
                     original_top_intent: c.original_top_intent,
                     original_confidence: c.original_confidence,
                     new_top_intent: output.ranked[0].intent,
                     new_confidence: output.ranked[0].confidence,
                     intent_proposal:
                       output.intent_version === "2026-05-19.v3"
                         ? output.intent_proposal
                         : null,
                     proposal_reason:
                       output.intent_version === "2026-05-19.v3"
                         ? output.proposal_reason
                         : null,
                     ranked_intents: output.ranked,
                     token_usage_total: usage?.total_tokens ?? 0,
                   },
                   { onConflict: "run_id,email_id", ignoreDuplicates: true },
                 );
               return usage?.total_tokens ?? 0;
             });
             total_tokens += tokens;
           }

           const baseline_rows = await step.run("aggregate-baseline", () =>
             aggregateBaseline(admin, {
               run_id,
               window_start: event.data.since,
               window_end: event.data.until,
               swarm_type: event.data.swarm_type,
             })
           );

           return { run_id, processed: candidates.length, total_tokens, baseline_rows };
         },
       );
       ```

       Hard rules to respect (will be enforced by Task 1 tests):
       - Do NOT import `findCachedOutput` or anything from `debtor-email-coordinator.ts`. Use `invokeIntentAgent` from `coordinator/invoke-intent.ts` directly.
       - Do NOT call `admin.from('agent_runs')`, `admin.from('coordinator_runs')`, `admin.from('pipeline_events')` anywhere.
       - Do NOT call `inngest.send('debtor-email/predicted')` or any `*/predicted` name.
       - Do NOT destructure `inngest.send` anywhere in this file (CLAUDE.md Phase 65).

    3. **Register function.** Add `debtorEmailStage3RetroClassify` to the function list exported by `web/lib/inngest/index.ts` (pattern: how `intentProposalsRefresh` is registered).

    4. **Function spec.** Write `web/lib/inngest/functions/__tests__/debtor-email-stage-3-retro-classify.test.ts` covering the 4 cases above. Mock `selectCandidates`, `reconstructInput`, `invokeIntentAgent`, `aggregateBaseline`, and the Supabase admin builder.

    5. Run all retro tests (Task 1 + Task 2):
       ```
       cd web && npx vitest run --no-coverage lib/automations/debtor-email/__tests__/retro-classify lib/inngest/functions/__tests__/debtor-email-stage-3-retro-classify.test.ts
       ```
       All 4 files MUST be green. If side-channel or cache tests fail, fix the implementation, NOT the tests.

    6. Commit: `feat(87-04): debtor-email-stage-3-retro-classify Inngest function + event registration`.
  </action>
  <verify>
    <automated>cd web && npx vitest run --no-coverage lib/automations/debtor-email/__tests__/retro-classify-precondition.test.ts lib/automations/debtor-email/__tests__/retro-classify-cache-isolation.test.ts lib/automations/debtor-email/__tests__/retro-classify-side-channel-isolation.test.ts lib/inngest/functions/__tests__/debtor-email-stage-3-retro-classify.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>Four spec files green; function registered; `tsc --noEmit` green; no forbidden imports or table writes per grep.</done>
</task>

<task type="auto">
  <name>Task 3: CLI ingress script</name>
  <files>web/scripts/run-retro-classify.ts</files>
  <action>
    Create `web/scripts/run-retro-classify.ts` (note: under `web/scripts/`, NOT repo-root `scripts/` — `tsx` is available in `web/` per `web/package.json`).

    Behaviour:
    - Parse argv flags: `--since YYYY-MM-DD` (required), `--until YYYY-MM-DD` (required), `--sample-limit N` (optional), `--swarm-type` (default `debtor-email`), `--run-id UUID` (optional; for resuming/forcing a specific run id).
    - Validate dates (YYYY-MM-DD shape) and sample-limit (positive int ≤ 5000); print usage and exit 1 on validation error.
    - Print an ENVIRONMENT banner per CLAUDE.md test-first pattern:
      `PRODUCTION -- debtor-email Stage 3 retro classify -- Action: re-classify {N} emails in [{since}, {until}]`
    - Confirmation prompt (yes/no) for sample-limit > 50 OR when no `--sample-limit` was given. Skip prompt if `--yes` flag is passed.
    - Call `inngest.send` INLINE (NEVER destructure — CLAUDE.md Phase 65):
      ```typescript
      const { ids } = await inngest.send({
        name: "debtor-email/retro-classify.requested",
        data: { swarm_type, since, until, sample_limit, run_id },
      });
      console.log(`Inngest event sent: ${ids.join(", ")}`);
      ```
    - Use the shared `inngest` client from `@/lib/inngest/client`. Load env via `dotenv/config` import at top so `INNGEST_*` and `SUPABASE_*` resolve from `web/.env.local`.
    - Print final hint: `View progress in Inngest dashboard: https://app.inngest.com/env/production/runs?event=debtor-email%2Fretro-classify.requested`

    Add a docblock at the top:
    ```
    /**
     * Phase 87 — debtor-email Stage 3 retro classify CLI.
     * Usage: cd web && npx tsx scripts/run-retro-classify.ts --since 2026-04-20 --until 2026-05-20 [--sample-limit 50] [--yes]
     * Triggers Inngest function `debtor-email-stage-3-retro-classify`.
     * See .planning/phases/87-retro-classification-and-intent-volume-baseline/.
     */
    ```
  </action>
  <verify>
    <automated>cd web && test -f scripts/run-retro-classify.ts && grep -q "inngest.send" scripts/run-retro-classify.ts && ! grep -q "const send = inngest" scripts/run-retro-classify.ts && npx tsc --noEmit scripts/run-retro-classify.ts 2>&1 | tail -5</automated>
  </verify>
  <done>CLI script compiles; calls inngest.send inline; banner + confirmation gate present.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: [BLOCKING] 50-email smoke run on production</name>
  <what-built>Tasks 1-3: Inngest function deployed (assumes the operator has merged + Vercel redeployed v8.1 branch per STATE.md Phase 86 status), CLI script ready.</what-built>
  <how-to-verify>
    Operator runs (from `web/`):

    ```
    cd web && npx tsx scripts/run-retro-classify.ts --since 2026-05-13 --until 2026-05-20 --sample-limit 50 --yes
    ```

    Expected behaviour:
    1. Banner prints `PRODUCTION -- debtor-email Stage 3 retro classify -- Action: re-classify ≤50 emails in [2026-05-13, 2026-05-20]`.
    2. CLI exits 0 with an Inngest event id.
    3. Open Inngest dashboard → find the run → it completes within ~5 minutes (50 × ~4s).
    4. Inngest dashboard shows zero failed steps. Precondition gate step passed.
    5. Supabase MCP `execute_sql`:
       ```
       SELECT count(*), sum(token_usage_total) FROM public.stage_3_retro_runs WHERE run_id = '<run_id from event return>';
       ```
       → returns `count=50` (or ≤50 if window had fewer stage=3 events), `sum>0`.
    6. Aggregation rows exist:
       ```
       SELECT count(*) FROM public.intent_volume_baselines
       WHERE swarm_type = 'debtor-email' AND created_at >= now() - interval '10 minutes';
       ```
       → returns `count >= 1` (closed_list rows; proposal_cluster rows depend on Phase 86 clusters).
    7. **Side-channel sanity check** (CRITICAL):
       ```
       -- agent_runs untouched in the window of the retro run:
       SELECT count(*) FROM agent_runs WHERE created_at >= now() - interval '10 minutes' AND status = 'predicted';
       ```
       → must NOT show 50 new rows. If it does, the function violated Side-Channel Isolation; STOP and revert.

    If any of 1-7 fails: capture the failure (Inngest dashboard URL + SQL outputs), do not proceed to full 5000-email run.
  </how-to-verify>
  <resume-signal>Type "smoke green" when steps 1-7 pass. Type "smoke failed: {details}" otherwise.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CLI → Inngest | Untrusted argv; CLI validates dates + sample-limit before send |
| Inngest → Supabase | Service-role admin client; full write authority |
| Inngest → Orq.ai | Outbound LLM call, 45s timeout, `retries: 3` on transient 5xx |
| Retro function → Live pipeline | **MUST NOT CROSS** — Side-Channel Isolation invariant |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-87-01 | D (DoS / Cost runaway) | Orq.ai batch call | mitigate | D-03 5000-email hard cap in `selectCandidates`; `concurrency.limit: 1` on the function; sequential `step.run` (no parallel burst). Token telemetry surfaces overspend immediately. |
| T-87-02 | T (Tampering — live state) | Writes to `agent_runs`/`coordinator_runs`/`pipeline_events` or `*/predicted` emit | mitigate | Source-grep test (`retro-classify-side-channel-isolation.test.ts` case 1) + runtime spy test (case 2) + production sanity SQL in Task 4 step 7. |
| T-87-03 | T (Tampering — comparison validity) | `findCachedOutput` poisoning | mitigate | Source-grep test asserts no `findCachedOutput` import; direct `invokeIntentAgent` call only. |
| T-87-04 | E (Elevation / Auth bypass) | CLI trigger by unauthorised actor | mitigate | CLI requires `SUPABASE_SERVICE_ROLE_KEY` + `INNGEST_*` from `web/.env.local`. No HTTP endpoint exposed. No new public route. |
| T-87-Replay | T (Tampering — orphan rows) | run_id collision under Inngest replay | mitigate | run_id generated INSIDE `step.run("resolve-run-id", ...)`; (run_id, email_id) UNIQUE in Plan 01 DDL. Function spec Case 3 covers re-invoke. |
</threat_model>

<verification>
- All four test files green: precondition, cache-isolation, side-channel-isolation, function spec.
- `npx tsc --noEmit` clean.
- 50-email production smoke: Inngest run completes; `stage_3_retro_runs` populated; `intent_volume_baselines` populated; `agent_runs` untouched.
</verification>

<success_criteria>
- [ ] Event `debtor-email/retro-classify.requested` registered in `events.ts`
- [ ] Function `debtor-email-stage-3-retro-classify` registered in `index.ts`
- [ ] CLI script `web/scripts/run-retro-classify.ts` compiles + calls `inngest.send` inline
- [ ] 4 spec files green (3 guard + 1 function)
- [ ] Source-grep confirms NO `agent_runs` / `coordinator_runs` / `pipeline_events` / `findCachedOutput` / `/predicted` in the function file
- [ ] 50-email production smoke run logged with Inngest run URL + total_tokens
- [ ] Sanity SQL confirms zero new `agent_runs.status='predicted'` rows attributable to the retro run
</success_criteria>

<output>
Create `.planning/phases/87-retro-classification-and-intent-volume-baseline/87-04-SUMMARY.md` per template, including the 50-email smoke run URL + total_tokens + baseline_rows counts.
</output>
