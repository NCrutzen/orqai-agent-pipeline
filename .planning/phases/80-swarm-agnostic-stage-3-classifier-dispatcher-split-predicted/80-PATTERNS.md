# Phase 80: Swarm-agnostic Stage 3 classifier/dispatcher split — Pattern Map

**Mapped:** 2026-05-08
**Files analyzed:** 9 (4 NEW, 5 MODIFIED)
**Analogs found:** 9 / 9

## File Classification

| File | Status | Role | Data Flow | Closest Analog | Match Quality |
|------|--------|------|-----------|----------------|---------------|
| `web/lib/inngest/functions/stage-3-dispatcher.ts` | NEW | Inngest event-driven function | event-driven (wildcard fan-in → dispatch) | `web/lib/inngest/functions/coordinator-orchestrator.ts` | exact (registry-driven dispatch with handler_status branching) |
| `web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts` | NEW | vitest unit + behavioral test | mock-step replay harness | `web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts` | exact (orchestrator test mocks `loadSwarmIntents` + `inngest.send` + step.run sequence — same surface dispatcher needs) |
| `web/lib/inngest/functions/__tests__/fixtures/stage-3-dispatcher-events.ts` | NEW (optional) | Test fixture module | n/a | None — existing tests inline fixtures (`defaultIntentRow`, ranked-intent shapes) | role-match only; recommend inline per RESEARCH §"Test fixtures (Q9)" |
| `web/scripts/backfill-stuck-classifying-stage3.ts` | NEW | One-shot CLI / Node script | batch transform + DB update | `web/scripts/replay-stage1-unknown-failures.ts` | exact (Supabase service-role + Inngest client + dry-run/--apply + status-guarded UPDATE) |
| `web/lib/inngest/functions/debtor-email-coordinator.ts` | MODIFIED | Inngest event-driven function (refactored) | request-response (classifier) | self (lines 50–240 retained, 241–393 removed) | self-refactor |
| `web/lib/automations/debtor-email/coordinator/escalation-gate.ts` | MODIFIED | Pure function (relocated callsite + bugfix) | transform | self + `web/lib/swarms/registry.ts:80` (loadSwarmIntents row shape) | self-refactor with type-param swap |
| `web/lib/automations/swarm-bridge/sync.ts` | MODIFIED | UI status mapper | transform | self lines 220–266 (`triageStageFromStatus`) | self-refactor (add cases) |
| `web/app/api/inngest/route.ts` | MODIFIED | Runtime registration | config | self (existing import + array append) | self-refactor |
| `docs/agentic-pipeline/stage-3-coordinator.md` | MODIFIED | RFC doc | doc | self + RESEARCH §"State-Machine Doc Update Plan" | self-refactor |

---

## Pattern Assignments

### `web/lib/inngest/functions/stage-3-dispatcher.ts` (NEW — Inngest event-driven function)

**Primary analog:** `web/lib/inngest/functions/coordinator-orchestrator.ts`
**Secondary analog:** `web/lib/inngest/functions/debtor-email-coordinator.ts` lines 241–340 (the chunk being extracted; copy semantics, drop the inline-only step boundaries per RESEARCH §"Replay safety (Q2)")

**Imports pattern** (copy from coordinator-orchestrator.ts:14–22):
```ts
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { loadSwarmIntents } from "@/lib/swarms/registry";
// NEW: import { evaluateEscalationGate } from "@/lib/automations/debtor-email/coordinator/escalation-gate";
//   (call site moves here per RESEARCH Q3)
```

**Function shell + concurrency + retries pattern** (copy from coordinator-orchestrator.ts:29–37; drop entity-key concurrency per RESEARCH §"Concurrency keys"):
```ts
export const stage3Dispatcher = inngest.createFunction(
  {
    id: "automations/stage-3-dispatcher",
    name: "Stage 3.5 Dispatcher (cross-swarm)",
    retries: 0,
    concurrency: [{ key: "event.data.run_id", limit: 1 }],
  },
  // CHANGE vs analog: wildcard trigger instead of fixed event name.
  { event: "*/predicted" } as unknown as { event: keyof import("@/lib/inngest/events").Events },
  async ({ event, step }) => { /* ... */ },
);
```

