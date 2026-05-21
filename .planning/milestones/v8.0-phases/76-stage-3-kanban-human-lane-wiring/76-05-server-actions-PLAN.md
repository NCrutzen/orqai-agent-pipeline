---
phase: 76
plan: 05
type: execute
wave: 4
depends_on: [01, 02, 03, 04]
files_modified:
  - web/app/(dashboard)/automations/[swarm]/kanban/actions/close.ts
  - web/app/(dashboard)/automations/[swarm]/kanban/actions/replay.ts
  - web/app/(dashboard)/automations/[swarm]/kanban/actions/reclassify-noise.ts
  - web/app/(dashboard)/automations/[swarm]/kanban/_lib/kanban-loader.ts
  - web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/close.test.ts
  - web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/replay.test.ts
  - web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/reclassify-noise.test.ts
  - web/app/(dashboard)/automations/[swarm]/kanban/_lib/__tests__/kanban-loader.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "closeKanbanRow validates swarm against swarms registry, then UPDATEs status='completed' + emits broadcast (D-04 lock; T-76-05-04 IDOR mitigation)"
    - "replayKanbanRow with same intent calls inngest.send(handler_event, ...) directly — NO override emit (D-01)"
    - "replayKanbanRow with different intent calls inngest.send('debtor-email/override.submitted', { axis:'stage_3_intent', ... }) AND closes Kanban row (D-01)"
    - "reclassifyAsNoise validates noise_key against swarm_noise_categories registry (rejects 'unknown' and unknown values), then emits axis-1 override and closes row (D-03)"
    - "All Server Actions reject calls where the operator-supplied swarm/intent_key/noise_key isn't in the registry (security: T-76-05-01..03)"
    - "kanban-loader.ts SELECTs automation_runs where status='pending' AND result->>'kanban_reason' IS NOT NULL filtered by swarm_type"
    - "loadKanbanRows pipeline_events join is deterministic across replay: SELECT ordered by created_at DESC and the email_id→event_id Map uses first-write-wins so the surfaced event_id is always the most-recent prior Stage 1 / Stage 3 emit (W4 fix)"
  artifacts:
    - path: "web/app/(dashboard)/automations/[swarm]/kanban/actions/close.ts"
      provides: "closeKanbanRow Server Action"
    - path: "web/app/(dashboard)/automations/[swarm]/kanban/actions/replay.ts"
      provides: "replayKanbanRow Server Action with same-intent / edited-intent branch (D-01)"
    - path: "web/app/(dashboard)/automations/[swarm]/kanban/actions/reclassify-noise.ts"
      provides: "reclassifyAsNoise Server Action emitting axis-1 override (D-03)"
    - path: "web/app/(dashboard)/automations/[swarm]/kanban/_lib/kanban-loader.ts"
      provides: "loadKanbanRows server-side loader for the per-swarm UI"
  key_links:
    - from: "Server Actions"
      to: "swarms / swarm_intents / swarm_noise_categories registries"
      via: "registry validation before any state-mutating call"
      pattern: "loadSwarm\\|loadSwarmIntents\\|loadSwarmNoiseCategories"
    - from: "replayKanbanRow edited-intent branch"
      to: "debtor-email-override-handler.ts axis-3 path"
      via: "inngest.send('debtor-email/override.submitted', { axis:'stage_3_intent', ... })"
      pattern: "stage_3_intent"
    - from: "reclassifyAsNoise"
      to: "debtor-email-override-handler.ts axis-1 path → classifier-verdict-worker"
      via: "inngest.send('debtor-email/override.submitted', { axis:'stage_1_category', ... })"
      pattern: "stage_1_category"
    - from: "loadKanbanRows pipeline_events lookup"
      to: "originalEventId surfaced to UI for axis-1/axis-3 override emits"
      via: "ORDER BY created_at DESC + first-write-wins Map (W4 deterministic ordering)"
      pattern: "order\\(.*created_at.*ascending: false"
---

<objective>
Implement the three operator Server Actions (Close, Replay, Reclassify-as-noise) plus the `kanban-loader.ts` SELECT helper. These are the runtime backbone of the Kanban UI; the UI plans (06+07) call them.

Per CONTEXT.md:
- **D-01 Replay:** same-intent → fire handler_event directly (bypasses override handler). Different intent → emit axis-3 override (debtor-email-override-handler.ts:184-202 dispatches the new handler_event). RESEARCH §Pitfall 4 forbids one code path for both.
- **D-03 Reclassify-as-noise:** axis-1 override emitting `debtor-email/override.submitted` with `axis:'stage_1_category'`; existing override handler routes to `classifier/verdict.recorded` → verdict-worker → categorize_archive (Outlook label + archive + queue iController cleanup). Dropdown excludes `unknown` (CONTEXT.md deferred-ideas note).
- **Security:** all three actions validate operator-supplied identifiers against the registry tables (swarms, swarm_intents, swarm_noise_categories) before any side effect — IDOR + injection mitigation per `<security_threat_model>`.

