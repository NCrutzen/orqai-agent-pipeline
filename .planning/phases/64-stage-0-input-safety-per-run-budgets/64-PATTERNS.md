# Phase 64: Stage 0 input safety + per-run budgets — Pattern Map

**Mapped:** 2026-04-30
**Files analyzed:** 13 (10 new, 3 modified) + tests
**Analogs found:** 13 / 13 (100% coverage — all primitives already exist in repo)

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `web/lib/stage-0/regex-patterns.ts` | utility / data table | pure data | `web/lib/classifier/types.ts` (constant tables) | role-match |
| `web/lib/stage-0/regex-screen.ts` | utility / pure-fn | transform | `web/lib/classifier/wilson.ts` (pure deterministic fn) | exact |
| `web/lib/stage-0/llm-verdict.ts` | service / Orq.ai client | request-response | `web/lib/automations/debtor-email/llm-tiebreaker.ts` | exact |
| `web/lib/stage-0/budget-counter.ts` | utility / pure-fn | transform | `web/lib/classifier/wilson.ts` | role-match |
| `web/lib/inngest/functions/stage-0-safety-worker.ts` | Inngest worker | event-driven | `web/lib/inngest/functions/classifier-label-resolver.ts` | exact |
| `web/lib/inngest/functions/budget-breach-handler.ts` | Inngest worker | event-driven | `web/lib/inngest/functions/classifier-verdict-worker.ts` (reject path) | role-match |
| `web/lib/inngest/events.ts` | config / type registry | declarative | `web/lib/inngest/events.ts` (existing) | exact (modify) |
| `web/lib/automations/debtor-email/nxt-zap-client.ts` | service / library | request-response | self (modify in-place) | exact (modify) |
| `web/app/(dashboard)/automations/[swarm]/review/page.tsx` | Next.js server component | request-response | self (modify in-place) | exact (modify) |
| `supabase/migrations/20260430e_stage_0_safety_and_allowlist.sql` | migration | DDL | `supabase/migrations/20260430c_email_labels_feedback_and_invoice_copy.sql` | exact |
| `docs/agentic-pipeline/stage-0-safety.md` | RFC | docs | self (D-02 paragraph rewrite) | n/a |
| `web/lib/stage-0/__tests__/*.test.ts` | tests | unit | `web/lib/classifier/__tests__/wilson.test.ts` | exact |
| `web/lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts` | tests | integration | `web/lib/inngest/__tests__/pipeline-approval.test.ts` (skeleton) | role-match |

---

## Pattern Assignments

### `web/lib/stage-0/llm-verdict.ts` (service / request-response)

**Analog:** `web/lib/automations/debtor-email/llm-tiebreaker.ts`

**Imports + module preamble** (lines 1-22):
```typescript
import { z } from "zod";
import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";

const TiebreakerOutputSchema = z.object({
  selected_account_id: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string().min(1),
});
export type TiebreakerOutput = z.infer<typeof TiebreakerOutputSchema>;

const ORQ_TIMEOUT_MS = 45_000;
const REGISTRY_AGENT_KEY = "label-tiebreaker";
```

**Core pattern: registry-driven Orq.ai invoke + Zod parse + post-validate** (lines 42-81):
```typescript
export async function callTiebreaker(
  args: TiebreakerArgs,
): Promise<TiebreakerOutput> {
  const inputs = { email_subject, email_body, candidates };

  let raw: unknown;
  try {
    const result = await invokeOrqAgent(REGISTRY_AGENT_KEY, inputs, {
      jsonSchemaName: "label_tiebreaker_output",
    });
    raw = result.raw;
  } catch (err) {
    // legacy fallback while registry row is being populated
    raw = await callTiebreakerLegacy(args);
  }

  const parsed = TiebreakerOutputSchema.parse(raw);
  // post-validate — prompt-injection guard
  if (!allowed.has(parsed.selected_account_id)) {
    throw new Error(`Tiebreaker returned ... not in candidates`);
  }
  return parsed;
}
```