**Dynamic-send cast pattern** (copy from coordinator-orchestrator.ts:27 + debtor-email-coordinator.ts:45–48):
```ts
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
// Usage: await (inngest.send as unknown as SendFn)({ name: handler_event, data: {...} });
```
Why: dispatcher event payload is dynamic, won't match the closed `Events` map. **MUST inline-call** per CLAUDE.md `inngest.send` this-binding rule (Phase 65 commit `dae6276`).

**Registry lookup pattern** (copy from coordinator-orchestrator.ts:101–112; pass `swarm_type` from event payload, NOT a `SWARM_TYPE` constant):
```ts
const intentRow = await step.run(`resolve-intent-${intent_key}`, async () => {
  const intents = await loadSwarmIntents(admin, swarm_type);
  return intents.find((i) => i.intent_key === intent_key) ?? null;
});
if (!intentRow) {
  throw new Error(`no swarm_intents row for (${swarm_type}, ${intent_key})`);
}
```
**Cross-swarm change vs analog:** `coordinator-orchestrator.ts:22` hardcodes `const SWARM_TYPE = "debtor-email"`. The dispatcher MUST read `swarm_type` from the event payload (and/or `event.name.split("/")[0]`). **Zero hardcoded swarm names** per CONTEXT decision and hard-separation rule.

**Placeholder-branch atomic step.run** (consolidate Phase 76 split-step pattern from debtor-email-coordinator.ts:265–301 into ONE step per RESEARCH §"Replay safety (Q2)"):
```ts
await step.run("dispatch-placeholder", async () => {
  // Idempotency precondition — duplicate */predicted event no-op
  const { data: row } = await admin
    .from("agent_runs").select("status").eq("id", agent_run_id).single();
  if (row?.status !== "predicted") return; // already routed

  const { error } = await admin.from("automation_runs").insert({
    automation: `${swarm_type}-kanban`,
    swarm_type,
    status: "pending",
    topic: intent_key,
    entity,
    result: {
      kanban_reason: "no_handler",
      intent: intent_key,
      confidence,
      email_id,
      automation_run_id: automation_run_id ?? null,
      coordinator_run_id: run_id,
    },
    triggered_by: "stage-3-no-handler",
  });
  if (error) throw new Error(`kanban-no-handler insert: ${error.message}`);

  await admin.from("agent_runs")
    .update({ status: "routed_human_queue" })
    .eq("id", agent_run_id);

  await admin.from("coordinator_runs")
    .update({ completed_at: new Date().toISOString(), completed_handlers: 0 })
    .eq("run_id", run_id);

  await emitAutomationRunStale(admin, `${swarm_type}-kanban`);
});
```
What to copy: insert shape, `kanban_reason` literal, `triggered_by` value, emit-stale call. What to change: collapse into one `step.run` (analog splits across two — per RESEARCH the new boundary is atomic by design); add `agent_runs.status='routed_human_queue'` flip (NEW); add idempotency precondition (NEW).

**Registered-branch step.run** (copy from coordinator-orchestrator.ts:142–157, but simplify — single intent, not fan-out loop):
```ts
await step.run("dispatch-registered", async () => {
  const { data: row } = await admin
    .from("agent_runs").select("status").eq("id", agent_run_id).single();
  if (row?.status !== "predicted") return;

  await (inngest.send as unknown as SendFn)({
    name: intentRow.handler_event,
    data: { run_id, email_id, automation_run_id, intent: intent_key, ranked, budget_run_id, swarm_type },
  });

  await admin.from("coordinator_runs")
    .update({ completed_at: new Date().toISOString(), completed_handlers: 1 })
    .eq("run_id", run_id);
});
// NOTE: do NOT flip agent_runs.status — Stage 4 handler owns that transition
// (per CONTEXT locked decision, "handler-owned statuses").
```

**Error handling pattern** (copy from coordinator-orchestrator.ts:161–181):
```ts
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  await step.run("mark-failed", async () => {
    if (automation_run_id) {
      await admin.from("automation_runs").update({
        status: "failed", error_message: msg, completed_at: new Date().toISOString(),
      }).eq("id", automation_run_id);
    }
    await admin.from("coordinator_runs")
      .update({ completed_at: new Date().toISOString() })
      .eq("run_id", run_id);
    await emitAutomationRunStale(admin, `${swarm_type}-review`);
  });
  throw err;
}
```

**Reserved future hook (Stage 3.5 fan-out re-enable seam)** — per CONTEXT and Pitfall 6: leave a documented placeholder branch like `if (false /* TODO Phase 80.x: orchestrator fan-out re-enable */) { ... }` rather than active code, so the orchestrator's defensive `handler_status` check at coordinator-orchestrator.ts:93–123 stays unique source-of-truth.