Purpose: Operators can act on Kanban rows. Replay moves backlog through Stage 4; Reclassify trains Stage 1 LLM precision; Close clears manual-handled cases.

Output: 4 production files + 4 test files; Wave 0 `it.todo` markers flip to GREEN tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md
@.planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md
@docs/agentic-pipeline/override-model.md
@web/lib/inngest/functions/debtor-email-override-handler.ts
@web/lib/inngest/functions/classifier-verdict-worker.ts
@web/lib/swarms/registry.ts
@web/lib/swarms/types.ts
@web/app/(dashboard)/automations/[swarm]/review/actions.ts
@web/lib/inngest/client.ts
@web/lib/automations/runs/emit.ts

<interfaces>
<!-- inngest.send must be called via the binding pattern (CLAUDE.md commit dae6276): -->
<!--   type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>; -->
<!--   await (inngest.send as unknown as SendFn)({ name, data }); -->
<!-- OR equivalently: const send = inngest.send.bind(inngest); await send({ name, data }); -->

<!-- axis-3 emit shape (RESEARCH §Pattern 4): -->
<!--   { name: 'debtor-email/override.submitted', data: { -->
<!--       axis: 'stage_3_intent', email_id, original_event_id, -->
<!--       original_decision: <coordinator's top intent>, -->
<!--       decision: <operator's chosen intent>, -->
<!--       decision_details: { intent_key: <chosen> }, -->
<!--       eval_type: 'capability', operator_id -->
<!--     } } -->

<!-- axis-1 emit shape (RESEARCH §Pattern 4): -->
<!--   { name: 'debtor-email/override.submitted', data: { -->
<!--       axis: 'stage_1_category', email_id, original_event_id, -->
<!--       original_decision: <Stage 1 emitted category, may be 'unknown'>, -->
<!--       decision: <chosen noise_key>, -->
<!--       eval_type: 'regression', operator_id -->
<!--     } } -->

<!-- Same-intent Replay branch (D-01 + RESEARCH §Pitfall 4): -->
<!--   if (chosenIntent === originalIntent) { -->
<!--     await loadHandlerEvent(admin, swarmType, chosenIntent) → null check → inngest.send(handler_event, { email_id, triggered_by:'operator-replay-same-intent' }) -->
<!--   } -->

<!-- kanban-loader SELECT shape: -->
<!--   admin.from('automation_runs').select('*') -->
<!--     .eq('swarm_type', swarmType) -->
<!--     .eq('status', 'pending') -->
<!--     .not('result->>kanban_reason', 'is', null) -->
<!--     .order('created_at', { ascending: false }) -->
<!--     .limit(500) — Pitfall 2 mitigation -->

<!-- W3 noise-category field name (verified 2026-05-07 against web/lib/swarms/types.ts:80): -->
<!--   The single canonical field on swarm_noise_categories rows is `category_key` (string). There is NO `noise_key` field. -->
<!--   Server Action validation MUST use `c.category_key === args.noiseKey` exclusively — no `c.noise_key || c.category_key` fallback. -->