**What to copy for `llm-verdict.ts`:**
1. `invokeOrqAgent(REGISTRY_AGENT_KEY, inputs, { jsonSchemaName })` — registry-driven path is mandatory (NOT raw fetch).
2. Zod schema declared at top of module, parse at boundary.
3. Register a new `orq_agents` row with `agent_key='stage-0-safety-classifier'` (see `web/lib/automations/orq-agents/client.ts` for shape — `loadAgent` reads from `public.orq_agents`).
4. Use `TiebreakerOutputSchema` shape as template — but verdict output shape is `{ verdict: 'safe'|'injection_suspected', reason: string, matched_span: string|null }` per RESEARCH Pattern 1.
5. `usage` + `billing.total_cost` extraction is NOT exposed by `invokeOrqAgent` today — it returns only `raw`. Either (a) extend `invokeOrqAgent` to return usage+cost (preferred — single seam) OR (b) add a parallel `invokeOrqAgentWithUsage` helper. RESEARCH Assumption A1 flags this needs verification against a real Orq.ai response.

---

### `web/lib/inngest/functions/stage-0-safety-worker.ts` (Inngest worker / event-driven)

**Analog:** `web/lib/inngest/functions/classifier-label-resolver.ts`

**Imports + function declaration** (lines 14-25):
```typescript
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
// ... domain imports

export const classifierLabelResolver = inngest.createFunction(
  { id: "classifier/label-resolver", retries: 0 },
  { event: "debtor-email/label-resolve.requested" },
  async ({ event, step }) => {
    const { automation_run_id, message_id, source_mailbox, ... } = event.data;
    const admin = createAdminClient();
```

**Core pattern: parallel `step.run` loads + sequential side-effects with terminal status update** (lines 36-184):
```typescript
const [emailRow, settingsRow] = await Promise.all([
  step.run("load-email", async () => { ... }),
  step.run("load-settings", async () => { ... }),
]);

if (!emailRow) {
  await step.run("mark-failed-email-missing", async () => { ... });
  return { ok: false, reason: "email_not_found" };
}

const resolverResult = await step.run("resolve-debtor", async () => {
  // try/catch INSIDE step.run — error is data, not throw
  let resolverError: string | null = null;
  try { ... } catch (err) {
    resolverError = err instanceof Error ? err.message : String(err);
  }
  return { result, resolverError };
});

await step.run("write-email-label", async () => {
  const { error } = await admin.schema("debtor").from("email_labels").insert({...});
  if (error) throw new Error(`email_labels insert failed: ${error.message}`);
});

await step.run("close-automation-run", async () => {
  await admin.from("automation_runs").update({
    status: finalStatus,
    error_message: resolverError,
    result: { ... },
    completed_at: new Date().toISOString(),
  }).eq("id", automation_run_id);
  await emitAutomationRunStale(admin, `${swarm_type}-review`);
});
```

**What to copy for `stage-0-safety-worker.ts`:**
1. `{ id: "stage-0/safety-worker", retries: 0 }` — `retries: 0` is the project standard for swarm workers (Pitfall 1: prevents infinite-retry budget burn).
2. Each LLM/DB call wrapped in `step.run(...)` per `docs/inngest-patterns.md`.
3. Errors → data (return `{ resolverError }`), THEN terminal `mark-failed` step. Don't throw from inside `step.run` blocks unless you want the whole function to fail.
4. Always close with `emitAutomationRunStale(admin, '${swarm_type}-review')` so the Bulk Review UI's realtime channel refreshes.
5. Pitfall 5 (RESEARCH): top-of-function check `if (event.data.safety_overridden) return forwardToClassifier()` — must be the FIRST `step.run` so memoization keeps the skip deterministic on replay.

---

### `web/lib/inngest/functions/budget-breach-handler.ts` (Inngest worker / event-driven)

**Analog:** `web/lib/inngest/functions/classifier-verdict-worker.ts` (reject path, lines 47-59)

**Reject-path pattern** (lines 44-59):
```typescript
if (decision === "reject") {
  await step.run("mark-complete-reject", async () => {
    await admin.from("automation_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", automation_run_id);
    await emitAutomationRunStale(admin, `${swarm_type}-review`);
  });
  return { ok: true, decision };
}
```

**What to copy for `budget-breach-handler.ts`:**
1. Same `{ retries: 0 }` config — D-13 says retry MUST NOT trigger on breach.
2. Two `step.run` blocks: (a) update originating `automation_run` to `status='failed'` with `error_message: 'budget breach: ${reason}'`; (b) INSERT new `automation_runs` row with `topic='budget_breach'` to land in the Kanban Human Review lane (RESEARCH Code Examples lines 670-700 spell this out).
3. `triggered_by: 'budget-breach-handler'` — follow the `triggered_by` convention used across `classifier-verdict-worker` (`triggered_by: 'classifier-verdict-worker'`).

