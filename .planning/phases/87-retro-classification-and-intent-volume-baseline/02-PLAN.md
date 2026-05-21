---
phase: 87
plan: 02
type: tdd
wave: 2
depends_on: [01]
files_modified:
  - web/lib/automations/debtor-email/retro/select-candidates.ts
  - web/lib/automations/debtor-email/retro/reconstruct-input.ts
  - web/lib/automations/debtor-email/retro/aggregate-baseline.ts
  - web/lib/automations/debtor-email/retro/__tests__/select-candidates.test.ts
  - web/lib/automations/debtor-email/retro/__tests__/reconstruct-input.test.ts
  - web/lib/automations/debtor-email/retro/__tests__/aggregate-baseline.test.ts
  - web/lib/automations/debtor-email/retro/__tests__/fixtures/sample-emails.ts
autonomous: true
requirements: [REQ-87-01, REQ-87-03, REQ-87-04]
tags: [phase-87, retro-classify, tdd, helpers]
must_haves:
  truths:
    - "selectCandidates() queries pipeline_events stage=3 in window, returns recency-ordered candidates, throws if >5000 (D-03 hard cap)"
    - "reconstructInput() joins emails + email_labels + conversation_context and returns an InvokeIntentInput identical to the live coordinator's input for the same email"
    - "aggregateBaseline() emits intent_volume_baselines rows whose share column sums to ~1.0 ± epsilon per (window_start, window_end, intent_source='closed_list')"
    - "All three helpers are pure (no Date.now, no random in non-test paths) — safe under Inngest replay"
  artifacts:
    - path: web/lib/automations/debtor-email/retro/select-candidates.ts
      provides: "Candidate selection w/ 5000-cap fail-loud"
      exports: ["selectCandidates"]
    - path: web/lib/automations/debtor-email/retro/reconstruct-input.ts
      provides: "Persisted-row → InvokeIntentInput mapper"
      exports: ["reconstructInput"]
    - path: web/lib/automations/debtor-email/retro/aggregate-baseline.ts
      provides: "intent_volume_baselines row builder"
      exports: ["aggregateBaseline"]
  key_links:
    - from: web/lib/automations/debtor-email/retro/reconstruct-input.ts
      to: web/lib/automations/debtor-email/coordinator/assemble-input.ts
      via: "reuses assembleInput verbatim — same input as live Stage 3"
      pattern: "assembleInput"
    - from: web/lib/automations/debtor-email/retro/aggregate-baseline.ts
      to: intent_volume_baselines
      via: "INSERT … SELECT … GROUP BY new_top_intent"
      pattern: "intent_volume_baselines"
---

<objective>
TDD-build the three pure helpers the Inngest function (Plan 04) composes:

1. `selectCandidates(admin, { swarm_type, since, until })` — reads `pipeline_events` stage=3 in window, returns rows `{email_id, original_top_intent, original_confidence, ...}`, ordered by `created_at DESC`, throws if cardinality exceeds **5000** (D-03 hard cap, fail loud).
2. `reconstructInput(admin, email_id, retro_run_id)` — assembles the exact `InvokeIntentInput` the live coordinator builds. Reads `email_pipeline.emails`, `debtor.email_labels`, `email_pipeline.conversation_context`; calls existing `assembleInput()`. RESEARCH.md § "Reconstructing the InvokeIntentInput" provides verbatim code.
3. `aggregateBaseline(admin, run_id, window_start, window_end, swarm_type)` — emits the SQL/builder that INSERTs into `intent_volume_baselines`: one row per closed-list `new_top_intent` aggregated from `stage_3_retro_runs WHERE run_id = $1`, plus one row per `intent_proposal_clusters` overlapping the window. Returns `{ closed_list_rows, proposal_rows }` counts for the closure summary.

All three are RED→GREEN→REFACTOR. Tests come first.

