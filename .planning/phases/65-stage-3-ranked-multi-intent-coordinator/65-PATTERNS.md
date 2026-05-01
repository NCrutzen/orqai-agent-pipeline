# Phase 65: Stage 3 Ranked Multi-Intent Coordinator — Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 14 (7 created, 4 modified, 3 migrations + tests)
**Analogs found:** 14 / 14 (every new file has a strong in-repo analog)

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `web/lib/automations/debtor-email/triage/types.ts` (M) | model / schema | transform | self (existing v1 schema) | exact (extend in place) |
| `web/lib/automations/debtor-email/triage/invoke-intent.ts` (M) | service / transport | request-response | self + `orq-agents/client.ts` | exact (rewrite parser) |
| `web/lib/inngest/functions/debtor-email-triage.ts` (M) | controller / Inngest fn | event-driven | `classifier-verdict-worker.ts` (registry dispatch); existing self for cache pattern | exact |
| `web/lib/agentic-pipeline/types.ts` (NEW) | model / canonical type | n/a (type-only) | `web/lib/swarms/types.ts` | role-match |
| `web/lib/inngest/functions/coordinator-orchestrator.ts` (NEW) | controller / Inngest fn | event-driven (fan-out) | `classifier-verdict-worker.ts` (`swarm_dispatch` block 149-176) + `classifier-label-resolver.ts` (parallel `step.run`) | exact |
| `web/lib/inngest/functions/coordinator-synthesis.ts` (NEW) | controller / Inngest fn | event-driven (fan-in consumer) | `debtor-email-triage.ts` lines 246-293 (body agent + draft create) + `classifier-label-resolver.ts` | role-match |
| `supabase/migrations/<date>_coordinator_runs.sql` (NEW) | migration | DDL | `20260429b_swarm_registry.sql` (table + trigger + RLS + grants) | role-match |
| `supabase/migrations/<date>_swarm_categories_requires_orchestration.sql` (NEW) | migration | DDL + seed | `20260429h_swarm_categories_unknown_dispatch.sql` (alter + reseed) | exact |
| `supabase/migrations/<date>_coordinator_complete_handler_rpc.sql` (NEW) | migration | RPC | `20260429b_swarm_registry.sql` § functions/triggers (plpgsql pattern) | role-match |
| `web/lib/automations/debtor-email/handlers/output-adapter.ts` (NEW) | utility / adapter | transform | none direct — closest is `agent-runs.ts` mergeToolOutputs shape | partial (no analog) |
| `tests/coordinator-schema.test.ts` (NEW) | test | unit | `web/lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts` (mock-step) | exact |
| `tests/escalation-gate.test.ts` (NEW) | test | unit (pure fn) | `web/lib/stage-0/__tests__/budget-counter.test.ts` (pure module) | role-match |
| `tests/orchestrator-dispatch.test.ts`, `synthesis.test.ts`, `partial-synthesis.test.ts`, `idempotency-cache.test.ts`, `registry-vocabulary.test.ts`, `output-adapter.test.ts` (NEW) | test | unit/integration | `stage-0-safety-worker.test.ts` mock-step strategy | exact |

---

## Pattern Assignments

### `web/lib/automations/debtor-email/triage/types.ts` (model, transform — modified)

**Analog:** self — extend the existing zod schema block.

**Existing pattern to mirror** (`triage/types.ts:77-95`):
```typescript
export const INTENT_VERSION = "2026-04-23.v1" as const;

export const intentAgentOutputSchema = z.object({
  intent: z.enum(INTENT),
  sub_type: z.enum(SUB_TYPE).nullable(),
  document_reference: z.string().max(64).nullable(),
  urgency: z.enum(URGENCY),
  language: z.enum(LANGUAGE),
  confidence: z.enum(CONFIDENCE),
  reasoning: z.string().max(500),
  intent_version: z.literal(INTENT_VERSION),
});
export type IntentAgentOutput = z.infer<typeof intentAgentOutputSchema>;
```