---

### `web/lib/automations/debtor-email/nxt-zap-client.ts` (service / library — MODIFY)

**Analog:** self (existing 375-line file)

**Existing `loadTool` pattern** (lines 50-72):
```typescript
async function loadTool(tool_id: string): Promise<ZapierToolRow> {
  const now = Date.now();
  if (!cache || now - cache.fetched_at > REGISTRY_CACHE_TTL_MS) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("zapier_tools")
      .select("tool_id, backend, pattern, target_url, auth_method, auth_secret_env, auth_field_name, callback_route, enabled")
      .eq("enabled", true);
    if (error) throw new Error(`zapier_tools registry read failed: ${error.message}`);
    const map = new Map<string, ZapierToolRow>();
    for (const row of data ?? []) map.set(row.tool_id, row as ZapierToolRow);
    cache = { fetched_at: now, tools: map };
  }
  const tool = cache.tools.get(tool_id);
  if (!tool) throw new Error(`zapier_tools: tool_id="${tool_id}" not found or disabled`);
  return tool;
}
```

**Existing `ZapierToolRow` type** (lines 35-45):
```typescript
type ZapierToolRow = {
  tool_id: string;
  backend: string;
  pattern: "sync" | "async_callback";
  target_url: string;
  auth_method: "body_field" | "header_bearer";
  auth_secret_env: string;
  auth_field_name: string;
  callback_route: string | null;
  enabled: boolean;
};
```

**Existing `callNxtTool` entry** (lines 168-183):
```typescript
export async function callNxtTool<T extends NxtToolId>(
  tool_id: T,
  input: ...,
): Promise<...> {
  if (!APP_URL) throw new Error("NEXT_PUBLIC_APP_URL is not set ...");
  const tool = await loadTool(tool_id);
  if (tool.pattern !== "async_callback") {
    throw new Error(`zapier_tools: tool "${tool_id}" pattern=${tool.pattern}, expected async_callback`);
  }
```

**Modifications required:**
1. **Extend `ZapierToolRow`:** add `allowed_for_intents: string[] | null;`
2. **Extend `loadTool` SELECT:** add `allowed_for_intents` to the projection list.
3. **Add `intent: string` parameter to `callNxtTool`:** new required parameter, threaded through from callers (RESEARCH Pattern 5 lines 449-462).
4. **Add typed error class** at top of file (sibling to schema declarations):
   ```typescript
   export class ToolNotAllowedForIntentError extends Error {
     constructor(public tool_id: string, public intent: string) {
       super(`Tool "${tool_id}" not allowed for intent "${intent}"`);
       this.name = "ToolNotAllowedForIntentError";
     }
   }
   ```
5. **Default-deny check** immediately after `loadTool`, BEFORE the existing `tool.pattern !== "async_callback"` check (so denial pre-empts everything):
   ```typescript
   const allowed = tool.allowed_for_intents ?? [];
   if (allowed.length === 0 || !allowed.includes(intent)) {
     throw new ToolNotAllowedForIntentError(tool_id, intent);
   }
   ```
6. **Update the three convenience exports** (`lookupSenderToAccount`, `lookupIdentifierToAccount`, `lookupCandidateDetails` at lines 368-375) to require + forward `intent`. Callers in `web/lib/automations/debtor-email/resolve-debtor.ts` need updating too — search for callsites with `Grep("callNxtTool|lookupSenderToAccount|lookupIdentifierToAccount|lookupCandidateDetails", type: "ts")`.

---

### `supabase/migrations/20260430e_stage_0_safety_and_allowlist.sql` (migration / DDL)

**Analog:** `supabase/migrations/20260430c_email_labels_feedback_and_invoice_copy.sql`

**Pattern: additive `alter table ... add column if not exists` + index + check constraint refresh** (lines 12-40):
```sql
alter table debtor.email_labels
  add column if not exists feedback_verdict             text
    check (feedback_verdict in ('approved', 'rejected', 'manual_override')),
  add column if not exists feedback_reason              text,
  add column if not exists corrected_customer_account_id text,
  add column if not exists draft_quality                text
    check (draft_quality in ('correct', 'needed_edit', 'rejected'));

create index if not exists email_labels_feedback_verdict_idx
  on debtor.email_labels (feedback_verdict)
  where feedback_verdict is not null;
```