Purpose: Pure helpers are testable without Inngest; isolating them lets Plan 04 stay a thin wiring function.
Output: 3 helpers + 3 vitest specs + 1 shared fixture, all green under `cd web && npx vitest run lib/automations/debtor-email/retro`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/references/tdd.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/87-retro-classification-and-intent-volume-baseline/87-CONTEXT.md
@.planning/phases/87-retro-classification-and-intent-volume-baseline/87-RESEARCH.md
@.planning/phases/87-retro-classification-and-intent-volume-baseline/87-VALIDATION.md
@web/lib/automations/debtor-email/coordinator/invoke-intent.ts
@web/lib/automations/debtor-email/coordinator/assemble-input.ts

<interfaces>
From web/lib/automations/debtor-email/coordinator/invoke-intent.ts:
```typescript
export type InvokeIntentInput = {
  email_id: string;
  inngest_run_id: string;
  subject: string;
  body_text: string;
  assembled_input: string;
  sender_email: string;
  sender_domain: string;
  mailbox: string;
  entity: string;          // e.g. "smeba"
  received_at: string;
};
```

From CLAUDE.md (Inngest replay-safety):
- Helpers MUST NOT call `crypto.randomUUID()`, `Date.now()`, or read `process.env` at module-init for branching. `retro_run_id` is a parameter, not generated inside the helper.

Expected helper signatures (write tests against these):
```typescript
// select-candidates.ts
export type RetroCandidate = {
  email_id: string;
  original_top_intent: string | null;
  original_confidence: number | null;
  created_at: string;
};
export async function selectCandidates(
  admin: SupabaseClient,
  args: { swarm_type: string; since: string; until: string; cap?: number },
): Promise<RetroCandidate[]>;  // throws if rows > cap (default 5000)

// reconstruct-input.ts
export async function reconstructInput(
  admin: SupabaseClient,
  email_id: string,
  retro_run_id: string,
): Promise<InvokeIntentInput>;

// aggregate-baseline.ts
export async function aggregateBaseline(
  admin: SupabaseClient,
  args: {
    run_id: string;
    window_start: string;
    window_end: string;
    swarm_type: string;
  },
): Promise<{ closed_list_rows: number; proposal_rows: number }>;
```
</interfaces>
</context>

<tasks>

<task type="tdd" tdd="true">
  <name>Task 1: Shared fixtures + selectCandidates (TDD)</name>
  <files>
    web/lib/automations/debtor-email/retro/__tests__/fixtures/sample-emails.ts,
    web/lib/automations/debtor-email/retro/__tests__/select-candidates.test.ts,
    web/lib/automations/debtor-email/retro/select-candidates.ts
  </files>
  <behavior>
    Fixture: 3 deterministic email rows {id, subject, body_full_text, sender_email, mailbox, received_at} + matching pipeline_events stage=3 rows with known decisions ('general_inquiry', 'payment_dispute', 'other').

    selectCandidates tests:
    - Test 1 (RED): returns rows in DESC created_at order when given a window with 3 stage=3 events.
    - Test 2: returns `decision` as `original_top_intent` and `confidence` as `original_confidence` (typed numeric|null).
    - Test 3: throws Error containing "Phase 87 D-03 cap exceeded" when mock supabase returns 5001 rows.
    - Test 4: empty window returns `[]` (no throw).
    - Test 5: only queries `swarm_type='debtor-email'` and `stage=3` (assert chained .eq calls).
  </behavior>
  <action>
    Per CLAUDE.md TDD pattern (red → green → refactor):

    1. **RED.** Write `__tests__/fixtures/sample-emails.ts` exporting `SAMPLE_EMAILS`, `SAMPLE_PIPELINE_EVENTS`, and a `buildMockAdmin(events)` helper returning a chainable Supabase mock (`.from().select().eq().eq().gte().lt().order().limit()` resolves to `{ data, error: null }`). Pattern: existing `email_pipeline/emails` mocks in `web/lib/inngest/functions/__tests__/`. Write `select-candidates.test.ts` with all 5 cases above. Run `cd web && npx vitest run lib/automations/debtor-email/retro/__tests__/select-candidates.test.ts` — MUST fail (module not found). Commit: `test(87-02): add failing tests for selectCandidates`.
    2. **GREEN.** Implement `select-candidates.ts` per the signature in <interfaces>. Use the SQL pattern from RESEARCH.md § "5000-email selection SQL": `.from('pipeline_events').select(...).eq('swarm_type', args.swarm_type).eq('stage', 3).gte('created_at', args.since).lt('created_at', args.until).order('created_at', { ascending: false }).limit((args.cap ?? 5000) + 1)`. After fetch, if `rows.length > cap` throw `new Error(\`Phase 87 D-03 cap exceeded: ${rows.length} stage=3 events in [${args.since}, ${args.until}). Narrow window or raise cap explicitly.\`)`. Map each row to `RetroCandidate` (decision → original_top_intent, confidence → original_confidence). Run tests — MUST pass. Commit: `feat(87-02): implement selectCandidates with D-03 5000 hard cap`.
    3. **REFACTOR** if needed — extract the cap constant `STAGE_3_RETRO_HARD_CAP = 5000` as a named export. Tests still green. Commit only if a real cleanup happened.
  </action>
  <verify>
    <automated>cd web && npx vitest run --no-coverage lib/automations/debtor-email/retro/__tests__/select-candidates.test.ts</automated>
  </verify>
  <done>3 fixtures + 5 tests green. Helper throws on cap breach with the exact D-03 error message.</done>