<!-- W4 pipeline_events ordering (deterministic event_id surfacing): -->
<!--   The pipeline_events lookup in loadKanbanRows MUST: -->
<!--     1. SELECT with .order('created_at', { ascending: false }) so newest emits come first -->
<!--     2. Use first-write-wins on the Map: `if (!stage1Map.has(ev.email_id)) stage1Map.set(ev.email_id, ev.id)` -->
<!--   This guarantees that on replay, the surfaced originalEventId is the MOST RECENT prior Stage 1 / Stage 3 emit, not an arbitrary one. -->
-->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: kanban-loader.ts + close.ts Server Action (with swarm validation)</name>
  <files>web/app/(dashboard)/automations/[swarm]/kanban/_lib/kanban-loader.ts, web/app/(dashboard)/automations/[swarm]/kanban/actions/close.ts, web/app/(dashboard)/automations/[swarm]/kanban/_lib/__tests__/kanban-loader.test.ts, web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/close.test.ts</files>
  <read_first>
    - web/app/(dashboard)/automations/[swarm]/review/actions.ts (existing Server Action patterns — admin client, validation, error shape)
    - web/app/(dashboard)/automations/[swarm]/review/page.tsx (loadSwarm registry-validation pattern — `loadSwarm(admin, params.swarm)` + `notFound()`)
    - web/lib/swarms/registry.ts (loadSwarm, loadSwarmIntents, loadSwarmNoiseCategories)
    - web/lib/automations/runs/emit.ts (emitAutomationRunStale)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md §Pattern 5, §Pattern 6, §Pitfall 5
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md (D-04 REVISED, D-10)
  </read_first>
  <behavior>
    - kanban-loader.ts: `loadKanbanRows(admin, swarmType: string)` returns rows where status='pending', result->>'kanban_reason' IS NOT NULL, ordered by created_at DESC, limit 500. Joins to pipeline_events to surface Stage 1 and Stage 3 event_ids (Pitfall 3). The pipeline_events SELECT uses `.order('created_at', { ascending: false })` and the email_id→event_id Maps use **first-write-wins** semantics (`if (!map.has(...)) map.set(...)`) so the surfaced event_id is deterministically the most-recent prior emit per stage. R-3 mitigation: if no row exists, return null event_ids in the row shape.
    - close.ts test: validates swarm via `loadSwarm(admin, swarmType)`; rejects unknown swarm with thrown error or returned `{ ok:false, error:'unknown swarm' }`. UPDATEs `automation_runs SET status='completed', completed_at=now()` WHERE id=$rowId AND swarm_type=$swarmType (compound filter prevents IDOR). Emits broadcast on `${swarmType}-kanban`. Returns `{ ok:true }`.
    - close.ts test (IDOR): swarmType='debtor-email' but rowId belongs to swarm_type='sales-email' → UPDATE matches 0 rows → action returns `{ ok:false }` (or throws) — assert via mock-supabase returning rowCount=0.
  </behavior>
  <action>
1. Create `web/app/(dashboard)/automations/[swarm]/kanban/_lib/kanban-loader.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type KanbanReason = "no_handler" | "low_confidence" | "handler_error";

export interface KanbanRow {
  id: string;
  swarm_type: string;
  topic: string | null;
  entity: string | null;
  created_at: string;
  result: {
    kanban_reason: KanbanReason;
    intent?: string;
    confidence?: string;
    email_id?: string;
    automation_run_id?: string | null;
    coordinator_run_id?: string | null;
    error_detail?: string;
    error_name?: string;
    gate_reason?: string;
    ranked?: Array<{ intent: string; confidence: string }>;
  };
  // Filled by the joined lookup; null when no Stage 1 / Stage 3 pipeline_events row exists.
  // W4: when multiple events exist for the same (email_id, stage), the MOST RECENT one wins
  // (deterministic across replay) — see ordering comment below.
  stage_1_event_id: string | null;
  stage_3_event_id: string | null;
}

export async function loadKanbanRows(admin: SupabaseClient, swarmType: string): Promise<KanbanRow[]> {
  const { data, error } = await admin
    .from("automation_runs")
    .select("id, swarm_type, topic, entity, created_at, result")
    .eq("swarm_type", swarmType)
    .eq("status", "pending")
    .not("result->>kanban_reason", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`loadKanbanRows: ${error.message}`);
  const rows = (data ?? []) as Omit<KanbanRow, "stage_1_event_id" | "stage_3_event_id">[];
  if (rows.length === 0) return [];

  // Surface event_ids for the override actions (R-3 mitigation).
  const emailIds = Array.from(new Set(rows.map((r) => r.result?.email_id).filter(Boolean) as string[]));
  if (emailIds.length === 0) return rows.map((r) => ({ ...r, stage_1_event_id: null, stage_3_event_id: null }));

  // W4: order DESC by created_at so newest emits land in the result set first; combined
  // with first-write-wins on the Map below this guarantees the surfaced event_id is
  // deterministically the MOST RECENT prior Stage 1 / Stage 3 emit per email — never
  // an arbitrary one. Without this ordering the join would be nondeterministic across
  // Postgres planner choice and across replay.
  const { data: events } = await admin
    .from("pipeline_events")
    .select("id, email_id, stage, created_at")
    .in("email_id", emailIds)
    .in("stage", [1, 3])
    .order("created_at", { ascending: false });
  const stage1Map = new Map<string, string>();
  const stage3Map = new Map<string, string>();
  for (const ev of (events ?? []) as Array<{ id: string; email_id: string; stage: number; created_at: string }>) {
    // W4: first-write-wins. Because rows arrive newest-first (ORDER BY created_at DESC),
    // the FIRST hit for an email_id is the most recent emit. Skip subsequent (older) rows.
    if (ev.stage === 1 && !stage1Map.has(ev.email_id)) stage1Map.set(ev.email_id, ev.id);
    if (ev.stage === 3 && !stage3Map.has(ev.email_id)) stage3Map.set(ev.email_id, ev.id);
  }
  return rows.map((r) => ({
    ...r,
    stage_1_event_id: r.result?.email_id ? stage1Map.get(r.result.email_id) ?? null : null,
    stage_3_event_id: r.result?.email_id ? stage3Map.get(r.result.email_id) ?? null : null,
  }));
}
```