---

### `web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts` (NEW — vitest)

**Primary analog:** `web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts` lines 1–120
**Secondary analog:** `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` lines 1–120 (richer Supabase mock for inserts + updates)

**Inngest mock + createFunction stub** (copy from debtor-email-orchestrator.test.ts:4–12):
```ts
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
    createFunction: vi.fn((cfg, _trigger, handler) => ({ __config: cfg, handler })),
  },
}));
```

**`loadSwarmIntents` mock with both `registered` + `placeholder` rows** (copy from debtor-email-orchestrator.test.ts:26–58):
```ts
type IntentRow = {
  swarm_type: string; intent_key: string; handler_agent_key: string | null;
  handler_event: string; handler_status: "registered" | "placeholder";
  requires_orchestration: boolean; created_at: string; updated_at: string;
};
const placeholderRow = (intent: string): IntentRow => ({
  swarm_type: "debtor-email", intent_key: intent, handler_agent_key: null,
  handler_event: `debtor-email/${intent}.requested`,
  handler_status: "placeholder", requires_orchestration: false,
  created_at: "2026-05-08T00:00:00Z", updated_at: "2026-05-08T00:00:00Z",
});
```
**What to add vs analog:** sales-email rows for the cross-swarm wildcard test (must_have #6) and per-test override returning `handler_status='placeholder'`.

**Supabase chainable mock** (copy from debtor-email-orchestrator.test.ts:62–98 — captures `.from()`/`.select()`/`.eq()`/`.single()`/`.update()`/`.insert()`). Extend with status-precondition return: `.single() → { data: { status: "predicted" }, error: null }` for the happy path; override to `routed_human_queue` for the duplicate-event no-op test.

**Mock step.run** (copy from debtor-email-orchestrator.test.ts:107–117):
```ts
function makeStep() {
  const callOrder: string[] = [];
  return {
    callOrder,
    step: {
      run: vi.fn(async (name: string, fn: () => unknown) => {
        callOrder.push(name); return fn();
      }),
    },
  };
}
```

**Required test cases** (per RESEARCH §"Wave 0 Gaps" + must_haves):
- `placeholder routes to kanban + flips agent_runs.status='routed_human_queue'`
- `registered emits handler_event from swarm_intents (does NOT flip status)`
- `wildcard routes sales-email/predicted` (cross-swarm, must_have #6)
- `duplicate */predicted event for same agent_run_id is no-op` (idempotency precondition)
- `replay does not duplicate kanban` (assert single insert across two handler invocations sharing the same status precondition)

---

### `web/scripts/backfill-stuck-classifying-stage3.ts` (NEW — one-shot CLI script)

**Primary analog:** `web/scripts/replay-stage1-unknown-failures.ts` (read in full)

**Header comment + usage** (copy structure from analog lines 1–22):
```ts
/**
 * Phase 80 backfill — flip stranded `agent_runs.status='classifying'` rows
 * to `routed_human_queue` when a matching debtor-email-kanban automation_runs
 * row already exists.
 *
 * Usage:
 *   cd web
 *   npx tsx scripts/backfill-stuck-classifying-stage3.ts            # dry-run
 *   npx tsx scripts/backfill-stuck-classifying-stage3.ts --apply    # apply
 *   npx tsx scripts/backfill-stuck-classifying-stage3.ts --apply --confirm-prod
 */
```

**Env validation pattern** (copy from analog lines 26–46):
```ts
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
```
**Add (RESEARCH §"Safety guards"):** `--confirm-prod` flag + literal-prompt input gate per CLAUDE.md test-first pattern. Default to acceptance/test creds.

**Status-guarded UPDATE pattern** (analog lines 113–122 show `.eq("status", "failed")` race-guard — same shape needed here):
```ts
// CRITICAL: WHERE status='classifying' guard prevents racing with the new dispatcher.
const { error: updErr } = await admin
  .from("agent_runs")
  .update({ status: "routed_human_queue" })
  .eq("id", agent_run_id)
  .eq("status", "classifying");  // race guard
```

**Three-bucket exhaustive routing** (NEW vs analog; analog has only emit/skip):
```ts
// Bucket 1: HAS_KANBAN (kanban_rows === 1) → flip status
// Bucket 2: NO_KANBAN (kanban_rows === 0) → write to ./backfill-stuck-no-kanban.json
// Bucket 3: MULTI_KANBAN (kanban_rows >= 2) → write to ./backfill-multi-kanban.json (do NOT flip)
```

**Dry-run / sample print pattern** (copy analog's count + per-row console pattern lines 105–109):
```ts
console.log(
  `[backfill] ${apply ? "FLIP" : "would flip"} agent_run=${run.id} email_id=${email_id} kanban=${kanban_rows}`,
);
```

---

### MODIFIED `web/lib/inngest/functions/debtor-email-coordinator.ts`

**Self-refactor.** Reference: own file, current state.

**KEEP (lines 50–220):**
- Function shell, retries, concurrency keys (lines 50–60).
- `resolve-run-id` step (lines 90–95) — replay-safe id pattern.
- `create-agent-run`, `create-coordinator-run`, `classify-intent`, `persist-ranked` steps (lines 100–220).
- Error/catch block (lines 401–421).

**REPLACE the block at line ~221 onwards (escalation-gate eval and everything below):**

Old (lines 222–393): `evaluate-escalation-gate` step → `write-escalation` step → `if (decision.kind === "single_shot")` mega-block (incl. placeholder Kanban + `dispatch-single-shot`) → kanban-low-confidence block.

New (per CONTEXT decisions 7–8):
```ts
// ---- 5) Flip agent_runs.status: classifying → predicted ----
await step.run("flip-status-predicted", async () => {
  const { error } = await supabase
    .from("agent_runs")
    .update({ status: "predicted" })
    .eq("id", agent_run_id)
    .eq("status", "classifying"); // race guard
  if (error) throw new Error(`flip-status-predicted: ${error.message}`);
});

// ---- 6) Emit <swarm>/predicted event for the dispatcher ----
await step.run("emit-predicted", async () => {
  await (inngest.send as unknown as DynamicSend)({
    name: `${SWARM_TYPE}/predicted`,
    data: {
      swarm_type: SWARM_TYPE,
      run_id, agent_run_id, email_id,
      automation_run_id: automation_run_id ?? null,
      budget_run_id: budget_run_id ?? null,
      ranked: output.ranked,
      language: output.language,
      urgency: output.urgency,
      entity,
    },
  });
});

return { run_id, email_id, decision: "predicted" as const };
```

**REMOVE entirely:**
- `loadSwarmNoiseCategories` import + `evaluate-escalation-gate` step + `write-escalation` step (escalation moves to dispatcher per RESEARCH Q3 recommendation).
- `if (decision.kind === "single_shot")` branch lines 241–348 (incl. placeholder Kanban write at 264–308 and `dispatch-single-shot` at 312–325 — both move to dispatcher).
- Phase 76 low-confidence Kanban block lines 357–393 (also moves to dispatcher).
- `loadSwarmIntents` import (no longer needed in classifier — dispatcher loads it).

**Test file companion update** (`debtor-email-coordinator.test.ts`): per RESEARCH §"Wave 0 Gaps", strip dispatch assertions; add `flip-status-predicted` and `emit-predicted` step assertions.

---

### MODIFIED `web/lib/automations/debtor-email/coordinator/escalation-gate.ts`

**Self-refactor + bugfix per RESEARCH §"Pitfall 1" / hard-separation rule.**

**Current signature (lines 24–27):**
```ts
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";
export function evaluateEscalationGate(
  output: IntentAgentOutputV2,
  categories: SwarmNoiseCategoryRow[],
): EscalationDecision { /* ... */ }
```

**New signature** (param type swap — load via `loadSwarmIntents` at call site):
```ts
import type { SwarmIntentRow } from "@/lib/swarms/types"; // verify type exists
export function evaluateEscalationGate(
  output: IntentAgentOutputV2,
  intents: SwarmIntentRow[],
): EscalationDecision { /* ... */ }
```

**Lookup fix at lines 41–45:**
```ts
// OLD (broken — hard-separation violation, looks up intent_key on noise table):
const flagged = output.ranked.some(
  (r) => categories.find((c) => c.category_key === r.intent)?.requires_orchestration === true,
);

// NEW (registry-correct — intent_key on swarm_intents, where requires_orchestration lives
// per migration 20260504b_swarms_registry_generalisation.sql:94):
const flagged = output.ranked.some(
  (r) => intents.find((i) => i.intent_key === r.intent)?.requires_orchestration === true,
);
```

**Function stays pure** (Phase 76 D-09 invariant preserved). Only the data-source param type changes. Call site relocates from coordinator (line 223–226) to the dispatcher.

---

### MODIFIED `web/lib/automations/swarm-bridge/sync.ts`

**Self-refactor — add cases per RESEARCH §"UI Impact Analysis (Q5)".**

**`triageStageFromStatus` at lines 220–240 — current:**
```ts
case "classifying":
case "fetching_document":
case "generating_body":
case "creating_draft":
  return "progress";
case "routed_human_queue":   // already correct — Phase 80 terminal lands in review
case "copy_document_drafted":
case "copy_document_needs_review":
case "copy_document_failed_not_found":
  return "review";
```

**Add (around line 226):**
```ts
case "predicted":
  // Stage 3 classifier emitted; dispatcher about to route. Sub-second
  // transient under healthy conditions. Keep at "progress" so a healthy
  // row doesn't surface to operators — only routed_human_queue does.
  return "progress";
```

**Also extend `triageAgentFromStatus` (lines 242–256):**
```ts
case "predicted":
  return "Stage 3 Dispatcher";
```

**DO NOT TOUCH** the `automation_runs.status='predicted'` paths at lines 35, 64, 588, 663 — different table, different feature (Bulk Review predicted-row queue from Phase 60). Verified via RESEARCH audit table.

---

### MODIFIED `web/app/api/inngest/route.ts`

**Self-refactor — add import + array entry.**

Pattern (existing — copy structure from line 39 + line 74):
```ts
// Imports block (alphabetical-ish by feature):
import { stage3Dispatcher } from "@/lib/inngest/functions/stage-3-dispatcher";

// In the functions array passed to serve():
functions: [
  // ... existing entries ...
  coordinatorOrchestrator,
  coordinatorSynthesis,
  stage3Dispatcher,           // NEW — registers wildcard "*/predicted" subscriber
  debtorEmailOverrideHandler,
],
```

---

### MODIFIED `docs/agentic-pipeline/stage-3-coordinator.md`

**Self-refactor — RFC update per RESEARCH §"State-Machine Doc Update Plan (Q7)".**

**Sections to add:**
1. `## State Machine` — Mermaid `stateDiagram-v2` (classifying → predicted → {routed_human_queue | handler-owned}; failed terminal).
2. `## Transition Table` — From/To/Writer/Trigger columns.
3. `## Stuck-Status Meaning (Monitoring)` — classifying-stuck=classifier bug (page); predicted-stuck=dispatcher bug (page); routed_human_queue=expected (no alert).
4. `## Cross-Swarm Dispatcher Contract` — wildcard `*/predicted` event, payload schema link, `swarm_intents` source-of-truth, "adding a new swarm = registry rows + classifier function, no dispatcher code change."

**Sections to update:**
- `## Goal` — soften "single-shot default in coordinator" wording.
- `## Architecture` diagram — split into Stage 3 classifier + Stage 3.5 dispatcher boxes joined by `{swarm}/predicted` event.
- `## Stage 3.5 Escalation` — re-frame: gate now lives in dispatcher; same rules, different home; hard-separation rule unchanged (gate consumes `swarm_intents`, never `swarm_noise_categories`).

---

## Shared Patterns

### Inngest replay safety
**Source:** `web/lib/inngest/functions/debtor-email-coordinator.ts:90–95` + CLAUDE.md "Replay-onveilige id-generatie".
**Apply to:** `stage-3-dispatcher.ts` (any UUID/timestamp-as-key).
```ts
const id = await step.run("resolve-id", async () =>
  event.data.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as { randomUUID(): string }).randomUUID()
    : `local-${Date.now()}`),
);
```
Note: dispatcher's `automation_runs.id` is Postgres-generated, so this concern is mostly informational — relevant only if any TS-side UUID enters the code.

### `inngest.send` this-binding cast (Phase 65 commit `dae6276`)
**Source:** `web/lib/inngest/functions/debtor-email-coordinator.ts:45–48` + `coordinator-orchestrator.ts:27`.
**Apply to:** `stage-3-dispatcher.ts`, classifier emit-predicted step, backfill script if it sends events.
```ts
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
await (inngest.send as unknown as SendFn)({ name, data });
```
Never alias/destructure `inngest.send`; always inline-call within the closure.

### Wildcard / dynamic event-name typing
**Source:** `web/lib/inngest/functions/coordinator-orchestrator.ts:36`.
```ts
{ event: "debtor-email/orchestrator.requested" } as unknown as { event: keyof import("@/lib/inngest/events").Events }
```
**Apply to:** dispatcher trigger (`{ event: "*/predicted" }` cast through the same shape — wildcard names are not statically typeable in the `Events` map).

### Status-guarded UPDATE (race protection)
**Source:** `web/scripts/replay-stage1-unknown-failures.ts:121–122` (`.eq("id", run.id).eq("status", "failed")`).
**Apply to:** classifier `flip-status-predicted` step, dispatcher placeholder/registered preconditions, backfill script.

### `loadSwarmIntents` registry helper
**Source:** `web/lib/swarms/registry.ts:80`.
**Apply to:** dispatcher (replaces hardcoded `SWARM_TYPE`); escalation-gate caller; tests mock the same import path.

### `emitAutomationRunStale` realtime broadcast (terminal step, never first)
**Source:** `web/lib/automations/runs/emit.ts:16` + usage at `coordinator-orchestrator.ts:137`, `debtor-email-coordinator.ts:122/285/300/338/379/392/418`.
**Apply to:** dispatcher placeholder branch (last call inside the atomic `step.run`); classifier on `agent_runs.status` flip if review-queue surface needs refresh.

### Test mock-step shell (vitest)
**Source:** `web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts:4–117`.
**Apply to:** `stage-3-dispatcher.test.ts`. Includes:
- `vi.mock("@/lib/inngest/client", ...)` createFunction stub returning `{ __config, handler }`
- `vi.mock("@/lib/swarms/registry", ...)` with overridable `loadSwarmIntents` per test
- Chainable `createAdminClient` mock with insert/update/select/eq/single capturing
- `makeStep()` factory recording `callOrder`

### CLI script env-validation + dry-run / --apply / production gate
**Source:** `web/scripts/replay-stage1-unknown-failures.ts:26–46, 48, 105–143`.
**Apply to:** `web/scripts/backfill-stuck-classifying-stage3.ts`.

### Hard-separation invariant (RFC-locked)
**Source:** `docs/agentic-pipeline/stage-3-coordinator.md` + `stage-1-regex.md`.
**Apply to:** dispatcher MUST consume `swarm_intents` only; escalation-gate refactor swaps `SwarmNoiseCategoryRow[]` → `SwarmIntentRow[]`; new tests must NOT mock `loadSwarmNoiseCategories` for any Phase 80 code path.

---

## No Analog Found

None. Every Phase 80 file has at least one role-match analog in-repo. Note: the `web/lib/inngest/functions/__tests__/fixtures/` directory does NOT exist; existing tests inline fixtures, and RESEARCH §"Test fixtures (Q9)" recommends inline. The optional fixture file in the kickoff brief is a stylistic preference — a separate fixtures module is not warranted by the codebase pattern.

---

## Migration / Registry Notes

- **No new migration for `agent_runs.status`** — RESEARCH §"Resolved After Research" + CONTEXT confirm the existing CHECK constraint already accepts both `predicted` and `routed_human_queue`. (RESEARCH §"`agent_runs.status` literal-union vs `automation_runs.status`" raised this as Open Question #1; CONTEXT closes it.) Planner should still grep `web/lib/automations/debtor-email/coordinator/types.ts:39–51` to confirm `STATUS` literal-union includes both — if `predicted` is missing from the TS type only, that's a pure type addition (no DDL).
- **`swarm_intents` schema unchanged** — `handler_status`, `handler_event`, `requires_orchestration` columns already populated for debtor-email per migration `20260507_phase76_swarm_intents_handler_status.sql`. Dispatcher reads existing shape via `loadSwarmIntents`.
- **Sales-email seed OUT OF SCOPE** (CONTEXT §"Resolved After Research" #3) — Phase 78 owns sales-email rows. Phase 80's cross-swarm test uses debtor-email rows or a synthetic test swarm, not real sales-email data.

## Metadata

**Analog search scope:** `web/lib/inngest/functions/`, `web/lib/inngest/functions/__tests__/`, `web/scripts/`, `web/lib/automations/swarm-bridge/`, `web/lib/automations/debtor-email/coordinator/`, `web/lib/swarms/`, `web/app/api/inngest/`, `docs/agentic-pipeline/`.
**Files scanned:** ~14 (8 read in full or targeted; 6 grep'd for signatures).
**Pattern extraction date:** 2026-05-08.