**What to copy for the new migration:**
1. **Header comment** explaining phase + decision IDs (D-05, D-06, D-07).
2. **Single statement per concern, all `if not exists` guards** — lets the migration re-run safely.
3. **No data destruction** — `allowed_for_intents` is purely additive.
4. **Migration body:**
   ```sql
   alter table public.zapier_tools
     add column if not exists allowed_for_intents text[];

   -- Backfill — existing tools must be EXPLICITLY wired to current intents
   -- (default-deny per D-06; NULL == no intent can invoke).
   update public.zapier_tools
     set allowed_for_intents = array['unknown', 'invoice_copy_request']
     where tool_id in ('nxt.contact_lookup','nxt.identifier_lookup','nxt.candidate_details');

   update public.zapier_tools
     set allowed_for_intents = array['invoice_copy_request']
     where tool_id = 'nxt.invoice_fetch';
   ```
5. **No RLS / policy changes** — `zapier_tools` already has the service-role policy from `20260429_zapier_tools_registry.sql`.

---

### `web/lib/inngest/events.ts` (config / type registry — MODIFY)

**Analog:** self (existing 262-line `Events` type record)

**Existing event-shape pattern** (lines 169-182, 218-242):
```typescript
"classifier/verdict.recorded": {
  data: {
    automation_run_id: string;
    agent_run_id: string;
    swarm_type: string;
    rule_key: string;
    decision: "approve" | "reject";
    message_id: string;
    source_mailbox: string;
    entity: string;
    predicted_category: string;
    override_category?: string;
  };
};

"debtor-email/label-resolve.requested": {
  data: {
    automation_run_id: string;
    swarm_type: string;
    category_key: string;
    message_id: string;
    source_mailbox: string;
  };
};
```

**What to copy:**
1. **Naming convention:** `<namespace>/<event>.<aspect>` — RESEARCH Open Question 2 recommends `stage-0/email.received` to avoid collision with existing `debtor/email.received` (line 245).
2. **Always include `automation_run_id`** as the first field — every downstream worker needs it for status updates.
3. **New events to add:**
   ```typescript
   "stage-0/email.received": {
     data: {
       automation_run_id: string;
       email_id: string;
       message_id: string;
       source_mailbox: string;
       subject: string;
       body_text: string;
       safety_overridden?: boolean;  // Pitfall 5 skip flag
     };
   };
   "pipeline/budget_breached": {
     data: {
       automation_run_id: string;
       email_id: string;
       budget: { cost_cents: number; token_count: number };
       reason: string;
     };
   };
   ```

---

### `web/lib/stage-0/regex-screen.ts` + `regex-patterns.ts` (utility / pure-fn)

**Analog:** `web/lib/classifier/wilson.ts` (pure deterministic function with paired test file)

**Pattern: pure exports + inline algorithmic comment + unit-test-coverable surface**

`wilson.ts` is the canonical "pure function, no I/O, no imports beyond stdlib" template in this repo. `regex-screen.ts` follows the same shape:
- No `createAdminClient`, no `fetch`, no `step.run` — pure synchronous function.
- Single named export per file (`regexScreen`, `INJECTION_PATTERNS`).
- Inline JSDoc citing the source list (OWASP / Anthropic / D-04 Dutch seed).

Body shown verbatim in RESEARCH Code Examples Pattern 1 lines 252-279 — copy directly.

---

### `web/lib/stage-0/budget-counter.ts` (utility / pure-fn)

**Analog:** `web/lib/classifier/wilson.ts`

Same pattern: pure helper functions + exported constants. RESEARCH Code Examples Pattern 4 lines 383-400 give the full body. Constants `BUDGET_CEILING_CENTS = 15` and `BUDGET_CEILING_TOKENS = 5_000` per D-16 starting point — but the plan must validate these against last 30 days of `automation_runs.result.cost_cents` data BEFORE the migration ships (RESEARCH Assumption A3).

---

### `web/app/(dashboard)/automations/[swarm]/review/page.tsx` (server component — MODIFY)