2. Create `web/app/(dashboard)/automations/[swarm]/kanban/actions/close.ts`:

```ts
"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm } from "@/lib/swarms/registry";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

export async function closeKanbanRow(args: {
  kanbanRowId: string;
  swarmType: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!args.kanbanRowId || !args.swarmType) return { ok: false, error: "missing args" };
  const admin = createAdminClient();
  // IDOR / spoofing mitigation — swarm must exist in registry.
  const swarm = await loadSwarm(admin, args.swarmType);
  if (!swarm) return { ok: false, error: "unknown swarm" };
  // Compound filter: id AND swarm_type. Prevents closing a row belonging to a different mailbox.
  const { data, error } = await admin
    .from("automation_runs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", args.kanbanRowId)
    .eq("swarm_type", args.swarmType)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "row not found or already closed" };
  await emitAutomationRunStale(admin, `${args.swarmType}-kanban`);
  return { ok: true };
}
```

3. Update `web/app/(dashboard)/automations/[swarm]/kanban/_lib/__tests__/kanban-loader.test.ts` (Plan 01 todo → real test):
   - Mock supabase select chain returning two pending rows with `result.kanban_reason` set
   - Assert `loadKanbanRows` returns 2 rows
   - Assert SELECT called with `.eq('swarm_type', ...)`, `.eq('status', 'pending')`, `.not('result->>kanban_reason', 'is', null)`, `.order('created_at', ...)`, `.limit(500)`
   - Assert pipeline_events lookup runs WITH `.order('created_at', { ascending: false })` — W4 deterministic ordering check (`expect(orderMock).toHaveBeenCalledWith('created_at', expect.objectContaining({ ascending: false }))`)
   - Assert first-write-wins: when the mocked pipeline_events query returns two rows for the same `(email_id, stage=1)` — first with `id='ev-newest'` then `id='ev-older'` — the resulting `stage_1_event_id` is `'ev-newest'` (NOT `'ev-older'`). This proves the Map.set guard is in place.
   - Assert stage_1_event_id/stage_3_event_id are populated when matching rows exist; null when missing.