**To add (V2 alongside V1)** — keep v1 export for Phase 66 backfill comparator:
```typescript
export const INTENT_VERSION_V2 = "2026-05-01.v2" as const;

export const rankedIntentEntrySchema = z.object({
  intent: z.enum(INTENT),
  confidence: z.enum(CONFIDENCE),
  document_reference: z.string().max(64).nullable(),
  sub_type: z.enum(SUB_TYPE).nullable(),
  reasoning: z.string().max(200),
});

export const intentAgentOutputSchemaV2 = z.object({
  ranked: z.array(rankedIntentEntrySchema).min(1).max(5), // RESEARCH OQ6 — bound prompt blow-up
  language: z.enum(LANGUAGE),
  urgency: z.enum(URGENCY),
  intent_version: z.literal(INTENT_VERSION_V2),
});
export type IntentAgentOutputV2 = z.infer<typeof intentAgentOutputSchemaV2>;
```

**Critical:** the literal `INTENT_VERSION_V2` MUST equal the agent's `output_schema.intent_version.const` exactly (RESEARCH Pitfall 4).

---

### `web/lib/automations/debtor-email/triage/invoke-intent.ts` (service, request-response — modified)

**Analog:** self.

**Imports + transport (keep verbatim)** — `invoke-intent.ts:1-9, 91-117`:
```typescript
const ORQ_ENDPOINT = "https://api.orq.ai/v2/agents";
const AGENT_KEY = "debtor-intent-agent";  // unchanged per D-01
const TIMEOUT_MS = 45_000;
// ...
const res = await fetch(`${ORQ_ENDPOINT}/${AGENT_KEY}/responses`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(TIMEOUT_MS),
});
```

**Validator swap** — `invoke-intent.ts:134-143`:
```typescript
const validated = intentAgentOutputSchema.safeParse(parsed); // OLD
//   ↓ change to:
const validated = intentAgentOutputSchemaV2.safeParse(parsed);
```
And update `InvokeIntentResult` type alias to `IntentAgentOutputV2`.