**Analog:** self (existing 240-line page)

**Existing data-loader pattern** (`loadPageData`, lines 86-165):
```typescript
export async function loadPageData(
  params: PageSearchParams,
  admin: ReturnType<typeof createAdminClient>,
  swarmType: string,
): Promise<PageData> {
  // 1. Counts: single RPC, GROUP BY (swarm_type, topic, entity, mailbox_id).
  const countsRes = await admin.rpc("classifier_queue_counts", {
    p_swarm_type: swarmType,
  });

  // 2. Predicted rows: cursor pagination, page-size 100.
  const listQuery = admin
    .from("automation_runs")
    .select("*")
    .eq("status", "predicted")
    .eq("swarm_type", swarmType)
    .order("created_at", { ascending: false })
    .limit(100);
  if (params.before) listQuery.lt("created_at", params.before);
  if (params.topic) listQuery.eq("topic", params.topic);
  ...
```

**Existing `PageSearchParams`** (lines 28-36) — already has `tab?: string`. Reuse it for `?tab=safety`.

**What to copy / extend for Safety Review tab (RESEARCH Pattern 3 Option B — RECOMMENDED):**
1. **Filter on `topic='safety_review'`** when `params.tab === 'safety'` — equivalent to the existing `params.tab === 'pending'` branch (lines 132-149).
2. **No page-shell rewrite** — the existing 3-column grid (line 208) stays. Add the safety tab as a sibling node in `QueueTree` (drives the URL `?tab=safety`), and a `SafetyDetailPane` variant of `DetailPane` for the row-action surface (Mark safe / Dismiss / Escalate).
3. **Realtime channel** — existing `<AutomationRealtimeProvider automations={[\`${swarmType}-review\`]}>` (line 194) already covers the Safety Review tab because new `automation_runs` rows fire on the same channel via `emitAutomationRunStale`.

**SQL pattern for outlier detection** in the data loader (RESEARCH Pattern 6 lines 491-510) — embed as a Supabase RPC named e.g. `automation_runs_with_outlier_flag` or compute inline if N samples cheap enough.

---

### Tests

**Analog (unit):** `web/lib/classifier/__tests__/wilson.test.ts` (33 lines, pinned-value assertions, vitest)

**Pattern:**
```typescript
import { describe, it, expect } from "vitest";
import { wilsonCiLower } from "../wilson";

describe("D-02: wilsonCiLower matches route.ts:24-32 empirical values", () => {
  it("returns 0 when n === 0", () => {
    expect(wilsonCiLower(0, 0)).toBe(0);
  });
  // pinned-value test against documented decision
  ...
});
```

**What to copy:**
1. Group `describe("<requirement-id>: <human description>")` so the test trace maps to SAFE-01..04 / BUDG-01..03 (RESEARCH Validation Architecture table).
2. Pinned-value assertions per case (e.g. `expect(regexScreen("ignore previous instructions")).toEqual({ matched: "ignore_previous" })`).
3. One file per pure module: `regex-screen.test.ts`, `budget-counter.test.ts`, `llm-verdict.test.ts` (with mocked Orq.ai).

**Analog (integration / Inngest worker):** `web/lib/inngest/__tests__/pipeline-approval.test.ts` is currently a `it.todo` skeleton — no full integration analog exists yet in this repo. Planner should:
- Mock `invokeOrqAgent` with `vi.mock('@/lib/automations/orq-agents/client')`.
- Mock the Supabase admin client with the existing pattern from elsewhere in `web/lib/orqai/__tests__/trace-mapper.test.ts` (search confirms it exists).
- Run the worker by importing and calling its inner async fn directly with a mock `step` object whose `run(name, fn)` just awaits `fn()`.

---

## Shared Patterns (apply to multiple new files)

### Inngest function shell (apply to both new workers)

**Source:** `web/lib/inngest/functions/classifier-verdict-worker.ts:1-30` and `classifier-label-resolver.ts:14-25`

```typescript
// Phase 64. <one-paragraph summary referencing RFC + decision IDs>
// retries: 0 — failures surface as automation_runs.status='failed' so the
// queue UI's retry button is the recovery path rather than cascading retries.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

export const stage0SafetyWorker = inngest.createFunction(
  { id: "stage-0/safety-worker", retries: 0 },
  { event: "stage-0/email.received" },
  async ({ event, step }) => {
    const admin = createAdminClient();
    // ... step.run blocks ...
  },
);
```