4. Update `web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/close.test.ts` (Plan 01 todo → real test):
   - Mock `loadSwarm` to return `{ swarm_type:'debtor-email' }` for valid swarm; null for invalid
   - Mock supabase update chain to return `{ data: [{ id:'row-1' }], error: null }` for happy path
   - Test: invalid swarm → `{ ok:false, error:'unknown swarm' }`
   - Test: row not found → `{ ok:false }`
   - Test: happy path → `{ ok:true }` and emitAutomationRunStale called with `'debtor-email-kanban'`

   Use the `vi.mock` pattern matching this codebase's test conventions (read existing review/__tests__/*.test.ts as template).
  </action>
  <verify>
    <automated>cd web && npx vitest run app/\(dashboard\)/automations/\[swarm\]/kanban/_lib/__tests__/kanban-loader.test.ts && cd web && npx vitest run app/\(dashboard\)/automations/\[swarm\]/kanban/actions/__tests__/close.test.ts && cd web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - 4 files exist at declared paths
    - `grep -c "loadSwarm" web/app/\(dashboard\)/automations/\[swarm\]/kanban/actions/close.ts` ≥ 1 (registry validation)
    - `grep -c "swarm_type" web/app/\(dashboard\)/automations/\[swarm\]/kanban/actions/close.ts` ≥ 2 (compound filter)
    - `grep -c "result->>kanban_reason" web/app/\(dashboard\)/automations/\[swarm\]/kanban/_lib/kanban-loader.ts` ≥ 1
    - `grep -c "limit(500)" web/app/\(dashboard\)/automations/\[swarm\]/kanban/_lib/kanban-loader.ts` ≥ 1
    - **W4 ordering gate:** `grep -E 'order\\(.*created_at.*ascending: false' web/app/\\(dashboard\\)/automations/\\[swarm\\]/kanban/_lib/kanban-loader.ts | wc -l` ≥ 2 (one for automation_runs, one for pipeline_events — both ordered)
    - **W4 first-write-wins gate:** `grep -nE 'if\\s*\\(!stage1Map\\.has|if\\s*\\(!stage3Map\\.has' web/app/\\(dashboard\\)/automations/\\[swarm\\]/kanban/_lib/kanban-loader.ts | wc -l` ≥ 2 (skip-if-already-present guards on both stage maps)
    - **W4 unconditional Map.set is forbidden:** `grep -nE 'stage[13]Map\\.set' web/app/\\(dashboard\\)/automations/\\[swarm\\]/kanban/_lib/kanban-loader.ts` returns lines that are ALL inside an `if (!stageNMap.has(...))` guard — no bare `stage1Map.set(ev.email_id, ev.id)` without a preceding `has()` check
    - Both vitest commands exit 0 (the kanban-loader test must include the W4 first-write-wins assertion described in step 3)
    - `cd web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>kanban-loader returns the right SELECT shape with deterministic event_id join (W4: ordered DESC + first-write-wins); close action validates swarm + compound-filters; tests GREEN including the first-write-wins assertion.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: replay.ts Server Action — same-intent vs edited-intent branch (D-01)</name>
  <files>web/app/(dashboard)/automations/[swarm]/kanban/actions/replay.ts, web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/replay.test.ts</files>
  <read_first>
    - web/lib/inngest/functions/debtor-email-override-handler.ts (lines 184-202 — axis-3 dispatch path)
    - web/lib/swarms/registry.ts (loadSwarm, loadSwarmIntents, loadHandlerEvent — confirm signatures)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md §Code Examples §Example 4 + §Pitfall 4 + §R-4
    - web/lib/inngest/client.ts (inngest export — confirm import path for the SendFn binding pattern)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md (D-01, D-02 — locked)
  </read_first>
  <behavior>
    - Test 1 (same-intent): `chosenIntent === originalIntent` → calls `inngest.send` with the resolved handler_event (NOT 'debtor-email/override.submitted'); does NOT call override.submitted; closes Kanban row.
    - Test 2 (edited-intent): `chosenIntent !== originalIntent` → calls `inngest.send` with `name='debtor-email/override.submitted'` and `data.axis='stage_3_intent'`, `data.original_decision=originalIntent`, `data.decision=chosenIntent`; closes Kanban row.
    - Test 3 (validation): `chosenIntent` not in `loadSwarmIntents(admin, swarmType)` returns `{ ok:false, error:'unknown intent' }`. Includes negative test for SQL-injection-shaped strings (`'; DROP TABLE swarm_intents--`) — registry lookup miss returns same error.
    - Test 4 (R-4 placeholder edited-intent): chosenIntent has `handler_status='placeholder'` → still emit override.submitted (override handler will write a no_handler Kanban row when it tries to dispatch). Document gap; do NOT block in v1.
    - Test 5 (IDOR): swarmType not in swarms registry → `{ ok:false, error:'unknown swarm' }`.
    - Test 6 (same-intent + handler_event missing): `loadHandlerEvent` returns null → `{ ok:false, error:'no handler_event' }`.
  </behavior>
  <action>
Create `web/app/(dashboard)/automations/[swarm]/kanban/actions/replay.ts`:

```ts
"use server";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadSwarm,
  loadSwarmIntents,
  loadHandlerEvent,
} from "@/lib/swarms/registry";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

export async function replayKanbanRow(args: {
  kanbanRowId: string;
  swarmType: string;
  emailId: string;
  originalIntent: string;
  chosenIntent: string;
  originalEventId: string | null; // pipeline_events.id of Stage 3 emit; nullable per R-3
  operatorId: string;
}): Promise<{ ok: true; mode: "same-intent" | "edited-intent" } | { ok: false; error: string }> {
  if (!args.kanbanRowId || !args.swarmType || !args.emailId || !args.chosenIntent || !args.operatorId) {
    return { ok: false, error: "missing args" };
  }
  const admin = createAdminClient();

  // IDOR: validate swarm against registry
  const swarm = await loadSwarm(admin, args.swarmType);
  if (!swarm) return { ok: false, error: "unknown swarm" };

  // Validate chosenIntent against registry (rejects injection-shaped strings + typos)
  const intents = await loadSwarmIntents(admin, args.swarmType);
  const chosenRow = intents.find((i) => i.intent_key === args.chosenIntent);
  if (!chosenRow) return { ok: false, error: "unknown intent" };

  const sameIntent = args.chosenIntent === args.originalIntent;
  const send = (inngest.send as unknown as SendFn);

  if (sameIntent) {
    // D-01: bypass override handler; fire handler_event directly. NO axis-3 row.
    const handlerEvent = await loadHandlerEvent(admin, args.swarmType, args.chosenIntent);
    if (!handlerEvent) return { ok: false, error: "no handler_event" };
    await send({
      name: handlerEvent,
      data: {
        email_id: args.emailId,
        swarm_type: args.swarmType,
        triggered_by: "operator-replay-same-intent",
      },
    });
  } else {
    // D-01: edited-intent → axis-3 override; existing handler resolves and dispatches.
    await send({
      name: "debtor-email/override.submitted",
      data: {
        axis: "stage_3_intent",
        email_id: args.emailId,
        original_event_id: args.originalEventId,
        original_decision: args.originalIntent,
        decision: args.chosenIntent,
        decision_details: { intent_key: args.chosenIntent },
        eval_type: "capability",
        operator_id: args.operatorId,
      },
    });
  }

  // Close Kanban row (compound filter for IDOR safety).
  const { data, error } = await admin
    .from("automation_runs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", args.kanbanRowId)
    .eq("swarm_type", args.swarmType)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "row not found or already closed" };

  await emitAutomationRunStale(admin, `${args.swarmType}-kanban`);
  return { ok: true, mode: sameIntent ? "same-intent" : "edited-intent" };
}
```