**Strip-fence parser stays** — `invoke-intent.ts:118-132` is unchanged (Orq returns text-wrapped JSON, sometimes with ```json fence).

---

### `web/lib/inngest/functions/debtor-email-triage.ts` (controller, event-driven — rewritten in place)

**Analog 1 — Function shell + retries:0:** `classifier-verdict-worker.ts:28-31`:
```typescript
export const classifierVerdictWorker = inngest.createFunction(
  { id: "classifier/verdict-worker", retries: 0 },
  { event: "classifier/verdict.recorded" },
  async ({ event, step }) => {
```
Phase 65 keeps the existing function id `automations/debtor-email-triage` (D-10) and (per RESEARCH OQ3) sets:
```typescript
{
  id: "automations/debtor-email-triage",
  retries: 0,                                                    // change from retries: 3
  concurrency: [
    { key: "event.data.entity",  limit: 4 },
    { key: "event.data.run_id",  limit: 1 },
  ],
}
```

**Analog 2 — Idempotent classify step (keep verbatim, swap version literal):** `debtor-email-triage.ts:60-98`:
```typescript
const firstPass = await step.run("classify-intent", async () => {
  const cached = await findCachedOutput<Record<string, unknown>>(
    supabase, email_id, "intent_version", INTENT_VERSION_V2, "tool_outputs",  // V2 literal
  );
  const cachedFirst = cached?.intent_first_pass as IntentAgentOutputV2 | undefined;
  if (cachedFirst) return cachedFirst;

  const { output } = await invokeIntentAgent({ /* same args */ });
  await mergeToolOutputs(supabase, agent_run_id, "intent_first_pass", output);
  await updateRun(supabase, agent_run_id, { /* same shape; ranked[0] hoisted for back-compat columns */ });
  return output;
});
```
v1 cache invalidates "for free" (RESEARCH Pattern 3). **No SQL migration of `agent_runs` rows.**

**Analog 3 — Registry-driven dispatch (single-shot path):** `classifier-verdict-worker.ts:149-176`:
```typescript
case "swarm_dispatch": {
  if (!category.swarm_dispatch) {
    throw new Error(`swarm_dispatch action requires swarm_dispatch event name (...)`);
  }
  await step.run("dispatch", async () => {
    await (inngest.send as unknown as (payload: {
      name: string; data: Record<string, unknown>;
    }) => Promise<unknown>)({
      name: category.swarm_dispatch!,
      data: { automation_run_id, swarm_type, category_key: finalCategoryKey, message_id, source_mailbox },
    });
  });
  break;
}
```
Phase 65 single-shot path uses the **identical idiom**, swapping `finalCategoryKey` → `ranked[0].intent` and adding `{ run_id, budget_run_id, ranked }` to the data payload (so Phase 71's override UI sees the full list).

**Analog 4 — Failure mark + emitAutomationRunStale envelope:** `classifier-verdict-worker.ts:198-212` (try/catch with mark-failed step) and `classifier-label-resolver.ts:166-185` (final close-out + stale broadcast). New triage uses both:
```typescript
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  await step.run("mark-failed", async () => {
    await admin.from("automation_runs").update({
      status: "failed", error_message: msg, completed_at: new Date().toISOString(),
    }).eq("id", automation_run_id);
    await emitAutomationRunStale(admin, `${swarm_type}-review`);
  });
  throw err;
}
```

**Escalation gate (pure fn, NEW co-located module suggested at `web/lib/automations/debtor-email/coordinator/escalation-gate.ts`):** signature derived from D-09 / RESEARCH §Code Examples:
```typescript
export type EscalationDecision =
  | { kind: "single_shot" }
  | { kind: "orchestrator"; reason: "low_confidence" | "high_intent_count" | "requires_orchestration_flag" };

export function evaluateEscalationGate(
  output: IntentAgentOutputV2,
  categories: SwarmCategoryRow[],
): EscalationDecision { /* see RESEARCH lines 403-419 */ }
```
Categories loaded via `loadSwarmCategories(admin, "debtor-email")` — `web/lib/swarms/registry.ts:40-62`. The 60s TTL cache is reused for free.

---

### `web/lib/agentic-pipeline/types.ts` (NEW canonical type)

**Analog:** `web/lib/swarms/types.ts:1-44` (single-purpose type module, no runtime imports).

**Pattern:**
```typescript
// Phase 65 (D-06). Cross-swarm canonical handler OUTPUT shape.
// Phase 69 will canonicalise the INPUT shape — keep this file output-only.

export type HandlerContentKind = "draft_body" | "action_confirmation" | "data_payload";
export type HandlerLanguage    = "nl" | "fr" | "en" | "de";
export type HandlerTone        = "neutral" | "de-escalation";
export type HandlerConfidence  = "low" | "medium" | "high";

export interface HandlerOutput {
  handler_key: string;
  intent: string;
  content_kind: HandlerContentKind;
  content: string;
  language: HandlerLanguage;
  tone: HandlerTone;
  references: string[];
  confidence: HandlerConfidence;
}
```
Mirror `swarms/types.ts` style: types only, doc comment naming the phase + decision id.

---

### `web/lib/inngest/functions/coordinator-orchestrator.ts` (NEW Inngest fn)

**Analog 1 — function shell + retries:0:** `classifier-verdict-worker.ts:28-31` (same as triage rewrite).

**Analog 2 — Orq invocation:** `web/lib/automations/orq-agents/client.ts:113-195`:
```typescript
const { raw, agent, usage } = await invokeOrqAgent("debtor-orchestrator-agent", {
  email, ranked, context,
});
```
Then zod-validate `raw` client-side (defence-in-depth — same posture as `invoke-intent.ts:134`).

**Analog 3 — Fan-out via inngest.send (loop):** `classifier-verdict-worker.ts:156-175` (single send) extended to a loop. Codebase has no fan-out precedent in a single function, but the cleanup-dispatcher pattern is referenced in RESEARCH. Follow the same `(inngest.send as unknown as ...)` cast:
```typescript
await step.run("update-expected-count", async () =>
  admin.from("coordinator_runs")
    .update({ expected_handlers: plan.handlers.length })
    .eq("run_id", run_id),
);
await step.run("fan-out", async () => {
  await Promise.all(plan.handlers.map(h =>
    (inngest.send as unknown as (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>)({
      name: `debtor-email/${h.intent}.requested`,
      data: { run_id, budget_run_id, intent: h.intent, context_payload: h.context_payload, automation_run_id, /* … */ },
    })
  ));
});
```
**Note:** `Promise.all` of `inngest.send` is **not** the same as `step.invoke` — each send is a fire-and-forget event emission. RESEARCH Pitfall 3 + the architecture diagram both confirm this is the chosen primitive (no `step.invoke` exists anywhere in the repo).

---

### `web/lib/inngest/functions/coordinator-synthesis.ts` (NEW Inngest fn)

**Analog 1 — function shell:** identical to `classifier-label-resolver.ts:22-25`:
```typescript
export const coordinatorSynthesis = inngest.createFunction(
  { id: "automations/debtor-email-synthesis", retries: 0 },
  { event: "debtor-email/synthesis.requested" },
  async ({ event, step }) => { /* … */ }
);
```

**Analog 2 — Load handler outputs from `agent_runs.tool_outputs`:** `classifier-label-resolver.ts:37-61` (parallel `Promise.all` of `step.run` reads):
```typescript
const handlerOutputs = await step.run("load-handler-outputs", async () => {
  const { data } = await admin.from("agent_runs")
    .select("tool_outputs, intent")
    .eq("coordinator_run_id", run_id);
  return (data ?? []).map(toHandlerOutput); // adapter from output-adapter.ts
});
```

**Analog 3 — iController draft creation:** `debtor-email-triage.ts:319-383` (call existing `/api/automations/debtor/create-draft` route — RESEARCH "Don't Hand-Roll" table). Reuse verbatim.

**Analog 4 — Final persist + Bulk Review revalidation:** `classifier-label-resolver.ts:166-185`:
```typescript
await step.run("persist", async () => {
  await admin.from("coordinator_runs").update({
    completed_at: new Date().toISOString(),
    partial_synthesis: failedHandlers > 0,
  }).eq("run_id", run_id);
  await emitAutomationRunStale(admin, "debtor-email-review");
});
```

**Partial-synthesis (D-05):** mirror handler-failure path of `label-resolver` — error caught, written to `agent_runs.error`, run continues. Synthesis input filters to only successful entries; footer notes the rest.

---

### `supabase/migrations/<date>_coordinator_runs.sql` (NEW)

**Analog:** `20260429b_swarm_registry.sql:11-65` (CREATE TABLE + trigger + RLS + publication).

**Apply this scaffolding verbatim** for `coordinator_runs`:
```sql
create table if not exists public.coordinator_runs (
  run_id              uuid primary key,
  automation_run_id   uuid references public.automation_runs(id),
  email_id            text not null,
  swarm_type          text not null,
  ranked_intents      jsonb not null,
  escalation_decision text not null check (escalation_decision in ('single_shot','orchestrator')),
  escalation_reason   text,
  expected_handlers   int  not null default 1,
  completed_handlers  int  not null default 0,
  failed_handlers     int  not null default 0,
  partial_synthesis   boolean not null default false,
  budget_run_id       text,
  synthesis_dispatched_at timestamptz,            -- RESEARCH Pitfall 2 race-guard
  cost_cents_total    int not null default 0,    -- RESEARCH Pitfall 5 / OQ4
  tokens_total        int not null default 0,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create index if not exists coordinator_runs_run_idx on public.coordinator_runs (run_id);
create index if not exists coordinator_runs_swarm_idx on public.coordinator_runs (swarm_type, created_at desc);

-- updated_at trigger (mirror swarms_set_updated_at at line 49-56)
-- RLS (mirror lines 67-83): service_role all, authenticated select
-- Realtime publication (mirror lines 139-153) for Bulk Review live updates
```

---

### `supabase/migrations/<date>_swarm_categories_requires_orchestration.sql` (NEW — CRITICAL: registry vocabulary fix)

**Analog:** `20260429h_swarm_categories_unknown_dispatch.sql` (small ALTER + reseed). Combined with seed pattern at `20260429b_swarm_registry.sql:120-135`.

**Pattern — combined ALTER + intent-vocabulary seed (RESEARCH Pitfall 1):**
```sql
-- D-08: column for tri-state escalation gate.
alter table public.swarm_categories
  add column if not exists requires_orchestration boolean not null default false;

-- RESEARCH Pitfall 1: today's swarm_categories holds Stage 1 noise buckets, not
-- Stage 3 INTENT enum keys. Without this seed, single-shot dispatch logs
-- "no swarm_dispatch registered for intent=copy_document_request" on every
-- fast-path email. We seed the 8 INTENT vocabulary rows here. Phase 68
-- migrates them cleanly to swarm_intents (rename + table move only).
insert into public.swarm_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, requires_orchestration, display_order)
values
  ('debtor-email','copy_document_request','Copy document request', null, 'swarm_dispatch', 'debtor-email/copy_document_request.requested', false, 100),
  ('debtor-email','payment_dispute',      'Payment dispute',       null, 'swarm_dispatch', 'debtor-email/payment_dispute.requested',       true,  110),
  ('debtor-email','address_change',       'Address change',        null, 'swarm_dispatch', 'debtor-email/address_change.requested',        false, 120),
  ('debtor-email','peppol_request',       'Peppol request',        null, 'swarm_dispatch', 'debtor-email/peppol_request.requested',        false, 130),
  ('debtor-email','credit_request',       'Credit request',        null, 'swarm_dispatch', 'debtor-email/credit_request.requested',        true,  140),
  ('debtor-email','contract_inquiry',     'Contract inquiry',      null, 'swarm_dispatch', 'debtor-email/contract_inquiry.requested',      false, 150),
  ('debtor-email','general_inquiry',      'General inquiry',       null, 'swarm_dispatch', 'debtor-email/general_inquiry.requested',       false, 160),
  ('debtor-email','other',                'Other',                 null, 'swarm_dispatch', 'debtor-email/other.requested',                 true,  170)
on conflict (swarm_type, category_key) do update set
  display_label          = excluded.display_label,
  action                 = excluded.action,
  swarm_dispatch         = excluded.swarm_dispatch,
  requires_orchestration = excluded.requires_orchestration,
  display_order          = excluded.display_order,
  updated_at             = now();
```
**The 8 rows MUST exactly match `INTENT` in `triage/types.ts:17-26`** (RESEARCH A7 — verify in plan-checker).

---

### `supabase/migrations/<date>_coordinator_complete_handler_rpc.sql` (NEW)

**Analog:** plpgsql trigger pattern at `20260429b_swarm_registry.sql:49-65`.

**Pattern (RPC fan-in, RESEARCH Pattern 4 + Pitfall 2 race-guard):**
```sql
create or replace function public.coordinator_complete_handler(
  p_run_id uuid,
  p_failed boolean default false
)
returns table(completed_handlers int, expected_handlers int, claim_synthesis boolean)
language plpgsql
as $$
declare v_row public.coordinator_runs%rowtype;
begin
  -- Atomic increment.
  update public.coordinator_runs
     set completed_handlers = completed_handlers + 1,
         failed_handlers    = failed_handlers + case when p_failed then 1 else 0 end
   where run_id = p_run_id
   returning * into v_row;

  -- Atomic single-claim of synthesis dispatch (Pitfall 2). Returns claim_synthesis=true
  -- to exactly one caller — the second simultaneous handler gets claim_synthesis=false.
  update public.coordinator_runs
     set synthesis_dispatched_at = now()
   where run_id = p_run_id
     and synthesis_dispatched_at is null
     and completed_handlers >= expected_handlers
   returning true into v_row.synthesis_dispatched_at;

  return query select v_row.completed_handlers, v_row.expected_handlers,
                      coalesce(v_row.synthesis_dispatched_at is not null, false);
end;
$$;

grant execute on function public.coordinator_complete_handler(uuid, boolean) to service_role;
```
**Caller (Stage 4 handler) emits `debtor-email/synthesis.requested` only when `claim_synthesis=true`** — keeps Inngest emit in app code per RESEARCH OQ2.

---

### `web/lib/automations/debtor-email/handlers/output-adapter.ts` (NEW)

**Analog:** none direct in repo. Closest is `agent-runs.ts:75-98` (mergeToolOutputs JSONB shape).

**Pattern:** thin pure function from existing body-agent shape (`bodyAgentOutputSchema` at `triage/types.ts:101-105`) → canonical `HandlerOutput`:
```typescript
import type { HandlerOutput } from "@/lib/agentic-pipeline/types";
import type { BodyAgentOutput } from "@/lib/automations/debtor-email/triage/types";

export function bodyAgentOutputToHandlerOutput(
  body: BodyAgentOutput,
  ctx: { handler_key: string; intent: string; language: HandlerOutput["language"]; references: string[]; confidence: HandlerOutput["confidence"] },
): HandlerOutput {
  return {
    handler_key: ctx.handler_key,                 // "debtor-copy-document-body-agent"
    intent: ctx.intent,                           // "copy_document_request"
    content_kind: "draft_body",
    content: body.body_html,
    language: ctx.language,
    tone: body.detected_tone,                     // "neutral" | "de-escalation"
    references: ctx.references,
    confidence: ctx.confidence,
  };
}
```
**JSONB double-decode guard** (CLAUDE.md Supabase pattern) when reading `tool_outputs.body` from `agent_runs`:
```typescript
let body: BodyAgentOutput = row.tool_outputs?.body;
while (typeof body === "string") body = JSON.parse(body) as BodyAgentOutput;
```

---

### Test files (vitest)

**Analog:** `web/lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts` (full file, 1-240).

**Mock-step strategy (verbatim shell to copy):** `stage-0-safety-worker.test.ts:24-79`:
```typescript
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
    createFunction: vi.fn((cfg, _trigger, handler) => ({ __config: cfg, handler })),
  },
}));
vi.mock("@/lib/supabase/admin", () => {
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  const eq = vi.fn().mockResolvedValue({ data: null, error: null });
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ insert, update }));
  return { createAdminClient: vi.fn(() => ({ from })), __mocks__: { from, insert, update, eq } };
});
function makeStep() { return { run: vi.fn(async (_n: string, fn: () => unknown) => fn()) }; }
function getHandler() { return (worker as unknown as { handler: any }).handler; }
```
Apply to: `debtor-email-triage.test.ts`, `coordinator-orchestrator.test.ts`, `coordinator-synthesis.test.ts`, `partial-synthesis.test.ts`.

**Pure-fn tests** (escalation-gate, output-adapter, coordinator-schema): no mocks — direct module import + `expect(fn(input)).toEqual(expected)`. See `budget-counter.test.ts` (referenced in RESEARCH).

**Registry-vocabulary integrity test** (`registry-vocabulary.test.ts`) — pure unit:
```typescript
import { INTENT } from "@/lib/automations/debtor-email/triage/types";
// Open the migration SQL as a string; assert all 8 INTENT values appear as
// (swarm_type, category_key) rows with action='swarm_dispatch' and the
// canonical `debtor-email/<intent>.requested` event name.
```

---

## Shared Patterns

### A. Inngest function shape (apply to triage rewrite, orchestrator, synthesis)

**Source:** `classifier-verdict-worker.ts:28-31`, `classifier-label-resolver.ts:22-25`, `stage-0-safety-worker.ts` (per RESEARCH).

**Apply to:** all three Inngest functions in this phase.
```typescript
export const fn = inngest.createFunction(
  { id: "automations/<name>", retries: 0 /* + concurrency keys */ },
  { event: "<event-name>" },
  async ({ event, step }) => {
    const admin = createAdminClient();
    // … step.run(...) blocks; failure → mark-failed step + emitAutomationRunStale
  }
);
```
**Recovery posture:** `retries: 0` + manual operator retry button via `automation_runs.status='failed'` + `error_message`. NEVER add Inngest auto-retries in this phase (RESEARCH §Security: cost amplification).

### B. Registry-driven event dispatch

**Source:** `classifier-verdict-worker.ts:149-176`.
**Apply to:** triage single-shot path + orchestrator fan-out.
The registry IS the routing table — never add a hardcoded if/else on intent name.

### C. Idempotent agent calls via version literal

**Source:** `agent-runs.ts:104-124` + `debtor-email-triage.ts:60-98`.
**Apply to:** coordinator (`INTENT_VERSION_V2`), orchestrator-planner (new `PLANNER_VERSION` literal), synthesis (new `SYNTHESIS_VERSION` literal).
Version literal flip = automatic cache invalidation. No SQL.

### D. Bulk Review revalidation hook

**Source:** `web/lib/automations/runs/emit.ts:16-36`.
**Apply to:** every status transition on `coordinator_runs` and `automation_runs` in the new functions.
```typescript
await emitAutomationRunStale(admin, "debtor-email-review");
```

### E. Tool allowlist enforcement (no new code)

**Source:** `nxt-zap-client.ts:48-54` + `loadTool` (lines 64-80).
**Apply to:** orchestrator-spawned Stage 4 handlers — they go through the existing client, the allowlist gate fires unchanged. **Zero new code in this phase**; verify in tests that `ToolNotAllowedForIntentError` still surfaces from a fan-out child.

### F. Strict json_schema with anyOf nullable (Orq agent rows)

**Source:** CLAUDE.md § Orq.ai (learning `3970bad9`); applied in `orq_agents` row JSONB at `20260429g_orq_agents_registry.sql:60-78` (note: that row currently uses array-shorthand `type:['string','null']` which is the WRONG pattern — Plan 02 PATCH must replace with `anyOf`).

**Apply to:** Plan 02 PATCH for `debtor-intent-agent` v2 + INSERT of `debtor-orchestrator-agent` + `synthesis-agent`. NEVER `["string","null"]` shorthand.

### G. Orq agent create/update workflow (mandatory ritual)

**Source:** CLAUDE.md § Orq.ai (learnings `f980a2a1`, `cba7352b`).
**Apply to:** all three agents in Plan 02.
1. `list_models` MCP pre-flight — validate every primary + fallback ID against catalog.
2. JSON Schema tool resource — created in Studio (no MCP CRUD).
3. `create_agent` (or PATCH for existing v2) — bare model id only.
4. `update_agent` PATCH — full `model.parameters` incl. `response_format` referencing the tool name.
5. `get_agent` verify — confirms persistence (NOT catalog validity — that's step 1's job).

### H. Inngest fn registration

**Apply to:** `web/app/api/inngest/route.ts` (per RESEARCH Runtime State Inventory). Add `coordinatorOrchestrator` and `coordinatorSynthesis` to the `serve({ functions: [...] })` array.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `web/lib/automations/debtor-email/handlers/output-adapter.ts` | utility / adapter | transform | No prior `HandlerOutput` adapter exists — this phase introduces the canonical type. Pattern is novel-but-trivial (pure mapping function). |
| `coordinator_complete_handler` RPC | DB function | atomic counter + claim | No prior RPC fan-in pattern in repo (existing functions are triggers/setters, not return-value RPCs). RESEARCH Pattern 4 supplies the shape. |

Both are simple enough to land without a prior in-repo example; RESEARCH supplies sufficient detail.

---

## Metadata

**Analog search scope:**
- `web/lib/inngest/functions/` (verdict-worker, label-resolver, debtor-email-triage, stage-0-safety-worker)
- `web/lib/automations/debtor-email/triage/` (invoke-intent, types, agent-runs)
- `web/lib/automations/orq-agents/` (client.ts)
- `web/lib/automations/runs/emit.ts`
- `web/lib/automations/debtor-email/nxt-zap-client.ts`
- `web/lib/swarms/` (registry, types)
- `supabase/migrations/` (20260429b, 20260429g, 20260429h)
- `web/lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts`

**Files scanned:** 11 source files + 3 migrations + 1 test = **15 files read, 0 re-reads**.

**Pattern extraction date:** 2026-05-01.

---

## PATTERN MAPPING COMPLETE

**Phase:** 65 — stage-3-ranked-multi-intent-coordinator
**Files classified:** 14
**Analogs found:** 14 / 14

### Coverage

- Files with exact analog: 11
- Files with role-match analog: 3
- Files with no analog: 0 (output-adapter and RPC have role-partial; RESEARCH supplies the shape)

### Key Patterns Identified

- **All Inngest functions follow** `retries: 0` + `step.run` + `mark-failed` step + `emitAutomationRunStale` recovery envelope (verdict-worker, label-resolver, stage-0).
- **All registry-driven dispatch** goes through `swarm_categories.swarm_dispatch` event-name lookup (no hardcoded if/else), using the `inngest.send as unknown as ...` cast at `classifier-verdict-worker.ts:162`.
- **All idempotency caches** use the version-literal lookup pattern in `agent_runs.ts:findCachedOutput` — flipping `INTENT_VERSION_V2` invalidates v1 rows for free.
- **All Orq agent creates/updates** follow the 5-step ritual (`list_models` → Studio JSON Schema tool → create → PATCH → `get_agent` verify) per CLAUDE.md learnings.
- **Critical risk surfaced:** RESEARCH Pitfall 1 — Plan 01's migration MUST seed the 8 INTENT vocabulary rows into `swarm_categories` with `swarm_dispatch='debtor-email/<intent>.requested'`. Without this, single-shot dispatch silently fails on every fast-path email. The seed block is provided verbatim in this PATTERNS.md.

### File Created

`/Users/nickcrutzen/Developer/agent-workforce/.planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-PATTERNS.md`

### Ready for Planning

Pattern mapping complete. Planner can now reference analog patterns + line numbers in each PLAN.md action block.