### Side-effects ONLY inside `step.run` (apply to both new workers)

**Source:** `classifier-label-resolver.ts:38-114` — every Supabase write, every Orq.ai call, every `inngest.send` is wrapped.

Per `CLAUDE.md` and `docs/inngest-patterns.md`: anything outside `step.run` re-executes on replay → double-charges or double-writes. Pitfall 1 in RESEARCH explicitly calls this out.

### Service-role admin client for automation writes (apply to migration consumers + workers)

**Source:** every Inngest function in `web/lib/inngest/functions/` calls `createAdminClient()` at the top of the handler. Per `CLAUDE.md`: "Service role voor automation writes (geen RLS server-side)."

### Registry-driven invocation (apply to `llm-verdict.ts` + `nxt-zap-client.ts` modifications)

**Source:**
- `web/lib/automations/orq-agents/client.ts:35-59` — `loadAgent` cache pattern (60s TTL).
- `web/lib/automations/debtor-email/nxt-zap-client.ts:50-72` — `loadTool` cache pattern (60s TTL).

Both follow the same shape: in-process `Map` cache, TTL-based invalidation, single SELECT against the registry table on miss. New code MUST NOT bypass these — register the Stage 0 verdict agent in `orq_agents` (key `stage-0-safety-classifier`), don't add a parallel direct fetch.

### Default-deny security posture (BUDG-02)

**Source:** `CLAUDE.md` — "Default: acceptance/test" credentials; D-06 makes this explicit for `allowed_for_intents`.

In `nxt-zap-client.ts`: `const allowed = tool.allowed_for_intents ?? []; if (allowed.length === 0 || !allowed.includes(intent)) throw ...`. NULL is NOT permissive.

### Realtime channel notification on row mutation

**Source:** `classifier-verdict-worker.ts` line 56 + `classifier-label-resolver.ts` line 184 — every automation_runs UPDATE/INSERT is followed by `await emitAutomationRunStale(admin, \`${swarm_type}-review\`)`.

Apply to: `stage-0-safety-worker` (after `persist-verdict` step) + `budget-breach-handler` (after both step.runs).

### Migration safety: `if not exists` guards everywhere

**Source:** `supabase/migrations/20260430c_*.sql:12-26` — every `alter table … add column` and every `create index` uses `if not exists`. Repeatable.

---

## No Analog Found

None — Phase 64 ships entirely against existing patterns. Confidence per RESEARCH Sources block: HIGH.

The only soft spot is the Inngest worker integration test pattern (existing analog is a `.todo` skeleton). Planner should treat that as Wave 0 scaffolding work and create the first real integration test in this repo.

---

## Metadata

**Analog search scope:**
- `web/lib/inngest/functions/` (all 23 worker files)
- `web/lib/automations/debtor-email/` (~16 files)
- `web/lib/automations/orq-agents/`
- `web/lib/classifier/` + `__tests__/`
- `web/app/(dashboard)/automations/[swarm]/review/`
- `supabase/migrations/` (last 10 migrations)

**Files read in full or in targeted ranges:**
- `web/lib/inngest/functions/classifier-verdict-worker.ts` (1-214, full)
- `web/lib/inngest/functions/classifier-label-resolver.ts` (1-271, full)
- `web/lib/automations/debtor-email/nxt-zap-client.ts` (1-376, full)
- `web/lib/automations/debtor-email/llm-tiebreaker.ts` (1-138, full)
- `web/lib/automations/orq-agents/client.ts` (1-145, full)
- `web/lib/inngest/events.ts` (1-262, full)
- `web/lib/inngest/client.ts` (1-7, full)
- `web/app/(dashboard)/automations/[swarm]/review/page.tsx` (1-240, full)
- `supabase/migrations/20260430c_email_labels_feedback_and_invoice_copy.sql` (1-40)
- `supabase/migrations/20260429_zapier_tools_registry.sql` (1-80)
- `web/lib/classifier/__tests__/wilson.test.ts` (1-33, full)
- `web/lib/inngest/__tests__/pipeline-approval.test.ts` (1-8, full — confirms only skeleton exists)

**Pattern extraction date:** 2026-04-30