Update `__tests__/replay.test.ts` (Plan 01 todos → real tests). Mock `loadSwarm`, `loadSwarmIntents`, `loadHandlerEvent`, `inngest.send`, supabase admin. Cover all 6 behaviors. Use `expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ name: 'debtor-email/override.submitted' }))` for edited-intent and `expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ name: '<handler_event>' }))` for same-intent.
  </action>
  <verify>
    <automated>cd web && npx vitest run app/\(dashboard\)/automations/\[swarm\]/kanban/actions/__tests__/replay.test.ts && cd web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - File `web/app/(dashboard)/automations/[swarm]/kanban/actions/replay.ts` exists
    - `grep -c "stage_3_intent" web/app/\(dashboard\)/automations/\[swarm\]/kanban/actions/replay.ts` ≥ 1
    - `grep -c "loadSwarmIntents\|loadSwarm\|loadHandlerEvent" web/app/\(dashboard\)/automations/\[swarm\]/kanban/actions/replay.ts` ≥ 3
    - `grep -c "operator-replay-same-intent" web/app/\(dashboard\)/automations/\[swarm\]/kanban/actions/replay.ts` ≥ 1
    - `grep -c "inngest.send as unknown as SendFn" web/app/\(dashboard\)/automations/\[swarm\]/kanban/actions/replay.ts` ≥ 1 (CLAUDE.md binding rule)
    - All 6 test cases in `__tests__/replay.test.ts` pass
    - `cd web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Replay branches: same-intent uses direct dispatch, edited-intent emits axis-3 override; both close the row; registry validation guards.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: reclassify-noise.ts Server Action — axis-1 override (D-03)</name>
  <files>web/app/(dashboard)/automations/[swarm]/kanban/actions/reclassify-noise.ts, web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/reclassify-noise.test.ts</files>
  <read_first>
    - web/lib/inngest/functions/debtor-email-override-handler.ts (lines 103-160 — axis-1 path; understand `original_event_id` requirement)
    - web/lib/inngest/functions/classifier-verdict-worker.ts (downstream side-effects — categorize_archive)
    - web/lib/swarms/registry.ts (loadSwarmNoiseCategories)
    - **web/lib/swarms/types.ts (W3 mandate: confirm the EXACT field name on swarm_noise_categories rows. As of the current source the single canonical field is `category_key: string` at line 80; there is NO `noise_key` field. Your validation MUST read `c.category_key` exclusively. Do NOT keep the placeholder `c.noise_key || c.category_key` fallback — pick `category_key` and ship one field name.)**
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md §Pattern 4 axis-1 + §Pitfall 3 (R-3)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md (D-03 + deferred-ideas note: `unknown` excluded from dropdown)
  </read_first>
  <behavior>
    - Test 1 (happy path): noise_key='auto_reply' → emits `debtor-email/override.submitted` with `axis:'stage_1_category', decision:'auto_reply', eval_type:'regression'`; closes Kanban row.
    - Test 2 (rejects 'unknown'): noise_key='unknown' → returns `{ ok:false, error:'unknown not allowed' }` (CONTEXT.md deferred-ideas).
    - Test 3 (rejects bogus key): noise_key='not_in_registry' → registry lookup miss → `{ ok:false, error:'unknown noise key' }`. Negative tests cover injection-shaped strings (`"'; DROP TABLE..."`) — registry miss returns same error.
    - Test 4 (IDOR): swarmType not in registry → `{ ok:false, error:'unknown swarm' }`.
    - Test 5 (R-3 nullable original_event_id): `originalEventId=null` → still emit (override handler accepts null per existing schema; if it doesn't, this fails-loud — let it).
  </behavior>
  <action>
Create `web/app/(dashboard)/automations/[swarm]/kanban/actions/reclassify-noise.ts`:

```ts
"use server";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm, loadSwarmNoiseCategories } from "@/lib/swarms/registry";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