</task>

<task type="tdd" tdd="true">
  <name>Task 2: reconstructInput (TDD)</name>
  <files>
    web/lib/automations/debtor-email/retro/__tests__/reconstruct-input.test.ts,
    web/lib/automations/debtor-email/retro/reconstruct-input.ts
  </files>
  <behavior>
    - Test 1 (RED): for a fixture email with subject + body_full_text + 2 conversation_context priors, returns `InvokeIntentInput` whose `assembled_input` field is byte-identical to what `assembleInput({ subject, bodyFull, priors, tenantDomains: TENANT_DOMAINS_BY_SWARM['debtor-email'], capChars: 8000 })` produces called directly. This is the "comparison validity" invariant (RESEARCH.md § Don't Hand-Roll: prompts MUST match live).
    - Test 2: `email_id`, `inngest_run_id`, `subject`, `sender_email`, `mailbox`, `received_at` all pass through verbatim from the email row.
    - Test 3: `sender_domain` is `sender_email.split('@')[1]` (or `""` for malformed).
    - Test 4: `entity` reads from `debtor.email_labels.entity`; falls back to `"smeba"` when row missing (assumption A4 in RESEARCH.md).
    - Test 5: `body_full_text` is preferred over `body_text`; uses `body_text` only when `body_full_text` is null (degraded fallback flagged in RESEARCH.md § Environment Availability).
    - Test 6: priors mapped from `conversation_context` rows ordered by `position` ascending.
  </behavior>
  <action>
    1. **RED.** Write `reconstruct-input.test.ts` covering all 6 cases. Mock supabase admin with the buildMockAdmin pattern from Task 1, returning fixture emails/labels/conversation_context. Run — fail. Commit: `test(87-02): add failing tests for reconstructInput`.
    2. **GREEN.** Implement `reconstruct-input.ts` VERBATIM from RESEARCH.md § "Reconstructing the InvokeIntentInput from persisted rows" (lines 339-406). Import `assembleInput` from `@/lib/automations/debtor-email/coordinator/assemble-input` and `TENANT_DOMAINS_BY_SWARM` from `@/lib/automations/debtor-email/coordinator/tenant-domains.generated`. Constants: `STAGE_3_INPUT_CAP_CHARS = 8000`, `TENANT_DOMAINS = [...TENANT_DOMAINS_BY_SWARM["debtor-email"]]`. Run — green. Commit: `feat(87-02): implement reconstructInput from persisted rows`.

    NOTE: Do NOT inline a hand-rolled prompt assembler — research § Don't Hand-Roll prohibits this. `assembleInput()` reuse is the whole point.
  </action>
  <verify>
    <automated>cd web && npx vitest run --no-coverage lib/automations/debtor-email/retro/__tests__/reconstruct-input.test.ts</automated>
  </verify>
  <done>6 tests green. `assembled_input` byte-identical to live coordinator assembly for the same fixture email.</done>
</task>

<task type="tdd" tdd="true">
  <name>Task 3: aggregateBaseline (TDD)</name>
  <files>
    web/lib/automations/debtor-email/retro/__tests__/aggregate-baseline.test.ts,
    web/lib/automations/debtor-email/retro/aggregate-baseline.ts
  </files>
  <behavior>
    - Test 1 (RED): given a fixture `stage_3_retro_runs` set of 10 rows across 3 distinct `new_top_intent` values, the helper INSERTs 3 closed_list rows into `intent_volume_baselines` with correct counts (e.g., 5/3/2) and `share` values summing to 1.0 ± 1e-4.
    - Test 2: `intent_source='closed_list'` set on every closed-list row; window_start/window_end echoed from args.
    - Test 3: proposal-cluster INSERT path: when `intent_proposal_clusters` mock returns 2 clusters overlapping the window, 2 additional rows are inserted with `intent_source='proposal_cluster'` and `intent_key` = cluster centroid_label.
    - Test 4: empty `stage_3_retro_runs` for the run_id → INSERTs 0 closed_list rows (no divide-by-zero); proposal-cluster rows still INSERT if clusters exist.
    - Test 5: return value `{ closed_list_rows: 3, proposal_rows: 2 }` matches actual INSERT counts.
  </behavior>
  <action>
    1. **RED.** Write `aggregate-baseline.test.ts` covering all 5 cases. Mock admin supports two query paths: `.from('stage_3_retro_runs').select(...).eq('run_id', ...)` and `.from('intent_proposal_clusters').select(...).eq('swarm_type', ...).gte(...).lte(...)`, plus `.from('intent_volume_baselines').insert(rows)`. Fail. Commit: `test(87-02): add failing tests for aggregateBaseline`.
    2. **GREEN.** Implement `aggregate-baseline.ts`. Two-phase logic per RESEARCH.md § Pattern 3:
        - Phase A: `SELECT new_top_intent, count(*) FROM stage_3_retro_runs WHERE run_id = $1 GROUP BY new_top_intent` — Supabase JS does not support raw GROUP BY via the builder, so do it in JS: fetch all matching rows (`select('new_top_intent')`), tally counts in a Map, compute share. INSERT closed_list rows.
        - Phase B: fetch `intent_proposal_clusters` overlapping `[window_start, window_end]` for the swarm_type, INSERT proposal_cluster rows with `share = member_count / total_retro_rows` (or 0 if total is 0).
        - Return `{ closed_list_rows, proposal_rows }`.
       Run — green. Commit: `feat(87-02): implement aggregateBaseline INSERT…SELECT`.
  </action>
  <verify>
    <automated>cd web && npx vitest run --no-coverage lib/automations/debtor-email/retro/__tests__/aggregate-baseline.test.ts</automated>
  </verify>
  <done>5 tests green. Closed_list share rows sum to 1.0 ± 1e-4 in the populated case.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Helpers ↔ Supabase admin | Helpers receive an admin client; assume service-role authority |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-87-01a | T (Tampering) | `selectCandidates` cardinality > 5000 | mitigate | Hard cap throws; D-03 explicit fail-loud. Tested directly. |
| T-87-03a | T (Tampering) | Drift between retro `assembled_input` and live coordinator's | mitigate | Helper reuses `assembleInput()` verbatim; Task 2 Test 1 asserts byte-identity. |
</threat_model>

<verification>
- `cd web && npx vitest run --no-coverage lib/automations/debtor-email/retro` exits 0 with all spec files green.
- No helper imports `crypto`, `Date.now`, or live network clients.
</verification>

<success_criteria>
- [ ] 3 helper files exist with the signatures from <interfaces>
- [ ] 3 test files green
- [ ] Shared fixture file `__tests__/fixtures/sample-emails.ts` exports SAMPLE_EMAILS + buildMockAdmin
- [ ] `select-candidates.ts` throws with literal text "Phase 87 D-03 cap exceeded" when rows > 5000
- [ ] `reconstruct-input.ts` produces byte-identical `assembled_input` to live coordinator
</success_criteria>

<output>
Create `.planning/phases/87-retro-classification-and-intent-volume-baseline/87-02-SUMMARY.md` per template.
</output>
