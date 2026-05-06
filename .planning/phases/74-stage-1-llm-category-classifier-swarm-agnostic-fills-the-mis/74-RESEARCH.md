# Phase 74: Stage 1 LLM Category Classifier (swarm-agnostic) — Research

**Researched:** 2026-05-06
**Domain:** Inngest worker + Orq.ai agent + Supabase registry
**Confidence:** HIGH (codebase patterns), MEDIUM (sales-email rollout dependencies)

## Summary

Phase 74 is almost entirely a wiring exercise. Every needed primitive already exists in the codebase: the Orq client (`web/lib/automations/orq-agents/client.ts`) reads agents from `public.orq_agents` and invokes via `/v2/agents/{key}/responses`; the registry helpers (`loadSwarm`, `loadSwarmCategories`) cache for 60s; the Phase 70 dual-write helper (`emitPipelineEvent`) is a thin INSERT; and `classifier-label-resolver.ts` is a near-perfect template for "load registry → side effects → write pipeline_events → emit follow-up event" inside `step.run`.

The four risks the planner must address up-front are: (1) **`agent_runs.entity` CHECK constraint** rejects any value outside the five debtor-email entities — sales-email LLM calls will fail to persist `agent_runs` rows unless this is widened or made nullable; (2) **`stage-0/email.received` event has no `swarm_type` field** today, and the Stage 0 worker hardcodes `"debtor-email"` everywhere — for D-01 to work, the ingest route MUST be the source of `swarm_type` and the event schema MUST be extended (CONTEXT D-01 only specifies extending `classifier/screen.requested`, but Stage 0 cannot emit a value it doesn't have); (3) **sales-email has no ingest path** — there is no `/api/automations/sales-email/ingest` route and no Outlook webhook wiring, so the Friday rollout requires either a new ingest route or a debtor-style Zapier webhook to land messages in `stage-0/email.received` with `swarm_type='sales-email'`; (4) **firecontrol@ and SMEBA fire@ mailboxes are not in `ICONTROLLER_MAILBOXES`** — used by `classifier-label-resolver`'s `isKnownMailbox` gate, so the Stage 2 side-effect dispatch silently no-ops unless these mailboxes are registered or an alternative gate is used.

**Primary recommendation:** plan five waves — (Wave 0) test scaffolding + `agent_runs` schema fix; (Wave 1) `orq_agents` migration + Orq agent create→PATCH→get_agent ritual; (Wave 2) sales-email registry seed migration + `swarms_registry_generalisation`-style row; (Wave 3) extend `stage-0/email.received` and `classifier/screen.requested` event schemas, modify Stage 0 ingest route + safety worker to thread `swarm_type`; (Wave 4) implement `classifier-screen-worker.ts` + sales-email ingest hook; (Wave 5) production rollout verification.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Event Contract:**
- D-01: Extend `classifier/screen.requested` payload to carry `swarm_type: string`. Stage 0 emit sites at `stage-0-safety-worker.ts:75` and `:177` get one new field. No behavior change to Stage 0 logic.
- D-02: Stage 0 also emits `entity` (already in its event data per spec — see Open Question O-1 below) so downstream `pipeline_events` rows record entity without re-deriving.

**Regex Invocation:**
- D-03: Worker resolves regex module per-swarm via `swarms.stage1_regex_module` (Phase 68 column). For `null` (sales-email) the worker skips regex and goes straight to LLM. No `swarm_type === 'debtor-email'` literal in the worker.
- D-04: Build `loadRegexModule(swarms_row)` helper that dynamic-imports the configured module and returns its `classify(input)` function. Errors throw → run fails.

**LLM Agent Contract:**
- D-05: Agent name `stage-1-category-classifier`, `swarm_type='cross-cutting'`. Primary `aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0`. Fallbacks `openai/gpt-4o-mini` → `google-ai/gemini-2.5-flash`. All three IDs verified via `list_models` BEFORE `update_agent`.
- D-06: Strict json_schema response_format with output `{ category_key, confidence: "low"|"medium"|"high", reasoning: anyOf[string, null] }`.
- D-07: Closed-category list built at call time inside the worker (loaded from `swarm_categories` filtered to `enabled=true`), injected as `<categories>` XML block listing `(category_key, display_label)` pairs. Single agent definition; list varies per call.
- D-08: Prompt structure follows CLAUDE.md XML convention: `<role>`, `<task>`, `<categories>`, `<input>`, `<constraints>`, `<output_format>`.
- D-09: Agent creation flow: `create_agent` (bare model id) → `update_agent` (full `model.parameters` incl. `response_format` strict json_schema + `fallback_models`) → `get_agent` to verify.

**Confidence Gate:**
- D-10: Hardcoded `final_category_key = (llm.confidence === 'low') ? 'unknown' : llm.category_key`. No registry column for thresholds.

**Failure Handling:**
- D-11: On LLM error/timeout/schema-validation failure: coerce to `category_key='unknown'` with `confidence='low'`, write `agent_runs.error_message`, still emit `classifier/verdict.recorded` with `predicted_category='unknown'`. Retries stays at 0.
- D-12: On regex module import failure: throw; `automation_runs.status='failed'`.

**Worker Implementation Constraints:**
- D-13: All side effects in `step.run()`. Non-deterministic ids (e.g. `agent_runs.id`) generated INSIDE `step.run()` per Phase 65 replay-id learning.
- D-14: `inngest.send` never destructured — call inline.
- D-15: `retries: 0` on the function definition.
- D-16: Worker step ordering: `load-swarm-row` → `regex` → `llm-call` → `emit-pipeline-event` → `emit-verdict`.

**Sales-Email Registry Seed:**
- D-17: Migration inserts one `swarms` row for `swarm_type='sales-email'` (with `stage1_regex_module=null`, `stage2_entity_resolver=null`, `stage3_coordinator_agent_key=null`, `entity_brand=[]`, `side_effects=[]`, `ui_config` minimal, `review_route='sales-email-review'`) plus 5 `swarm_categories` rows (4 categorize_archive: auto_reply/ooo_temporary/ooo_permanent/payment_admittance + unknown→manual_review).
- D-18: No coordinator/handler/regex code added for sales-email; only registry rows + ingest hook.

**Acceptance:**
- D-19: RED tests in `web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts` covering regex-hit-skip-LLM (debtor); LLM-low→unknown coercion; LLM-medium→pass-through; LLM-error→unknown coercion; sales-email no-regex → LLM-only; pipeline_events row count = 1 per call; agent_runs row only when LLM invoked.
- D-20: Production rollout verification (SPEC req 7) is operator-driven post-deploy: 24-hour `pipeline_events` query for each of three target mailboxes.

### Claude's Discretion

- Exact prompt wording for agent's `<role>` and `<task>` blocks (planner drafts).
- Exact JSON shape for `pipeline_events.payload` for a Stage-1 row (follow Phase 70 `emitPipelineEvent` convention).
- Which sales-email mailbox is the rollout target (operator chooses during execute-phase).
- Whether sales-email gets `entity_brand=[]` (truly cross-brand) or a starter brand list (planner confirms with operator).

### Deferred Ideas (OUT OF SCOPE)

- Sales-email regex Stage 1 from Supabase corpus.
- Promotion of common LLM picks → regex rules (Phase 72).
- Bulk Review UI columns for LLM-specific data (per-call cost, reasoning text).
- Labeled eval dataset + offline regression tests.
- Per-swarm `min_llm_confidence` registry column.
- Cost/latency dashboards specific to the new agent.
- Coordinator/handler/regex code for sales-email (Phase 73 territory).

## Project Constraints (from CLAUDE.md)

| Directive | Source | Application to Phase 74 |
|-----------|--------|-------------------------|
| `list_models` pre-flight before `create_agent`/`update_agent` | CLAUDE.md `f980a2a1` learning | Required for all 3 model IDs (primary + 2 fallbacks) before D-09 PATCH |
| `create_agent` drops `response_format` silently | CLAUDE.md `cba7352b` | D-09 mandates create→PATCH→get_agent verify cycle |
| `anyOf` for nullable in strict json_schema (NOT `["string","null"]`) | CLAUDE.md `3970bad9` | D-06 `reasoning` field must be `{anyOf: [{type:"string"},{type:"null"}]}` |
| JSON output enforcement workflow | CLAUDE.md 2026-05-01 Studio observation | Create json_schema tool resource in Studio → set Response Format dropdown to "JSON Schema" — the Orq MCP exposes NO tool CRUD; this step is manual |
| All side effects in `step.run()` | CLAUDE.md Inngest patterns | D-13 enforces this |
| Non-deterministic ids INSIDE `step.run()` | CLAUDE.md Phase 65 `dae6276`/`dd2583a` | D-13 — `agent_runs.id` generated inside `step.run("llm-call")` |
| Never destructure `inngest.send` | CLAUDE.md Phase 65 `dae6276` | D-14 — use `(inngest.send as unknown as SendFn)({...})` cast pattern |
| `retries: 0` on Inngest functions | CLAUDE.md Inngest patterns | D-15; cost amplification on retries is the existential risk |
| Anthropic model IDs verified in Orq catalog | CLAUDE.md 2026-05 model section | Haiku 4.5 = `aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0` (Bedrock EU only — no Anthropic-direct Haiku exists) |
| Fallback chain restrictions | CLAUDE.md model routing | NO `mistral-large-latest`, NO undated `claude-sonnet-4-5`, NO fictitious `anthropic/claude-opus-4-6` |
| 45s client timeout (Orq.ai internal retry = 31s) | CLAUDE.md | Default `orq_agents.timeout_ms=45000` matches |
| XML-tagged prompts | CLAUDE.md / `docs/orqai-patterns.md` | D-08 |
| Service role key for automation writes | CLAUDE.md Supabase patterns | `createAdminClient()` from `@/lib/supabase/admin` |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| LLM classification (Stage 1) | Backend / Inngest worker | Orq.ai service | Inngest owns durability + replay; Orq owns the LLM call + json_schema enforcement |
| Closed-category catalog build | Backend / registry | Database (`swarm_categories`) | Registry-driven dispatch principle (Phase 68) — no swarm_type literals in code |
| Confidence gate (`low`→`unknown`) | Backend / worker | — | Hardcoded for v1 (D-10); per-swarm threshold deferred |
| Pipeline telemetry write | Backend / `emitPipelineEvent` | Database (`pipeline_events`) | Phase 70 dual-write contract: legacy + canonical inside same `step.run` |
| Stage 1→2 verdict emission | Backend / Inngest event | — | Existing `classifier/verdict.recorded` consumer (verdict-worker) handles routing |
| Sales-email Outlook ingest | Backend / API route | Zapier webhook (or future Graph subscription) | OUT-OF-SCOPE for the worker code, but a runtime dependency for SPEC req 7 |
| `swarm_type` derivation at Stage 0 | Backend / ingest route | — | Currently hardcoded; must be threaded through `stage-0/email.received` event |

## Standard Stack

### Core (already in repo — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Inngest SDK | (project-installed) | Durable workflow runtime | All workers in `web/lib/inngest/functions/` use this idiom [VERIFIED: codebase] |
| `@supabase/supabase-js` | (project-installed) | Service-role admin client | `createAdminClient()` from `@/lib/supabase/admin` is the canonical write path [VERIFIED: classifier-label-resolver.ts:15] |
| Orq.ai REST `/v2/agents/{key}/responses` | n/a | Agent invocation transport | `invokeOrqAgent` in `web/lib/automations/orq-agents/client.ts:113` is the single transport seam [VERIFIED: client.ts] |
| `zod` | (project-installed) | Output schema validation post-Orq-call | Pattern: `llm-tiebreaker.ts:71` parses Orq output before use [VERIFIED: codebase] |
| `vitest` | (project-installed) | Test framework | All `__tests__` files use vitest [VERIFIED: classifier-verdict-worker.test.ts] |

### Supporting

| Helper | Path | Purpose | When to Use |
|--------|------|---------|-------------|
| `loadSwarm` | `web/lib/swarms/registry.ts:30` | 60s-cached `swarms` row read | D-16 step 1 — load `stage1_regex_module` |
| `loadSwarmCategories` | `web/lib/swarms/registry.ts:54` | 60s-cached `swarm_categories[]` | D-07 closed-list build |
| `emitPipelineEvent` | `web/lib/pipeline-events/emit.ts:29` | Phase 70 canonical write | D-16 step 4 |
| `numericConfidence` | `web/lib/pipeline-events/types.ts:107` | Map `'low'\|'medium'\|'high'\|'none'` → `0.4\|0.7\|0.9\|null` | When writing `pipeline_events.confidence` |
| `invokeOrqAgent` / `invokeOrqAgentWithUsage` | `web/lib/automations/orq-agents/client.ts:113` | Registry-driven Orq call | D-16 step 3 |
| `inngest` client | `@/lib/inngest/client` | Send events | All `inngest.send(...)` calls — never destructure |
| `createAdminClient` | `@/lib/supabase/admin` | Service-role Supabase | DB writes from Inngest workers |

### Alternatives Considered

| Instead of | Could Use | Tradeoff (Why Not) |
|------------|-----------|---------------------|
| `invokeOrqAgent` | Direct `fetch` to Orq REST | Loses registry routing + the schema-on-server contract; CLAUDE.md mandates registry-driven |
| Orq.ai | Anthropic SDK direct | CLAUDE.md forbids direct LLM API keys (must go through Orq Router) |
| Inline `swarm_type === 'sales-email'` branch | Registry-driven `swarms.stage1_regex_module=null` | SPEC acceptance criteria explicitly forbid string literal; planner-side bug if it slips in |

**No new packages need to be installed.** All primitives are present.

**Version verification:** Not applicable — this phase adds no new npm dependencies. The Orq client + helpers are project-local.

## Architecture Patterns

### System Architecture Diagram

```
                                          ┌─────────────────────────────────────┐
                                          │ Outlook ingest (debtor + sales)     │
                                          │ /api/automations/{swarm}/ingest     │
                                          │ ────────────────────────────────────│
                                          │ derives swarm_type from route       │
                                          │ creates email_pipeline.emails row   │
                                          └──────────────┬──────────────────────┘
                                                         │ inngest.send
                                                         ▼
                                          ┌─────────────────────────────────────┐
                                          │ stage-0/email.received              │
                                          │ + swarm_type (NEW field)            │
                                          └──────────────┬──────────────────────┘
                                                         ▼
                                          ┌─────────────────────────────────────┐
                                          │ stage-0-safety-worker               │
                                          │  regex → LLM verdict → budget       │
                                          │  threads swarm_type through         │
                                          └──────┬──────────────────────────────┘
                                                 │ (verdict='safe')
                                                 ▼
                                          ┌─────────────────────────────────────┐
                                          │ classifier/screen.requested         │
                                          │ + swarm_type (NEW field, D-01)      │
                                          │ + entity (NEW field, D-02)          │
                                          └──────────────┬──────────────────────┘
                                                         ▼
                       ┌─────────────────────────────────────────────────────┐
                       │ classifier-screen-worker (NEW — this phase)         │
                       │ retries: 0                                          │
                       │ ─────────────────────────────────────────────────── │
                       │ step.run("load-swarm-row")                          │
                       │   → loadSwarm(swarm_type)                           │
                       │   → loadSwarmCategories(swarm_type)                 │
                       │ step.run("regex")                                   │
                       │   if swarms.stage1_regex_module is null → skip      │
                       │   else dynamic-import → call classify(input)        │
                       │   if non-unknown result → set final, skip llm       │
                       │ step.run("llm-call")  ← only if regex='unknown'     │
                       │   → invokeOrqAgent("stage-1-category-classifier")   │
                       │   → zod-parse output                                │
                       │   → INSERT agent_runs row (id generated INSIDE)     │
                       │   → apply confidence gate (low → unknown)           │
                       │   → on error: coerce final='unknown'/conf='low'     │
                       │ step.run("emit-pipeline-event")                     │
                       │   → emitPipelineEvent(stage=1, decision=final, ...) │
                       │ step.run("emit-verdict")                            │
                       │   → inngest.send("classifier/verdict.recorded",    │
                       │                  {swarm_type, predicted_category})  │
                       └────────────────────────────┬────────────────────────┘
                                                    ▼
                                          ┌─────────────────────────────────────┐
                                          │ classifier-verdict-worker (existing)│
                                          │ switch on swarm_categories.action   │
                                          │ → categorize_archive / reject /     │
                                          │   manual_review / swarm_dispatch    │
                                          └─────────────────────────────────────┘
```

### Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| Stage 0 ingest route | `web/app/api/automations/debtor-email/ingest/route.ts` | Derives `swarm_type='debtor-email'` from path; emits `stage-0/email.received` |
| Stage 0 ingest route (sales) | `web/app/api/automations/sales-email/ingest/route.ts` (NEW or stub) | Derives `swarm_type='sales-email'`; emits same event |
| Stage 0 worker | `web/lib/inngest/functions/stage-0-safety-worker.ts` | Threads `swarm_type` from event into `classifier/screen.requested` (currently hardcoded `'debtor-email'`) |
| Event schemas | `web/lib/inngest/events.ts` | Add `swarm_type: string` to `stage-0/email.received` AND `classifier/screen.requested` |
| Worker (NEW) | `web/lib/inngest/functions/classifier-screen-worker.ts` | The whole D-16 step chain |
| Regex module loader (NEW) | `web/lib/swarms/regex-loader.ts` (or inline in worker) | Dynamic-import `swarms.stage1_regex_module`; D-04 |
| Agent registry row (NEW) | `supabase/migrations/{date}_phase74_stage1_classifier_agent.sql` | INSERT `orq_agents` row |
| Sales-email registry seed | `supabase/migrations/{date}_phase74_sales_email_seed.sql` | INSERT `swarms` + 5 `swarm_categories` rows |
| `agent_runs` constraint widening | `supabase/migrations/{date}_phase74_agent_runs_entity_nullable.sql` | Make `entity` nullable OR widen the CHECK constraint to permit null/sales-email entities |

### Pattern 1: Registry-driven dispatch (no swarm_type literals)

**What:** The worker reads `swarms` + `swarm_categories` rows at call time and switches on data, not literals.
**When:** Always (this is the swarm-agnostic axiom).
**Example:**
```typescript
// Source: web/lib/inngest/functions/classifier-verdict-worker.ts:71-74
const categories = await step.run("load-categories", () =>
  loadSwarmCategories(admin, swarm_type),
);
const category = categories.find((c) => c.category_key === finalCategoryKey);
// ... switch (category.action) { ... }
```

### Pattern 2: Replay-safe id generation inside step.run

**What:** Generate non-deterministic ids inside `step.run()` so Inngest replay returns the cached value, not a fresh one.
**Why:** Phase 65 learned this the hard way (commit `dae6276`/`dd2583a`) — UUIDs generated outside `step.run` re-roll on replay; INSERT happens with id-A, UPDATE with id-B, `.eq()` matches zero rows.
**Example:**
```typescript
// Source: classifier-invoice-copy-handler.ts (agent_runs insert pattern)
const agentRunId = await step.run("create-agent-run", async () => {
  const { data, error } = await admin
    .from("agent_runs")
    .insert({
      swarm_type: swarm_type ?? "debtor-email",
      email_id: message_id,
      inngest_run_id: event.id ?? `local-${message_id}`,
      status: "classifying",
      // ...
    })
    .select("id")
    .single();
  if (error) throw new Error(`agent_runs insert failed: ${error.message}`);
  return (data as { id: string }).id;
});
```

### Pattern 3: Never-destructure `inngest.send`

**What:** Call `inngest.send` inline (or cast through a type alias). NEVER `const send = inngest.send`.
**Why:** Phase 65 commit `dae6276` — destructuring loses `this`-binding → runtime `TypeError: Cannot read properties of undefined (reading '_send')`.
**Example:**
```typescript
// Source: classifier-label-resolver.ts:34, 270-287
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
await step.run("emit-coordinator", async () =>
  (inngest.send as unknown as SendFn)({
    name: "debtor-email/coordinator.requested",
    data: { /* ... */ },
  }),
);
```

### Pattern 4: Phase 70 dual-write (legacy + canonical in one step.run)

**What:** Write the legacy denormalised row AND the canonical `pipeline_events` row inside the SAME `step.run`. On replay both are skipped together.
**Example:**
```typescript
// Source: classifier-label-resolver.ts:151-228
await step.run("write-email-label", async () => {
  // legacy write
  const { data, error } = await admin
    .schema("debtor")
    .from("email_labels")
    .insert({ /* ... */ })
    .select("id")
    .single();
  if (error) throw new Error(`email_labels insert failed: ${error.message}`);

  // canonical Phase 70 write — same step.run boundary
  await emitPipelineEvent(admin, {
    swarm_type: swarm_type ?? "debtor-email",
    stage: 2,
    email_id: emailRow.id,
    decision,
    confidence,
    decision_details: { /* ... */ },
    automation_run_id: automation_run_id ?? null,
    triggered_by: "pipeline",
  });
  return data;
});
```

### Pattern 5: Orq agent invocation with output validation

**What:** Use registry-driven `invokeOrqAgent`, then zod-parse the output. Schema enforcement lives on the Orq agent (Studio Tools → JSON Schema), NOT in per-call body.
**Example:**
```typescript
// Source: web/lib/automations/debtor-email/llm-tiebreaker.ts:42-72
const TiebreakerOutputSchema = z.object({
  selected_account_id: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string().min(1),
});
const result = await invokeOrqAgent("label-tiebreaker", inputs, {
  jsonSchemaName: "label_tiebreaker_output",  // signature compat only
});
const parsed = TiebreakerOutputSchema.parse(result.raw);
```

### Anti-Patterns to Avoid

- **Generating UUIDs outside `step.run`:** Replay re-rolls them. (Phase 65 learning.)
- **`const send = inngest.send`:** Loses `this` binding. (Phase 65 `dae6276`.)
- **Branching on `swarm_type === 'X'` in worker code:** SPEC acceptance criteria explicitly forbid. Use registry rows.
- **Putting `response_format` in the per-call Orq REST body:** `client.ts:96-98` confirms — schema enforcement is at the Orq agent level (Studio config), not per-call.
- **Cron-string in JSDoc:** `*/N` closes the comment. (Not applicable here — no cron — but a CLAUDE.md mandate generally.)
- **`swarm_type ?? "debtor-email"` in a registry-driven worker:** That fallback is fine in legacy code but is a code-smell here — if `swarm_type` is missing the run should fail loudly, not silently default.
- **Hardcoding `STALE_CHANNEL = "debtor-email-review"`** like Stage 0 does — the new worker should derive it from `swarm_type` (e.g. `${swarm_type}-review`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Orq agent invocation | Direct `fetch` to api.orq.ai | `invokeOrqAgent` from `orq-agents/client.ts` | Registry routing, timeout, auth, output JSON-parsing all handled |
| Pipeline-events write | Bare INSERT | `emitPipelineEvent` | Type-safe payload contract, error wrapping |
| Confidence text→numeric | Inline mapping | `numericConfidence` helper | Already maps low=0.4, medium=0.7, high=0.9 |
| Swarm registry read | Direct supabase query | `loadSwarm` / `loadSwarmCategories` | 60s in-memory cache + last-known-good error semantics |
| `inngest.send` typing | Bare call against typed EventSchemas | The `SendFn` cast pattern from `classifier-label-resolver.ts:34` | Avoids the strict event-name union when payload extends |
| Output schema validation | Trust LLM output | `zod` schema + `.parse()` | Phase 65 learning: prompt-only JSON fails 15-20% even with strict mode |
| Mailbox→entity mapping | Inline switch | Existing `ICONTROLLER_MAILBOXES` (debtor only) — but **see runtime-state warning below** | New mailboxes must be added explicitly |

**Key insight:** Every primitive needed already exists. The phase is composition, not invention.

## Runtime State Inventory

This is a feature-add phase, not a rename/refactor — but several runtime-state items MUST be addressed because the locked decisions assume they exist.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `public.orq_agents` has NO row for `stage-1-category-classifier` (verified — migrations `20260429g`, `20260430`, `20260501d`, `20260505b` reviewed). | INSERT migration (one row, swarm_type='cross-cutting'). |
| **Stored data** | `public.swarms` has ONE row (`debtor-email`); NO `sales-email` row. | INSERT migration (D-17 seed). |
| **Stored data** | `public.swarm_categories` has 7 debtor-email rows; ZERO sales-email rows. | INSERT migration (D-17 seed — 5 rows). |
| **Stored data** | `public.agent_runs` has CHECK `entity IN ('smeba','berki','sicli-noord','sicli-sud','smeba-fire')` AND `entity NOT NULL`. **An LLM agent_runs row for sales-email will FAIL the constraint.** | Migration to make `entity` nullable OR widen CHECK to allow null/sales values. **CRITICAL — without this, D-19 RED test "sales-email no-regex path → LLM-only" with agent_runs assertion will fail.** |
| **Stored data** | `public.agent_runs.swarm_type` CHECK already includes `'sales-email'` (verified `20260428_public_agent_runs.sql:13-15`). | None — already permits the value. |
| **Stored data** | `public.swarm_intents` has 8 debtor-email rows; ZERO sales-email rows. | None this phase (D-18 — sales-email gets no Stage 3 chain). |
| **Live service config** | Orq.ai Studio: NO `stage-1-category-classifier` agent exists. | Manual Studio steps: (a) `list_models` MCP call to verify all 3 model IDs; (b) `create_agent` MCP call (bare); (c) Studio Tools → Add → JSON Schema (resource named e.g. `stage_1_classifier_v1` with strict schema, anyOf for nullable); (d) Studio → Model parameters → Response Format dropdown = "JSON Schema" → select the resource by name; (e) `update_agent` MCP call with full `model.parameters` + `fallback_models`; (f) `get_agent` verify. **The Orq MCP has NO tool CRUD — step (c) and (d) are Studio-manual** (CLAUDE.md 2026-05-01 observation). |
| **OS-registered state** | None — Inngest functions self-register on Vercel deploy. | None. |
| **Secrets/env vars** | `ORQ_API_KEY` already in Vercel env. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` already in Vercel env. | None. |
| **Build artifacts** | Inngest function registry list (in `web/lib/inngest/functions/index.ts` or wherever functions are aggregated for the Inngest serve handler). | Add `classifierScreenWorker` export to the function list so Inngest registers it on next deploy. |
| **Mailbox registry** | `ICONTROLLER_MAILBOXES` (`web/lib/automations/debtor-email/mailboxes.ts`) covers `debiteuren@smeba.nl`, `debiteuren@smeba-fire.nl`, `debiteuren@berki.nl`, `debiteuren@sicli-noord.nl`, `debiteuren@sicli-sud.nl`. **Does NOT cover `firecontrol@*` or any sales mailbox** named in SPEC req 7. | Operator confirms exact mailbox addresses; planner adds entries OR uses an alternative gate that doesn't require this map. **CRITICAL — `classifier-label-resolver`'s `isKnownMailbox` gate at line 294 silently no-ops the iController side-effect dispatch for unknown mailboxes** (so debtor-email-style live actions on `firecontrol@` won't fire even when CONTEXT/SPEC implies they should). Worth flagging to operator: is `firecontrol@` a debtor mailbox or its own swarm? |
| **Sales-email ingest path** | `web/app/api/automations/sales-email/ingest/route.ts` — DOES NOT EXIST. There is `sales-email-analyzer/` (separate KB-build automation) but no Outlook ingest emitting `stage-0/email.received`. | Out-of-scope per D-18 ("ingest hook is operator decision") but a HARD DEPENDENCY for SPEC req 7. Planner MUST surface as a gating risk: without ingest, no sales-email message ever reaches Stage 0; the rollout's "one sales mailbox" check fails. |

## Common Pitfalls

### Pitfall 1: Sales-email LLM call writes `agent_runs` row → CHECK constraint violation

**What goes wrong:** `agent_runs.entity` is `NOT NULL` with CHECK on five debtor entities. An `agent_runs` insert for a sales-email LLM call will throw `new row for relation "agent_runs" violates check constraint`.
**Why:** Schema was hardened for debtor-email rollout (Phase 60-00) before sales-email was a runtime concern.
**How to avoid:** Migration to make `entity` nullable AND drop/widen the CHECK. Suggested:
```sql
alter table public.agent_runs drop constraint agent_runs_entity_check;
alter table public.agent_runs alter column entity drop not null;
-- Optionally re-add a less restrictive CHECK or none.
```
**Warning sign:** RED test for sales-email LLM-only path that asserts `agent_runs.swarm_type='sales-email'` insert succeeds.

### Pitfall 2: `swarm_type` not threaded through Stage 0

**What goes wrong:** D-01 mandates extending `classifier/screen.requested` with `swarm_type`, but the Stage 0 worker can only emit a value it has. Today `stage-0/email.received` does NOT carry `swarm_type` and `stage-0-safety-worker.ts` hardcodes `swarm_type: "debtor-email"` at line 130 + uses `STALE_CHANNEL = "debtor-email-review"`.
**Why:** Stage 0 was built debtor-only; no cross-swarm requirement existed until Phase 74.
**How to avoid:** Three coordinated changes: (a) extend `stage-0/email.received` event schema with `swarm_type: string` (`web/lib/inngest/events.ts:259-269`); (b) modify ingest route(s) to populate it from the route path (`/api/automations/{swarm}/ingest` derives `swarm_type` deterministically); (c) modify `stage-0-safety-worker.ts` to thread `swarm_type` through both `classifier/screen.requested` emit sites (lines 75 and 177) and through the `automation_runs.swarm_type` insert.
**Warning sign:** A grep `grep -n '"debtor-email"' web/lib/inngest/functions/stage-0-safety-worker.ts` returns ANY match after the phase ships.

### Pitfall 3: Orq `create_agent` silently drops `response_format`

**What goes wrong:** `create_agent` succeeds, `get_agent` echoes back model params, but Studio's Response Format field is empty and per-call output is plain text (no schema enforcement) → 15-20% JSON parse failures (CLAUDE.md `cba7352b` learning).
**Why:** Documented Orq.ai bug: `create_agent` drops `model.parameters.response_format`; only `update_agent` persists it.
**How to avoid:** D-09 flow strictly. Verify `get_agent` shows `model.parameters.response_format` populated AND Studio renders the json_schema dropdown set to the named resource.
**Warning sign:** Smoke test sends a sample input and the LLM returns plain text or markdown-wrapped JSON instead of a parseable JSON object on the first try.

### Pitfall 4: Replay re-rolls `agent_runs.id`

**What goes wrong:** UUID generated outside `step.run("llm-call")` re-rolls on replay → INSERT id-A, downstream UPDATE id-B, `.eq()` matches 0 rows, agent_runs.tool_outputs never updated. (Phase 65 `dae6276` / `dd2583a`.)
**How to avoid:** Generate the UUID INSIDE `step.run("llm-call")` via Supabase `gen_random_uuid()` default OR `crypto.randomUUID()` inside the step body. Pattern:
```typescript
const agentRunId = await step.run("llm-call", async () => {
  const id = crypto.randomUUID();  // or omit, let DB default fill it
  await admin.from("agent_runs").insert({ id, /*...*/ });
  return id;
});
```
**Warning sign:** Test that re-runs the same Inngest event and asserts `agent_runs` row count == 1, not 2.

### Pitfall 5: `firecontrol@` and `fire@` mailboxes silently bypass iController side-effects

**What goes wrong:** SPEC req 7 names `firecontrol@` and SMEBA `fire@` as debtor target mailboxes for Friday rollout. `classifier-label-resolver.ts:294` gates iController side-effects on `isKnownMailbox(source_mailbox)` — neither address is in `ICONTROLLER_MAILBOXES`. Stage 1 verdict is recorded, but the downstream `stage1_categorize_archive` side-effect dispatch never fires. Result: ALL three target mailboxes show up in `pipeline_events` (D-20 acceptance) but downstream live-mode iController tagging never happens for the new mailboxes. SPEC req 7's acceptance check (`pipeline_events shows ≥1 Stage-1 row`) PASSES while the true rollout intent (live tagging) silently no-ops.
**How to avoid:** Operator confirms whether `firecontrol@` is a debtor mailbox needing the iController chain. If yes, add it to `ICONTROLLER_MAILBOXES` (Wave 0). If it's its own swarm, that's a Phase 75+ concern and the planner should call this out as descope.
**Warning sign:** Live deploy shows `pipeline_events` rows but Outlook category labels never appear on `firecontrol@` messages.

### Pitfall 6: Empty closed-category list at call time

**What goes wrong:** Sales-email seed migration is applied AFTER worker deploys, OR an operator disables all `swarm_categories` rows mid-flight. Worker invokes Orq agent with `<categories>` block empty → LLM either hallucinates a category or responds with `unknown`. Hallucinated keys then fail the verdict-worker's `categories.find(...)` lookup → `automation_runs.status='failed'`.
**How to avoid:** Worker validates `categories.length > 0` before LLM call; if zero, coerce to `category_key='unknown'` and emit `manual_review` verdict. Alternatively: deploy the seed migration in Wave 2 BEFORE worker registration (Wave 4).
**Warning sign:** First sales-email message after deploy lands in `automation_runs.status='failed'` with error "no swarm_categories row for (sales-email, ...)".

### Pitfall 7: Stage 0 emits `swarm_type` but the seed migration's `swarm_type='sales-email'` row isn't in the cache yet

**What goes wrong:** `loadSwarm`/`loadSwarmCategories` use 60s in-memory caches per Vercel instance. If the seed migration is applied at T0 and a sales-email message hits Stage 1 at T0+5s on a Vercel instance that warmed up at T-30s, the cache is stale and returns `null`/`[]`.
**How to avoid:** The cache returns `null` on `loadSwarm` cache-miss after a fresh DB read so this is mostly self-resolving — but the worker MUST handle `swarms_row === null` explicitly: throw with a clear error message. The seed migration in Wave 2 SHOULD precede worker deploy in Wave 4 by enough wall-clock time that cache warm-up isn't a race.
**Warning sign:** First sales-email runs after migration error with "swarms row not found for sales-email".

## Code Examples

### Example A: Worker skeleton (D-16 step ordering)

```typescript
// File: web/lib/inngest/functions/classifier-screen-worker.ts
// Source patterns from: classifier-label-resolver.ts, classifier-verdict-worker.ts
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm, loadSwarmCategories } from "@/lib/swarms/registry";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import { numericConfidence } from "@/lib/pipeline-events/types";
import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";
import { z } from "zod";

const Stage1OutputSchema = z.object({
  category_key: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning: z.string().nullable(),
});

type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

export const classifierScreenWorker = inngest.createFunction(
  { id: "classifier/screen-worker", retries: 0 },
  { event: "classifier/screen.requested" },
  async ({ event, step }) => {
    const {
      automation_run_id,
      email_id,
      message_id,
      source_mailbox,
      subject,
      body_text,
      swarm_type,    // NEW field per D-01
      entity,        // NEW field per D-02
    } = event.data as {
      automation_run_id: string;
      email_id: string;
      message_id: string;
      source_mailbox: string;
      subject: string;
      body_text: string;
      swarm_type: string;
      entity?: string | null;
    };

    const admin = createAdminClient();

    // ───── Step 1: load swarm row + categories (D-16.1) ────────────────
    const { swarmRow, categories } = await step.run("load-swarm-row", async () => {
      const swarmRow = await loadSwarm(admin, swarm_type);
      if (!swarmRow) throw new Error(`swarms row not found for ${swarm_type}`);
      const categories = await loadSwarmCategories(admin, swarm_type);
      return { swarmRow, categories };
    });

    // ───── Step 2: regex (D-16.2, D-03, D-04) ─────────────────────────
    const regexOutcome = await step.run("regex", async () => {
      if (!swarmRow.stage1_regex_module) {
        return { invoked: false, category: "unknown" as const, matchedRule: null };
      }
      // D-04: dynamic import. Errors throw → run fails (D-12).
      const mod = await import(swarmRow.stage1_regex_module);
      const result = mod.classify({
        subject,
        from: "",  // sender_email may not be on the event payload — populate if available
        bodySnippet: body_text,
      });
      return {
        invoked: true,
        category: result.category as string,
        matchedRule: result.matchedRule as string | null,
      };
    });

    let finalCategoryKey = regexOutcome.category;
    let llmInvoked = false;
    let llmConfidence: "low" | "medium" | "high" | null = null;
    let llmReasoning: string | null = null;
    let llmError: string | null = null;
    let agentRunId: string | null = null;

    // ───── Step 3: LLM call only on regex='unknown' (D-16.3, D-10, D-11) ─
    if (regexOutcome.category === "unknown") {
      const llmResult = await step.run("llm-call", async () => {
        const id = crypto.randomUUID();  // INSIDE step.run per Phase 65 learning
        try {
          const enabledCategories = categories.filter((c) => c.enabled);
          const result = await invokeOrqAgent(
            "stage-1-category-classifier",
            {
              subject,
              body_text,
              categories: enabledCategories.map((c) => ({
                category_key: c.category_key,
                display_label: c.display_label,
              })),
            },
          );
          const parsed = Stage1OutputSchema.parse(result.raw);
          // D-10 confidence gate
          const finalKey = parsed.confidence === "low" ? "unknown" : parsed.category_key;

          // INSERT agent_runs row (telemetry)
          await admin.from("agent_runs").insert({
            id,
            swarm_type,
            automation_run_id: automation_run_id ?? null,
            email_id,
            inngest_run_id: event.id ?? `local-${message_id}`,
            entity: entity ?? null,  // requires schema fix — see Pitfall 1
            status: "predicted",
            confidence: parsed.confidence,
            reasoning: parsed.reasoning,
            tool_outputs: { stage1_category: parsed.category_key, gated_to: finalKey },
          });

          return {
            id,
            category_key: parsed.category_key,
            confidence: parsed.confidence,
            reasoning: parsed.reasoning,
            finalKey,
            error: null as string | null,
          };
        } catch (err) {
          // D-11: coerce to unknown/low; persist error
          const msg = err instanceof Error ? err.message : String(err);
          await admin.from("agent_runs").insert({
            id,
            swarm_type,
            automation_run_id: automation_run_id ?? null,
            email_id,
            inngest_run_id: event.id ?? `local-${message_id}`,
            entity: entity ?? null,
            status: "failed",
            confidence: "low",
            reasoning: null,
            tool_outputs: { error: msg },
          });
          return {
            id,
            category_key: "unknown",
            confidence: "low" as const,
            reasoning: null,
            finalKey: "unknown",
            error: msg,
          };
        }
      });

      llmInvoked = true;
      agentRunId = llmResult.id;
      llmConfidence = llmResult.confidence;
      llmReasoning = llmResult.reasoning;
      llmError = llmResult.error;
      finalCategoryKey = llmResult.finalKey;
    }

    // ───── Step 4: pipeline_events dual-write (D-16.4) ────────────────
    await step.run("emit-pipeline-event", async () => {
      await emitPipelineEvent(admin, {
        swarm_type,
        stage: 1,
        email_id,
        decision: finalCategoryKey,
        confidence: numericConfidence(llmConfidence ?? null),
        decision_details: {
          regex: regexOutcome,
          llm_invoked: llmInvoked,
          llm_category_key: llmInvoked ? finalCategoryKey : null,
          llm_confidence: llmConfidence,
          llm_reasoning: llmReasoning,
          llm_error: llmError,
          final_category_key: finalCategoryKey,
        },
        agent_run_id: agentRunId,
        automation_run_id: automation_run_id ?? null,
        triggered_by: "pipeline",
      });
    });

    // ───── Step 5: emit verdict (D-16.5) ──────────────────────────────
    await step.run("emit-verdict", async () =>
      (inngest.send as unknown as SendFn)({
        name: "classifier/verdict.recorded",
        data: {
          automation_run_id,
          swarm_type,
          decision: "approve",
          message_id,
          source_mailbox,
          predicted_category: finalCategoryKey,
          override_category: null,
        },
      }),
    );

    return {
      ok: true,
      regex_category: regexOutcome.category,
      llm_invoked: llmInvoked,
      final_category_key: finalCategoryKey,
    };
  },
);
```

### Example B: Sales-email seed migration

```sql
-- File: supabase/migrations/{date}_phase74_sales_email_seed.sql
-- D-17

-- 1. swarms row
insert into public.swarms (
  swarm_type, display_name, description, review_route, source_table, enabled,
  ui_config, side_effects,
  stage1_regex_module, stage2_entity_resolver, stage3_coordinator_agent_key,
  canonical_context_shape, entity_brand
) values (
  'sales-email',
  'Sales Email',
  'Sales-email Stage 0→1 classification (Phase 74). LLM-only Stage 1 (no regex module).',
  '/automations/[swarm]/review',
  'automation_runs',
  true,
  jsonb_build_object(
    'tree_levels',  jsonb_build_array('topic','entity','mailbox_id'),
    'row_columns',  jsonb_build_array(
      jsonb_build_object('key','received_at','label','Received','width',140),
      jsonb_build_object('key','sender',     'label','Sender',  'width',220),
      jsonb_build_object('key','subject',    'label','Subject', 'width',420),
      jsonb_build_object('key','rule',       'label','Rule',    'width',180)
    ),
    'drawer_fields', jsonb_build_array('subject','sender','received_at','rule','predicted_category','body_html'),
    'default_sort',  'created_at desc'
  ),
  '[]'::jsonb,                          -- side_effects: none yet (D-18)
  null,                                  -- stage1_regex_module: D-03 null = LLM-only
  null,                                  -- stage2_entity_resolver: none (D-18)
  null,                                  -- stage3_coordinator_agent_key: none (D-18)
  null,                                  -- canonical_context_shape: none (D-18)
  '[]'::jsonb                           -- entity_brand: operator confirms whether [] or starter list
)
on conflict (swarm_type) do update set
  description = excluded.description,
  ui_config   = excluded.ui_config,
  updated_at  = now();

-- 2. swarm_categories rows (D-17 — 5 rows)
insert into public.swarm_categories (
  swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order
) values
  ('sales-email','auto_reply',          'Auto-reply',          'Auto-Reply',          'categorize_archive', null, 10),
  ('sales-email','ooo_temporary',       'OOO (temporary)',     'OoO — Temporary',     'categorize_archive', null, 20),
  ('sales-email','ooo_permanent',       'OOO (permanent)',     'OoO — Permanent',     'categorize_archive', null, 30),
  ('sales-email','payment_admittance',  'Payment Admittance',  'Payment Admittance',  'categorize_archive', null, 40),
  ('sales-email','unknown',             'Unknown (manual review)', null,             'manual_review',       null, 50)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();
```

### Example C: `agent_runs.entity` constraint relaxation

```sql
-- File: supabase/migrations/{date}_phase74_agent_runs_entity_nullable.sql
-- Pitfall 1 — sales-email has no entity in the debtor enum.
-- Make entity optional. CHECK is dropped; planner/operator can re-introduce
-- a swarm-aware CHECK in a future phase if needed.

alter table public.agent_runs
  drop constraint if exists agent_runs_entity_check;

alter table public.agent_runs
  alter column entity drop not null;
```

### Example D: Orq agent registry row

```sql
-- File: supabase/migrations/{date}_phase74_stage1_classifier_agent.sql
-- D-05, D-06. orqai_id is set in Studio AFTER MCP create_agent →
-- update_agent → get_agent ritual. Migration carries a placeholder; an
-- operator runs UPDATE with the real id after Studio steps complete.

insert into public.orq_agents (
  agent_key, orqai_id, description, swarm_type, version,
  input_schema, output_schema, model_config, timeout_ms, enabled, notes
) values (
  'stage-1-category-classifier',
  'PLACEHOLDER_STAGE1_CLASSIFIER_SLUG',
  'Swarm-agnostic Stage 1 LLM category classifier. Reads enabled swarm_categories at call time and emits one of (category_key, "unknown") with confidence low/medium/high. Phase 74.',
  'cross-cutting',
  '2026-05-06.v1',
  jsonb_build_object(
    'type','object',
    'required', array['subject','body_text','categories'],
    'properties', jsonb_build_object(
      'subject',    jsonb_build_object('type','string'),
      'body_text',  jsonb_build_object('type','string'),
      'categories', jsonb_build_object(
        'type','array',
        'items', jsonb_build_object(
          'type','object',
          'required', array['category_key','display_label'],
          'properties', jsonb_build_object(
            'category_key',  jsonb_build_object('type','string'),
            'display_label', jsonb_build_object('type','string')
          )
        )
      )
    )
  ),
  jsonb_build_object(
    'type','object',
    'required', array['category_key','confidence','reasoning'],
    'additionalProperties', false,
    'properties', jsonb_build_object(
      'category_key', jsonb_build_object('type','string'),
      'confidence',   jsonb_build_object('type','string','enum', array['low','medium','high']),
      'reasoning',    jsonb_build_object('anyOf', jsonb_build_array(
        jsonb_build_object('type','string'),
        jsonb_build_object('type','null')
      ))
    )
  ),
  jsonb_build_object(
    'primary',  'aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0',
    'fallbacks', array['openai/gpt-4o-mini','google-ai/gemini-2.5-flash'],
    'temperature', 0,
    'max_tokens', 400
  ),
  45000,
  false,  -- enabled=false until orqai_id is set in Studio AND get_agent verified
  'D-05/D-06 (Phase 74). Strict json_schema with anyOf-nullable reasoning. Activate via UPDATE orqai_id=<slug>, enabled=true after MCP ritual: list_models → create_agent → Studio JSON Schema tool → update_agent → get_agent verify.'
)
on conflict (agent_key) do update set
  description   = excluded.description,
  swarm_type    = excluded.swarm_type,
  version       = excluded.version,
  input_schema  = excluded.input_schema,
  output_schema = excluded.output_schema,
  model_config  = excluded.model_config,
  timeout_ms    = excluded.timeout_ms,
  notes         = excluded.notes,
  updated_at    = now();
```

## Open Questions (RESOLVED)

1. **`stage-0/email.received` schema extension** — D-01 only specifies extending `classifier/screen.requested`, but Stage 0 cannot emit a value it doesn't have on its inbound event. Is the planner expected to also extend `stage-0/email.received` and modify ingest routes? **Researcher recommendation:** YES — this is the deterministic path. The alternative (Stage 0 deriving `swarm_type` from `source_mailbox` via a new map) couples Stage 0 to mailbox→swarm registry and is more brittle than threading from the ingest route. **RESOLVED:** Plan 74-02 extends BOTH `stage-0/email.received` and `classifier/screen.requested` event schemas + updates the debtor-email ingest route emit-site to populate `swarm_type` + `entity`.

2. **Sales-email ingest path** — D-18 says ingest hook is operator decision. But SPEC req 7 acceptance is "≥1 Stage-1 row in `pipeline_events` for one sales mailbox in 24h". Without ingest, the rollout fails. **Researcher recommendation:** Planner asks operator at execute-phase start whether (a) a debtor-style Zapier→Vercel webhook will be wired for the sales mailbox in the same window, OR (b) a one-shot test message will be hand-fired at `inngest.send({name:"stage-0/email.received",...})` for verification. Option (b) is cheaper and meets the literal acceptance check. **RESOLVED:** Plan 74-05 Task 1 is an operator decision checkpoint between options (a) Zapier→Vercel webhook (production wiring) and (b) hand-fired smoke test; subsequent tasks (74-05 ingest route + 74-05 zapier_tools registry migration) implement option (a) by default and degrade to option (b) on operator request.

3. **`firecontrol@` mailbox status** — Is it a debtor mailbox (needing addition to `ICONTROLLER_MAILBOXES`) or its own swarm? Without operator clarification, downstream iController side-effects silently no-op for `firecontrol@` traffic. **Researcher recommendation:** Operator confirmation before Wave 0. **RESOLVED:** Plan 74-01 Task 1 is an operator confirmation checkpoint that gates Plan 74-01 Task 5 (the `ICONTROLLER_MAILBOXES` extension); default assumption is `swarm_type='debtor-email'` with iController dispatch enabled.

4. **`agent_runs.entity` strategy** — Drop CHECK + make nullable (broadest), or widen CHECK to `NULL allowed + sales-email entity values added`? **Researcher recommendation:** Drop the CHECK entirely and make `entity` nullable. The `swarm_type` column already provides the cross-swarm discriminator; `entity` is a debtor-specific concept that doesn't generalize. **RESOLVED:** Plan 74-01 Task 2 drops the CHECK constraint and makes `agent_runs.entity` nullable.

5. **`entity_brand` for sales-email seed** — D-17 leaves this as a planner/operator confirmation (`entity_brand=[]` vs starter list). **Researcher recommendation:** `[]` for v1 — matches D-18 ("sales-email only gets registry rows + ingest hook"); sales-email has no Stage 3 chain that consumes brand metadata yet. **RESOLVED:** Plan 74-01 Task 1 surfaces the `entity_brand` value as part of the operator confirmation checkpoint; default applied in Task 3 migration is `entity_brand='[]'::jsonb`.

6. **Inngest function registration index** — Where does the new function get registered for the Inngest serve handler? **Researcher recommendation:** Find the existing aggregator (likely `web/lib/inngest/functions/index.ts` or imported individually in `app/api/inngest/route.ts`) and add `classifierScreenWorker` to the export list. Verify with `grep -rn "classifierVerdictWorker" web/app/api/inngest/`. **RESOLVED:** Plan 74-04 Task 3 locates the existing aggregator and registers `classifierScreenWorker`; verified by grep on the aggregator file post-edit.

7. **Prompt content for `<role>` and `<task>`** — Discretion left to planner per CONTEXT. **Researcher recommendation:** Adapt the existing `debtor-intent-agent` system-prompt structure (in `Agents/debtor-email-swarm/agents/debtor-intent-agent.md`) — that agent has a working closed-enum classification prompt in production. **RESOLVED:** Plan 74-03 Task 1 STEP 3 adapts the `debtor-intent-agent` prompt structure with `<role>`, `<task>`, `<categories>`, `<input>`, `<constraints>`, `<output_format>` XML blocks; the closed-category list is templated at call time per D-07.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Vercel Inngest serve handler | Worker registration | ✓ | (project-deployed) | — |
| Orq.ai REST API | LLM call | ✓ | v2 | — |
| Orq.ai MCP (`mcp__orq__list_models`/`create_agent`/`update_agent`/`get_agent`) | Agent provisioning ritual | (assumed available in operator's MCP env) | — | Studio UI manual create |
| Orq.ai Studio UI | JSON Schema tool resource creation (only path — MCP has no tool CRUD per CLAUDE.md 2026-05-01) | (assumed operator access) | — | None — required step |
| `ORQ_API_KEY` env | LLM invocation | ✓ | — | — |
| `SUPABASE_SERVICE_ROLE_KEY` env | Admin DB writes | ✓ | — | — |
| Supabase migration apply path | Schema changes | ✓ via Supabase MCP / Studio SQL editor | — | — |
| `vitest` | Tests | ✓ | (project-installed) | — |
| Inngest dev server | Local replay testing | ✓ | (project-installed) | — |

**Missing dependencies with no fallback:** None (assuming operator has Orq Studio access — flagged but inevitable).

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` (existing in project) |
| Config file | `web/vitest.config.ts` (existing) |
| Quick run command | `cd web && pnpm vitest run lib/inngest/functions/__tests__/classifier-screen-worker.test.ts` |
| Full suite command | `cd web && pnpm vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-1 | Orq agent persists strict response_format | manual + smoke | `mcp__orq__get_agent` after `update_agent` shows `model.parameters.response_format` populated | ❌ Wave 0 (manual operator step) |
| REQ-1 | Agent on auto-reply fixture returns `category_key='auto_reply'` with `confidence ∈ {medium,high}` | smoke | One-shot fixture send via Orq Studio playground OR a `tests/smoke/stage1-classifier.test.ts` | ❌ Wave 0 |
| REQ-2 | Worker registered with `event: classifier/screen.requested`, `retries: 0`, side effects in step.run | unit | `vitest` test asserting `__config.retries === 0` and emit-classifier mock called | ❌ Wave 0 — `classifier-screen-worker.test.ts` |
| REQ-2 | Auto-reply fixture → exactly one `classifier/verdict.recorded` with `predicted_category='auto_reply'` | unit | `inngestSend` mock asserts call args | ❌ Wave 0 |
| REQ-3 | Regex hit on `payment_admittance` → no `agent_runs` insert | unit | Mock supabase from('agent_runs').insert never called | ❌ Wave 0 |
| REQ-3 | `swarms.stage1_regex_module=null` → LLM invoked unconditionally | unit | Mock `loadSwarm` returns `stage1_regex_module=null`, assert `invokeOrqAgent` called | ❌ Wave 0 |
| REQ-4 | LLM `confidence='low'` → `predicted_category='unknown'` | unit | Mock `invokeOrqAgent` returns low conf, assert verdict event has `predicted_category='unknown'` | ❌ Wave 0 |
| REQ-4 | LLM `confidence='medium', category_key='auto_reply'` → `predicted_category='auto_reply'` | unit | Same shape, different fixture | ❌ Wave 0 |
| REQ-5 | Each Stage-1 decision writes exactly one `pipeline_events` row | unit | Mock `emitPipelineEvent` asserts call count = 1 per worker invocation | ❌ Wave 0 |
| REQ-5 | LLM-invoked branch additionally writes one `agent_runs` row | unit | Mock supabase from('agent_runs').insert call count = 1 (LLM path), 0 (regex-hit path) | ❌ Wave 0 |
| REQ-5 | `agent_runs.swarm_type='sales-email'` row insert succeeds (DB schema) | integration | Test against test Supabase OR migration smoke that asserts insert with `swarm_type='sales-email', entity=null` succeeds | ❌ Wave 0 — depends on `entity` migration |
| REQ-6 | `select count(*) from swarm_categories where swarm_type='sales-email'` returns 5 | migration smoke | post-migration `psql` query OR a vitest integration test | ❌ Wave 0 |
| REQ-6 | No string literal `'sales-email'` or `'debtor-email'` in `classifier-screen-worker.ts` | static check | `grep -E "'(sales\|debtor)-email'" web/lib/inngest/functions/classifier-screen-worker.ts` returns nothing in branch conditions | ❌ Wave 0 — add to CI as a `pnpm lint` extension OR a one-line vitest assertion |
| REQ-6 | Worker successfully processes `swarm_type='sales-email'` payload | unit | Test invokes handler with `swarm_type='sales-email'`, asserts no throw + verdict emitted | ❌ Wave 0 |
| REQ-7 | 24-hour `pipeline_events` query for each of 3 mailboxes | manual / operator | Post-deploy SQL query | manual-only (per D-20) |
| REQ-7 | No `automation_runs.status='failed'` rows caused by new worker for 3 mailboxes | manual / operator | Post-deploy SQL query | manual-only (per D-20) |
| Pitfall 4 (replay-id) | Replay does not double-insert `agent_runs` | unit | Re-invoke handler with same `event.id`, assert insert call count == 1 | ❌ Wave 0 |
| Pitfall 6 (empty categories) | Worker handles `categories.length === 0` gracefully | unit | Mock `loadSwarmCategories` returns `[]`, assert verdict emitted with `predicted_category='unknown'` and no LLM call | ❌ Wave 0 |
| D-09 (create→PATCH→get_agent) | `model.parameters.response_format` persisted post-PATCH | manual / smoke | Operator runs `mcp__orq__get_agent` and asserts response_format JSON has the schema | manual-only |

### Sampling Rate

- **Per task commit:** `cd web && pnpm vitest run lib/inngest/functions/__tests__/classifier-screen-worker.test.ts`
- **Per wave merge:** `cd web && pnpm vitest run`
- **Phase gate:** Full suite green + manual operator confirmations (REQ-1 Studio JSON Schema, REQ-7 post-deploy 24h queries) before `/gsd-verify-work 74`.

### Wave 0 Gaps

- [ ] `web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts` — covers REQ-2, REQ-3, REQ-4, REQ-5, REQ-6 (all unit-test rows above) AND Pitfalls 4 + 6
- [ ] `supabase/migrations/{date}_phase74_agent_runs_entity_nullable.sql` — Pitfall 1 fix; required before sales-email LLM tests can pass
- [ ] `supabase/migrations/{date}_phase74_sales_email_seed.sql` — D-17 seed
- [ ] `supabase/migrations/{date}_phase74_stage1_classifier_agent.sql` — `orq_agents` registry row (placeholder slug, `enabled=false`)
- [ ] `web/lib/inngest/events.ts` schema extension — add `swarm_type: string` to BOTH `stage-0/email.received` and `classifier/screen.requested`
- [ ] `web/app/api/inngest/route.ts` (or function-aggregator file) — register `classifierScreenWorker`
- [ ] Lint/grep CI gate — fail build if `swarm_type === 'sales-email'` or `swarm_type === 'debtor-email'` literal appears in `classifier-screen-worker.ts` (REQ-6 acceptance check)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-call Orq `response_format` in REST body | Schema lives on Orq agent (Studio JSON Schema tool resource) | 2026-05-01 (CLAUDE.md Studio observation + `client.ts` rewrite) | The new agent MUST be set up via Studio for schema enforcement; per-call body cannot carry it |
| `create_agent` with full `model.parameters` | `create_agent` (bare) → `update_agent` (full) → `get_agent` (verify) | 2026-05 (CLAUDE.md `cba7352b`) | D-09 mandates this 3-step ritual |
| `swarm_type === 'X'` literal branches | Registry-driven dispatch (`swarms.stage1_regex_module`, `swarm_categories.action`) | Phase 68 (`20260504b`) | This phase is the first cross-swarm consumer of the Phase 68 generalisation — it will validate the abstraction |
| Per-table reads (Bulk Review queries `automation_runs` directly) | `pipeline_events` canonical telemetry + legacy denormalised read-models | Phase 70 (`20260506a`) | Stage-1 must dual-write per Phase 70 contract |

**Deprecated/outdated:**
- Previous `LABEL_TIEBREAKER_AGENT_SLUG` env-var-driven Orq agents — replaced by `public.orq_agents` registry. New Stage 1 agent MUST go through registry from day 1.
- Direct `from("agent_runs").insert(...)` outside `step.run` — Phase 65 replay-id learning makes this unsafe; always inside `step.run`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Orq.ai catalog still contains `aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0` and the two fallback IDs as of phase execution | Pattern 5, Code Example D, D-05 | `update_agent` accepts unknown IDs silently; Studio Model dropdown renders empty; `get_agent` verify catches it but `list_models` pre-flight is the contracted defense |
| A2 | `firecontrol@` is intended to be a debtor mailbox (not a separate swarm) | Pitfall 5, Open Q3 | Operator clarification needed; if it's a separate swarm, descope to Phase 75 |
| A3 | Sales-email mailbox has Outlook Graph access via existing Microsoft tenant credentials | Open Q2 | If access requires a new app registration/consent, ingest cannot ship Friday — descope to a hand-fired test message |
| A4 | `entity_brand=[]` is acceptable for sales-email seed | D-17 / Open Q5 | Worst-case planner asks operator at execute-phase start |
| A5 | Inngest function registration is via a single aggregator file the planner can locate with `grep -rn "classifierVerdictWorker"` | Open Q6 | Wrong location → worker doesn't register on deploy; smoke test catches it |
| A6 | `agent_runs.entity` CHECK + NOT NULL is still in production schema (last migration `20260428` reviewed; no later relaxation found) | Pitfall 1 | If a later migration already relaxed it, the planner's `agent_runs_entity_nullable` migration is a no-op (idempotent fine) |

[ALL CLAIMS IN THIS RESEARCH ARE VERIFIED VIA CODEBASE GREP/READ EXCEPT WHERE EXPLICITLY MARKED ABOVE.]

## Sources

### Primary (HIGH confidence — codebase verified)

- `web/lib/automations/orq-agents/client.ts` (lines 19-30, 113-195) — Orq invocation transport, agent row shape
- `web/lib/inngest/functions/classifier-label-resolver.ts` (lines 34, 151-228, 270-287) — Phase 70 dual-write template + SendFn cast pattern
- `web/lib/inngest/functions/classifier-verdict-worker.ts` (lines 26-90, 161-176) — registry-driven dispatch idiom + `loadSwarmCategories` use
- `web/lib/inngest/functions/stage-0-safety-worker.ts` (lines 38-199) — emit sites of `classifier/screen.requested` (lines 75, 177); hardcoded `'debtor-email'`
- `web/lib/swarms/registry.ts` (lines 30-76) — `loadSwarm` and `loadSwarmCategories` with TTL + last-known-good
- `web/lib/swarms/types.ts` (lines 8-95) — `SwarmRow`, `SwarmCategoryRow`, `SwarmAction` types
- `web/lib/pipeline-events/emit.ts` (whole file) — `emitPipelineEvent` shape
- `web/lib/pipeline-events/types.ts` (lines 17-116) — `Stage` enum, `PipelineEventInput`, `numericConfidence`
- `web/lib/inngest/events.ts` (lines 259-307) — current event schemas needing extension
- `web/lib/debtor-email/classify.ts` (line 238 + types lines 19-36) — regex `classify` function contract
- `web/lib/automations/debtor-email/llm-tiebreaker.ts` (lines 18-80) — zod-validated Orq invocation pattern
- `web/lib/automations/debtor-email/mailboxes.ts` — `ICONTROLLER_MAILBOXES` registry (5 mailboxes; firecontrol@ absent)
- `supabase/migrations/20260429b_swarm_registry.sql` — `swarms` + `swarm_categories` schemas + debtor seed
- `supabase/migrations/20260429g_orq_agents_registry.sql` — `public.orq_agents` schema + 3-row seed
- `supabase/migrations/20260429h_swarm_categories_unknown_dispatch.sql` — debtor `unknown` dispatch row
- `supabase/migrations/20260504b_swarms_registry_generalisation.sql` — Phase 68 columns (`stage1_regex_module`, etc.) + debtor backfill
- `supabase/migrations/20260428_public_agent_runs.sql` (lines 13-91) — `agent_runs` schema; `entity` CHECK constraint
- `supabase/migrations/20260506a_pipeline_events.sql` — `pipeline_events` schema
- `supabase/migrations/20260505b_orq_agents_cross_cutting.sql` — `swarm_type='cross-cutting'` precedent
- `web/lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts` (lines 1-50) — vitest mock pattern for new worker test
- `web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts` (lines 1-90) — extended mock pattern incl. `evaluateSideEffects`
- `web/app/api/automations/debtor-email/ingest/route.ts` (lines 600-652) — `stage-0/email.received` emit site (NO `swarm_type` today)
- `CLAUDE.md` — non-negotiable patterns (Orq + Inngest + Supabase sections)

### Secondary (MEDIUM — official docs / cross-reference)

- `docs/agentic-pipeline/README.md` — v8.0 5-stage architecture (canonical RFC)
- `docs/orqai-patterns.md` — XML-tagged prompts, response_format strict json_schema, fallback chains
- `docs/inngest-patterns.md` — step.run side effects, replay safety, retries:0 rationale
- Phase 65 commits `dae6276` and `dd2583a` (referenced in CLAUDE.md, not directly inspected — git log lookup deferred to planner if needed)

### Tertiary (LOW — none)

No claims in this research are based on unverified web search.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every helper directly inspected in codebase
- Architecture: HIGH — D-16 step ordering directly templated from `classifier-label-resolver.ts`
- Pitfalls: HIGH — Pitfalls 1 (`agent_runs.entity` CHECK), 2 (Stage 0 hardcoding), 5 (mailbox registry gap) verified by direct file reads; Pitfalls 3 (Orq create silently drops), 4 (replay-id) sourced from CLAUDE.md learnings with explicit commit/learning IDs
- Sales-email rollout dependencies: MEDIUM — researcher cannot confirm without operator input whether sales-email Outlook ingest can be wired by Friday and whether `firecontrol@` is debtor or its own swarm

**Research date:** 2026-05-06
**Valid until:** 2026-06-05 (30 days — stack is stable; only the Orq.ai catalog is fast-moving and demands `list_models` pre-flight at execute-phase time anyway)