export async function reclassifyAsNoise(args: {
  kanbanRowId: string;
  swarmType: string;
  emailId: string;
  noiseKey: string;
  originalStage1Decision: string; // typically 'unknown' for emails that reached Stage 3
  originalEventId: string | null;  // nullable per R-3
  operatorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!args.kanbanRowId || !args.swarmType || !args.emailId || !args.noiseKey || !args.operatorId) {
    return { ok: false, error: "missing args" };
  }
  // CONTEXT.md deferred-ideas: 'unknown' excluded from dropdown — reject defensively too.
  if (args.noiseKey === "unknown") return { ok: false, error: "unknown not allowed" };

  const admin = createAdminClient();

  // IDOR: validate swarm
  const swarm = await loadSwarm(admin, args.swarmType);
  if (!swarm) return { ok: false, error: "unknown swarm" };

  // Validate noise_key against registry (rejects typos + injection).
  // W3: single canonical field per web/lib/swarms/types.ts is `category_key`. No `noise_key` field exists.
  const categories = await loadSwarmNoiseCategories(admin, args.swarmType);
  const valid = categories.some((c) => c.category_key === args.noiseKey);
  if (!valid) return { ok: false, error: "unknown noise key" };

  const send = (inngest.send as unknown as SendFn);
  await send({
    name: "debtor-email/override.submitted",
    data: {
      axis: "stage_1_category",
      email_id: args.emailId,
      original_event_id: args.originalEventId,
      original_decision: args.originalStage1Decision,
      decision: args.noiseKey,
      eval_type: "regression",
      operator_id: args.operatorId,
    },
  });

  // Close Kanban row.
  const { data, error } = await admin
    .from("automation_runs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", args.kanbanRowId)
    .eq("swarm_type", args.swarmType)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "row not found or already closed" };

  await emitAutomationRunStale(admin, `${args.swarmType}-kanban`);
  return { ok: true };
}
```

W3 single-field rule: the `c.category_key === args.noiseKey` line MUST be the only place where this file reads the noise key. Do NOT introduce a `c.noise_key || c.category_key` fallback. types.ts confirms `category_key` is the single canonical field; the `||` shipped in earlier drafts as a defensive scaffold and is removed here once the canonical name is locked.

Update `__tests__/reclassify-noise.test.ts` (Plan 01 todo → real test). Mock `loadSwarm`, `loadSwarmNoiseCategories`, `inngest.send`, admin. Cover all 5 behaviors.
  </action>
  <verify>
    <automated>cd web && npx vitest run app/\(dashboard\)/automations/\[swarm\]/kanban/actions/__tests__/reclassify-noise.test.ts && cd web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - File exists at declared path
    - `grep -c "stage_1_category" web/app/\(dashboard\)/automations/\[swarm\]/kanban/actions/reclassify-noise.ts` ≥ 1
    - `grep -c "loadSwarmNoiseCategories" web/app/\(dashboard\)/automations/\[swarm\]/kanban/actions/reclassify-noise.ts` ≥ 1
    - `grep -c "unknown not allowed" web/app/\(dashboard\)/automations/\[swarm\]/kanban/actions/reclassify-noise.ts` ≥ 1 (D-03 deferred-ideas guard)
    - `grep -c "regression" web/app/\(dashboard\)/automations/\[swarm\]/kanban/actions/reclassify-noise.ts` ≥ 1 (eval_type)
    - **W3 single-field gate:** `grep -nE 'noise_key\\s*\\|\\|\\s*category_key|noise_key\\s*\\?\\?\\s*category_key' web/app/\\(dashboard\\)/automations/\\[swarm\\]/kanban/actions/reclassify-noise.ts` returns ZERO matches (no fallback — pick one field name)
    - **W3 canonical field present:** `grep -nE 'c\\.category_key' web/app/\\(dashboard\\)/automations/\\[swarm\\]/kanban/actions/reclassify-noise.ts` ≥ 1 (the canonical field IS used)
    - All 5 test cases pass
    - `cd web && npx tsc --noEmit` exits 0
    - **Cross-swarm validation:** `grep -E "(['\"])(debtor-email|sales-email)\\1" web/app/\(dashboard\)/automations/\[swarm\]/kanban/actions/reclassify-noise.ts web/app/\(dashboard\)/automations/\[swarm\]/kanban/actions/replay.ts web/app/\(dashboard\)/automations/\[swarm\]/kanban/actions/close.ts web/app/\(dashboard\)/automations/\[swarm\]/kanban/_lib/kanban-loader.ts` returns ZERO matches (cross-swarm reuse target — RESEARCH §R-6)
  </acceptance_criteria>
  <done>Reclassify-as-noise emits axis-1 override; verdict-worker handles archive + iController cleanup downstream; W3 single-field gate passes (`category_key` exclusively, no fallback); all guards (unknown, registry, IDOR) in place; cross-swarm grep returns zero literal swarm names.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Operator browser → Server Action | Operator-supplied `kanbanRowId`, `swarmType`, `chosenIntent`, `noiseKey`, `originalEventId` are ALL untrusted |
| Server Action → registry tables | Read-only validation step before any mutation |
| Server Action → automation_runs UPDATE | Compound filter (id + swarm_type + status='pending') prevents cross-swarm IDOR |
| Server Action → Inngest | Trusted; Inngest signs events |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-76-05-01 | T (Tampering) | Operator-supplied `chosenIntent` (replay) | mitigate | `loadSwarmIntents` registry lookup; reject if not found. Rejects injection strings AND typos in one check |
| T-76-05-02 | T (Tampering) | Operator-supplied `noiseKey` (reclassify) | mitigate | `loadSwarmNoiseCategories` registry lookup against the single canonical `category_key` field (W3) + explicit `'unknown'` rejection (D-03 deferred-ideas) |
| T-76-05-03 | S (Spoofing) | Operator-supplied `swarmType` (URL [swarm] segment) | mitigate | `loadSwarm(admin, swarmType)` registry lookup; reject unknown swarm |
| T-76-05-04 | E (Elevation of privilege / IDOR) | Operator closes/replays a row belonging to a different mailbox | mitigate | Compound filter `.eq('id', rowId).eq('swarm_type', swarmType)` on UPDATE; if mismatched, returns 0 rows → action fails |
| T-76-05-05 | T (Tampering) | Replay re-emit with mutated `automation_run_id` payload | mitigate | Server Action does NOT accept arbitrary payload — only kanbanRowId, intent, swarm. Inngest event payload is constructed server-side from validated registry data |
| T-76-05-06 | I (Information disclosure) | Action error messages | accept | Errors are short string codes (`'unknown swarm'`, `'unknown intent'`); no row contents leaked |
| T-76-05-07 | R (Repudiation) | Operator action audit trail | mitigate | All Replay/Reclassify actions emit override events that write `pipeline_events` rows with `operator_id`; permanent audit |
| T-76-05-08 | D (Denial of service) | Repeated rapid-fire Close clicks | accept | Compound filter + status='pending' check makes second click a no-op (returns 0 rows). Realtime broadcast may flood; same-instance idempotent |
| T-76-05-09 | T (Tampering) | Replay with stale `originalEventId` (race against newer Stage 3 emit) | mitigate | W4: loadKanbanRows orders pipeline_events DESC + first-write-wins so the surfaced event_id is always the most-recent prior emit; replay payload references the correct lineage |
</threat_model>

<verification>
- All 4 production files exist; all 4 test files have GREEN tests (no `it.todo`).
- Server Action security: every action validates `swarmType` against `swarms` registry, every payload-supplied key against its registry table.
- Replay branches correctly between same-intent and edited-intent (Pitfall 4 mitigation).
- Reclassify rejects `unknown` defensively (CONTEXT.md deferred-ideas).
- W3: reclassify-noise.ts uses `c.category_key` exclusively — no `||` / `??` fallback against `noise_key`.
- W4: kanban-loader.ts pipeline_events join is deterministic — ordered DESC + first-write-wins Map.
- Cross-swarm grep `'(debtor-email|sales-email)'` literal match against all 4 production files: ZERO matches.
- `cd web && npx tsc --noEmit` exits 0.
- `cd web && npx vitest run app/\(dashboard\)/automations/\[swarm\]/kanban` exits 0.
</verification>

<success_criteria>
- closeKanbanRow, replayKanbanRow, reclassifyAsNoise all production-ready.
- D-01 (Replay axis-3 only when intent differs) and D-03 (axis-1 reclassify with unknown excluded) both implemented per CONTEXT.md.
- IDOR + injection mitigations verified by tests.
- W3 + W4 gates pass: single canonical noise field, deterministic pipeline_events join.
- Cross-swarm reuse target met (zero literal swarm-name branches in Server Action files).
</success_criteria>

<output>
After completion, create `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-05-SUMMARY.md` documenting:
- 4 production files created with line counts
- 4 test files turned GREEN with case counts
- Security gate evidence: cross-swarm grep result + IDOR test results
- W3 gate evidence: grep showing zero `noise_key || category_key` / `noise_key ?? category_key` matches; one or more `c.category_key` matches
- W4 gate evidence: grep showing two `order(...created_at...ascending: false)` matches in kanban-loader; one or more `if (!stage1Map.has(...))` first-write-wins guards; first-write-wins assertion green in kanban-loader.test.ts
- Open known gaps from R-3 (originalEventId nullable) and R-4 (edited-intent → placeholder intent)
</output>
