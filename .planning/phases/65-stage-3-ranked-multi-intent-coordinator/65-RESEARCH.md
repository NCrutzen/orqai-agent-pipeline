# Phase 65: Stage 3 ranked multi-intent coordinator + orchestrator escalation — Research

**Researched:** 2026-05-01
**Domain:** Agentic pipeline (Stage 3/3.5) — Inngest fan-out, Orq.ai agent re-versioning, Supabase RPC fan-in
**Confidence:** HIGH on integration shapes (verified against repo); MEDIUM on ceiling values and exact RPC signature (left to planner per CONTEXT discretion).

## Summary

Phase 65 is a **rewrite-in-place** of `web/lib/inngest/functions/debtor-email-triage.ts` that swaps a single-label classifier call for a ranked-intent coordinator and adds a Stage 3.5 orchestrator-worker fan-out for the ~20% of inbound that triggers escalation. CONTEXT.md (D-01..D-13) locks every meaningful design decision; this research is implementation-detail-only, not a design exploration.

The repo already provides every primitive needed:

- **Orq agent transport** — `web/lib/automations/orq-agents/client.ts` (`invokeOrqAgent`) is the single transport seam for all three new agents (coordinator v2, orchestrator-planner, synthesis).
- **Registry-driven dispatch** — `classifier-verdict-worker.ts` `case "swarm_dispatch"` (lines 149-176) is the prototype the coordinator's escalation dispatch follows verbatim.
- **Tool allowlist enforcement** — `nxt-zap-client.ts` (`ToolNotAllowedForIntentError`, lines 48-54 + `loadTool`) already rejects on `allowed_for_intents` mismatch; orchestrator-spawned handlers go through the same gate with no new code.
- **Budget counter primitive** — `web/lib/stage-0/budget-counter.ts` is the shape Phase 65 reuses inside `coordinator_runs.budget_run_id` accounting (D-07).
- **Idempotency cache** — `agent_runs.tool_outputs.intent_first_pass` keyed on `(email_id, intent_version)` via `findCachedOutput` invalidates automatically when the literal flips from `2026-04-23.v1` to `2026-05-01.v2` (D-12).

**Primary recommendation:** Phase 65 is best executed as **5 plans, in this order**: (1) DB migration (`coordinator_runs` table + RPC + `swarm_categories.requires_orchestration` column + types codification) → (2) Orq Studio setup (3 agent rows + JSON Schema tool resources, manual via Studio per CLAUDE.md, then PATCH-via-MCP to attach response_format) → (3) coordinator rewrite of `debtor-email-triage.ts` (single-shot path + escalation gate) → (4) orchestrator-planner + synthesis Inngest workers + RPC fan-in glue → (5) regression backfill + Bulk Review surfacing of `partial_synthesis` badge.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ranked-intent classification | API (Orq.ai via Inngest) | — | Stage 3 is a server-side LLM call; the function name `debtor-email-triage` survives Phase 65 (D-10). |
| Escalation gate evaluation | API (Inngest function) | Database (registry read) | Pure logic on the coordinator output + a `swarm_categories.requires_orchestration` lookup. |
| Orchestrator-planner + fan-out | API (Inngest) | Database (`coordinator_runs` row create) | Spawns N parallel `step.sendEvent`s; counter persistence on Postgres. |
| Fan-in synchronisation | Database (RPC `coordinator_complete_handler`) | API (Inngest event emit) | Atomic increment + conditional event emit must be transactional — Postgres function, NOT app code. |
| Synthesis | API (Orq.ai via Inngest) | — | Single LLM call on the canonical `HandlerOutput[]` shape. |
| iController draft creation | API (Inngest step → Browserless via Vercel route) | — | Reuse existing `/api/automations/debtor/create-draft` path (Phase 65 doesn't redesign the draft step). |
| Bulk Review badge | Frontend SSR | Database (`coordinator_runs` join) | `partial_synthesis` badge is a `<Badge>` rendered from the joined row in the existing review surface; UI overrides land in Phase 71. |

## User Constraints (from CONTEXT.md)

### Locked Decisions

Verbatim copy of CONTEXT.md §`<decisions>`:

- **D-01:** Replace `debtor-intent-agent` in-place. `agent_key` stays. Bump `version` from `2026-04-23.v1` → `2026-05-01.v2`. Swap `output_schema` to ranked-list shape (D-12). Swap `model_config.primary` to `anthropic/claude-sonnet-4-5-20250929` (Anthropic-direct), fallbacks `aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0`, `openai/gpt-4o`, `google-ai/gemini-2.5-pro`, `mistral/mistral-large-2411`.
- **D-02:** Hybrid path: ranking → orchestrator-planner LLM → Inngest parallel dispatch → synthesis LLM.
- **D-03:** Separate `debtor-orchestrator-agent` (`swarm_type='debtor-email'`); runs only on escalation. Output = execution plan `{handlers: [...], ordering: 'parallel'|'sequential', notes}`. Model = sonnet-4-5-20250929.
- **D-04:** Fan-in via Supabase counter + RPC trigger. `coordinator_runs.expected_handlers=N`; each Stage 4 handler calls `rpc.coordinator_complete_handler(run_id)`; when `completed_handlers = expected_handlers`, the RPC emits `debtor-email/synthesis.requested`.
- **D-05:** Partial synthesis on handler failure. Footer noting un-addressed intents; `coordinator_runs.partial_synthesis = true`. Never silently drop secondaries; never fail whole run on one child failure.
- **D-06:** Cross-cutting `synthesis-agent` (`swarm_type='cross-cutting'`). Operates on canonical `HandlerOutput[]` (codified in `web/lib/agentic-pipeline/types.ts` this phase). Output = `body_html + detected_tone + synthesis_version` with audit footer.
- **D-07:** Budget propagation under one shared `run_id`. Orchestrator family treated as one logical run; each handler increments shared counters in `coordinator_runs` via RPC; breach emits existing `pipeline/budget_breached`.
- **D-08:** `swarm_categories.requires_orchestration boolean NOT NULL DEFAULT false`. Phase 68 migrates cleanly to `swarm_intents`.
- **D-09:** Tri-state escalation gate: `ranked[0].confidence == 'low' OR ranked.length >= 3 OR any(r.intent has requires_orchestration = true)`.
- **D-10:** Replace `debtor-email-triage` in-place. Pre-stage Phase 66 events: single-shot emits `debtor-email/<intent>.requested`; escalation emits `debtor-email/orchestrator.requested`. Function name survives until Phase 66.
- **D-11:** New `coordinator_runs` table (schema in CONTEXT).
- **D-12:** Coordinator strict `output_schema` with `anyOf` for nullable; `intent_version: const "2026-05-01.v2"`.
- **D-13:** Orq workflow: `list_models` pre-flight; create-then-PATCH because `create_agent` drops `response_format`; JSON Schema tool resource via Studio.

### Claude's Discretion

- Concurrency limits on fan-out (likely `(entity, run_id)`-scoped).
- Idempotency keys for orchestrator + synthesis steps.
- iController draft creation post-synthesis — reuse existing helper or factor.
- Exact RPC name + signature for `coordinator_complete_handler`.
- Idempotency cache invalidation for coordinator agent (planner verifies `intent_version` lookup).
- Whether orchestrator-planner output schema includes `notes` for debugging (probably yes).
- Eval / regression strategy: backfill last N production emails through new coordinator and compare top-1 against legacy single-label. Planner sizes N.

### Deferred Ideas (OUT OF SCOPE)

- Numeric confidence threshold for escalation → Phase 71.
- `swarm_intents` table → Phase 68.
- Canonical handler INPUT shape across swarms → Phase 69.
- `pipeline_events` canonical events table → Phase 70.
- Bulk Review override UI for ranked output → Phase 71.
- Sales-email coordinator → Phase 73.
- Cost tracking (Orq `/responses` returns tokens but not cost) — same gap as Phase 64; tracked via `coordinator_runs.budget_run_id`.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORD-01 | Stage 3 emits ordered list of intents with confidence (not single label) | D-12 schema; impl in `invoke-intent.ts` rewrite (replace `intentAgentOutputSchema` with `intentAgentOutputSchemaV2`) — see Implementation Approach §1. |
| CORD-02 | Coordinator escalates to Stage 3.5 on `confidence < threshold OR intent_count >= 3 OR requires_orchestration` | D-09 tri-state gate; implemented as a pure function in coordinator step, reading `swarm_categories.requires_orchestration` via existing `loadSwarmCategories`. See §2. |
| CORD-03 | Orchestrator-worker spawns N parallel Stage 4 handlers + synthesises one iController draft | D-02..D-06 fan-out + RPC fan-in + canonical `HandlerOutput`. See §3-4. |
| CORD-04 | Default ~80% path remains single-shot router with no orchestrator overhead | Single-shot path keeps the existing `debtor-email/<intent>.requested` dispatch via `swarm_categories.swarm_dispatch` registry. No new function call on the fast path. See §2. |

## Standard Stack

### Core (already installed; no new deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `inngest` | as-installed (v3.52+) | Durable functions, fan-out via `step.sendEvent`, retry semantics | `[VERIFIED: web/node_modules/inngest/CHANGELOG.md]` mentions `step.invoke()` since 2024; codebase uses `step.run` + `inngest.send` exclusively (no `step.invoke` calls anywhere — see grep result). Phase 65 follows the `inngest.send` event-emit pattern that already drives `swarm_dispatch`. |
| `@supabase/supabase-js` | as-installed | Service-role writes, RPC, Realtime | `[VERIFIED]` `createAdminClient()` in `web/lib/supabase/admin.ts`. |
| `zod` | as-installed | Client-side LLM output validation (defence-in-depth on top of Orq json_schema) | `[VERIFIED: web/lib/automations/debtor-email/triage/types.ts:84]` |
| Orq.ai (REST `/v2/agents/{key}/responses`) | n/a | LLM transport for all 3 new agents | `[VERIFIED: web/lib/automations/orq-agents/client.ts:133]` |

### Supporting

| Library / Module | Purpose | When to Use |
|------------------|---------|-------------|
| `loadSwarmCategories(admin, swarm_type)` from `web/lib/swarms/registry.ts` | Read `requires_orchestration` flag inside escalation gate | Inside the coordinator step, before deciding single-shot vs orchestrator. 60s cache already in place. |
| `findCachedOutput` / `mergeToolOutputs` / `updateRun` from `web/lib/automations/debtor-email/triage/agent-runs.ts` | Replay-safe idempotency cache, keyed on `(email_id, intent_version)` | Wraps the coordinator LLM call. v2 literal automatically invalidates v1 cache rows. |
| `emitAutomationRunStale(admin, 'debtor-email-review')` from `web/lib/automations/runs/emit.ts` | Bulk Review revalidation | Every status transition on `coordinator_runs` writes one. |
| `invokeOrqAgent(agent_key, inputs)` from `web/lib/automations/orq-agents/client.ts` | Generic LLM invocation by registry key | Used for orchestrator-planner + synthesis. Coordinator stays on the existing `invokeIntentAgent` (faster to evolve in place). |

### Alternatives Considered

| Instead of | Could Use | Why Rejected |
|------------|-----------|--------------|
| Inngest `step.sendEvent` fan-out + RPC fan-in | Inngest `step.invoke` parallel via `Promise.all` | `step.invoke` waits for the child function's return value in-memory; for N handlers each running browser automation (createDraft) totalling 60-120s, this risks Vercel Pro's 60s function timeout per CLAUDE.md (`docs/inngest-patterns.md`). Event emit + RPC counter is the durable pattern the codebase already uses for the cleanup-dispatcher fan-out (`debtor-email-icontroller-cleanup-dispatcher.ts`). `[VERIFIED]` no `step.invoke` calls exist in the repo. |
| Supabase Postgres function (RPC) for fan-in | App-side polling via Inngest `step.sleep` loop | RPC is atomic and durable; polling re-spends LLM tokens on replay and burns Inngest concurrency. RPC pattern matches existing `automation_runs` updates in `classifier-verdict-worker.ts`. |
| Fold orchestrator-planner into coordinator agent | Single mega-prompt | CONTEXT D-03 explicitly rejects; fast-path cost stays low when ranking-only stays small. |

**Installation:** None — all dependencies already in `web/package.json`.

**Version verification:** Skipped (no new packages). Anthropic model IDs verified against `CLAUDE.md` § Anthropic model routing — `anthropic/claude-sonnet-4-5-20250929` and Bedrock EU variant are the verified live IDs as of 2026-05. Mistral fallback `mistral/mistral-large-2411` is the dated pin (NOT `-latest` which doesn't exist in Orq's catalog).

## Architecture Patterns

### System Architecture Diagram (data flow)

```
debtor/email.received  (no change — Phase 65 doesn't touch ingestion)
        │
        ▼
[debtor-email-triage Inngest fn]                  ← rewritten in-place (D-10)
        │
        ▼ step.run("create-coordinator-run")  → INSERT coordinator_runs (expected_handlers=1)
        │
        ▼ step.run("classify-intent-ranked")  → invokeIntentAgent v2 (idempotency: cache_key on intent_version)
        │     ↓ returns ranked: [{intent, confidence, ...}, …]
        │
        ▼ step.run("evaluate-escalation-gate")  → reads swarm_categories.requires_orchestration
        │
        ├── single_shot (~80%) ──→ step.sendEvent "debtor-email/<intent>.requested"
        │                          (lookup via swarm_categories.swarm_dispatch column;
        │                           re-uses classifier-verdict-worker dispatch pattern)
        │                          UPDATE coordinator_runs SET escalation_decision='single_shot', completed_at=now()
        │                          STOP
        │
        └── orchestrator (~20%) ──→ step.sendEvent "debtor-email/orchestrator.requested"
                                    UPDATE coordinator_runs SET escalation_decision='orchestrator',
                                                                escalation_reason=<one of D-09 reasons>

[debtor-email-orchestrator Inngest fn]            ← NEW
        │
        ▼ step.run("plan")                  → invokeOrqAgent('debtor-orchestrator-agent', {email, ranked, context})
        │     ↓ returns {handlers: [{handler_key, intent, context_payload}, …], ordering, notes}
        │
        ▼ step.run("update-expected-count")  → UPDATE coordinator_runs SET expected_handlers=N
        │
        ▼ step.run("fan-out-handlers")       → for each handler: inngest.send("debtor-email/<intent>.requested",
        │                                                          {…, run_id, budget_run_id})
        STOP (waits for handlers via RPC fan-in)

[Stage 4 handlers — existing + new]               ← unchanged shape; one extra terminal call
        │
        ▼ … existing logic (fetch-document, generate-body, create-draft, …)
        │
        ▼ step.run("notify-coordinator-complete")  → rpc('coordinator_complete_handler', { p_run_id })
        │     ↓ Postgres atomically increments completed_handlers; if completed == expected: PERFORM pg_notify or
        │       net.http_post to Inngest event endpoint emitting 'debtor-email/synthesis.requested'
        │     OR (simpler / preferred): RPC just returns the new (completed,expected) pair, and the handler emits
        │       inngest.send('debtor-email/synthesis.requested') itself when completed == expected.
        │     ← planner picks (see Open Questions §2)

[debtor-email-synthesis Inngest fn]               ← NEW
        │
        ▼ step.run("load-handler-outputs")     → SELECT tool_outputs from agent_runs WHERE coordinator_run_id = …
        │
        ▼ step.run("synthesise")               → invokeOrqAgent('synthesis-agent', { handler_outputs: HandlerOutput[] })
        │
        ▼ step.run("create-icontroller-draft") → reuse existing /api/automations/debtor/create-draft route
        │
        ▼ step.run("persist")                  → UPDATE coordinator_runs SET completed_at=now(), partial_synthesis=(failed_handlers>0)
        │                                        emitAutomationRunStale('debtor-email-review')
```

### Recommended Project Structure

```
web/lib/
  agentic-pipeline/
    types.ts                                 # NEW — HandlerOutput interface (D-06)
  inngest/functions/
    debtor-email-triage.ts                   # REWRITTEN in-place (single-shot path + escalation gate)
    debtor-email-orchestrator.ts             # NEW
    debtor-email-synthesis.ts                # NEW
  automations/debtor-email/
    triage/
      invoke-intent.ts                       # MODIFIED — schema → V2; AGENT_KEY unchanged
      types.ts                               # MODIFIED — adds intentAgentOutputSchemaV2 + INTENT_VERSION_V2
                                             #            keeps v1 schema for backfill comparator (Phase 66 deletes v1)
    coordinator/
      escalation-gate.ts                     # NEW — pure function: (ranked, categories) → 'single_shot'|'orchestrator'+reason
      handler-output.ts                      # NEW — adapter: agent_runs.tool_outputs → HandlerOutput[]
supabase/migrations/
  20260501a_coordinator_runs_and_escalation.sql   # NEW — coordinator_runs + RPC + ALTER swarm_categories
  20260501b_orq_agents_v2_and_orchestrator.sql    # NEW — UPDATE debtor-intent-agent v2 + INSERT debtor-orchestrator-agent + INSERT synthesis-agent
```

### Pattern 1: Registry-driven Inngest dispatch (single-shot path)

**Source:** `web/lib/inngest/functions/classifier-verdict-worker.ts:149-176`

```ts
// Phase 65 single-shot path mirrors classifier-verdict-worker exactly.
// `category.swarm_dispatch` carries the canonical event name pre-staged for Phase 66.
const top = ranked[0];
const category = categories.find(c => c.category_key === top.intent);
if (!category?.swarm_dispatch) {
  throw new Error(`no swarm_dispatch registered for intent=${top.intent}`);
}
await step.run("dispatch-single-shot", () =>
  (inngest.send as unknown as (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>)({
    name: category.swarm_dispatch!,                       // e.g. 'debtor-email/copy_document_request.requested'
    data: { run_id, email_id, intent: top.intent, budget_run_id, /* full ranked list for telemetry */ ranked },
  }),
);
```

### Pattern 2: Strict json_schema with anyOf nullable

**Source:** CLAUDE.md § Orq.ai (learning `3970bad9-4c97-4ccf-a2f5-46475313ed1a`); CONTEXT D-12.

```jsonc
"document_reference": { "anyOf": [{"type":"string"}, {"type":"null"}] }    // CORRECT
"document_reference": { "type": ["string", "null"] }                       // WRONG — Orq json_schema validator rejects
```

### Pattern 3: Idempotency via version literal

**Source:** `web/lib/automations/debtor-email/triage/agent-runs.ts:104-124`.

```ts
const cached = await findCachedOutput<IntentAgentOutputV2>(
  supabase, email_id, "intent_version", INTENT_VERSION_V2, "tool_outputs"
);
if (cached?.intent_first_pass) return cached.intent_first_pass;
```

The literal flip from `2026-04-23.v1` → `2026-05-01.v2` is the entire migration — no SQL needed; v1 cache rows simply don't match the new lookup.

### Pattern 4: RPC fan-in (proposed shape)

```sql
CREATE OR REPLACE FUNCTION public.coordinator_complete_handler(
  p_run_id        uuid,
  p_failed        boolean DEFAULT false
)
RETURNS TABLE(completed_handlers int, expected_handlers int, all_done boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_row public.coordinator_runs%ROWTYPE;
BEGIN
  UPDATE public.coordinator_runs
     SET completed_handlers = completed_handlers + 1,
         failed_handlers    = failed_handlers + CASE WHEN p_failed THEN 1 ELSE 0 END
   WHERE run_id = p_run_id
   RETURNING * INTO v_row;

  RETURN QUERY
    SELECT v_row.completed_handlers,
           v_row.expected_handlers,
           v_row.completed_handlers >= v_row.expected_handlers;
END;
$$;
```

The Inngest handler then conditionally emits `debtor-email/synthesis.requested` when `all_done = true`. RPC stays simple (no Postgres-side HTTP); event emission stays in app code where Inngest concurrency control + replay safety apply. This matches the codebase's "Postgres for atomic state, Inngest for orchestration" split.

### Anti-Patterns to Avoid

- **`step.invoke` for fan-out:** ties the orchestrator to N handler completions in-memory; Vercel Pro 60s timeout will trip. Use `inngest.send` + RPC counter.
- **Mistral fallback `mistral-large-latest`:** doesn't exist in Orq's catalog. Use `mistral/mistral-large-2411`.
- **Array-shorthand nullable in strict json_schema:** Orq rejects. Use `anyOf`.
- **Non-versioned cache_key:** v1 cached results bleed through. Embed version literal in lookup (already the established pattern).
- **`create_agent` then expect `response_format` to persist:** drops silently. Always create-then-PATCH (CLAUDE.md learning `cba7352b`).
- **Skipping `list_models` pre-flight:** PATCH accepts unknown IDs without error and `get_agent` echoes them back, but Studio renders the dropdown blank (CLAUDE.md learning `f980a2a1`).
- **Cron string in JSDoc comment:** `*/N` closes the `/** */` comment (CLAUDE.md). Phase 65 has no cron, but synthesis fan-in note may inadvertently include one — reviewers watch for it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fan-in across N parallel children | App-side `step.sleep` polling loop | RPC counter (D-04 pattern above) | Atomic; durable; no cost amplification on replay. |
| LLM JSON output enforcement | Prompt-only "return JSON" | Orq Studio JSON Schema tool resource referenced from `model.parameters.response_format` | Prompt-only fails 15-20% per CLAUDE.md. |
| Tool intent allowlist | Per-handler `if (intent !== ...)` checks | `nxt-zap-client.ts` already enforces via `allowed_for_intents` (Phase 64) | Default-deny semantics; one source of truth. |
| iController draft creation | New Browserless script for the synthesis path | Reuse `/api/automations/debtor/create-draft` route (currently called from `debtor-email-triage.ts:319-336`) | Already handles login retry, screenshot archival, breaker. |
| Bulk Review revalidation | Manual SSR re-fetch | `emitAutomationRunStale(admin, 'debtor-email-review')` | Single canonical hook; already fan-out to subscribers. |
| Anthropic model ID lookup | Hardcoded strings | `list_models` MCP call before any agent create/update | Catalog IDs change; the wrong ID PATCHes silently and breaks Studio. |

**Key insight:** Phase 65 is **plumbing on top of existing primitives**. Every load-bearing primitive (event dispatch, allowlist enforcement, registry caching, idempotency cache, Bulk Review hook, RPC pattern) already ships. The risk surface is in the **glue logic** (escalation gate purity, RPC race conditions, partial-synthesis output schema), not in any single component.

## Runtime State Inventory

> Phase 65 is partially a refactor (`debtor-email-triage` rewritten in place; existing agent's version literal flipped). Inventory required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `agent_runs` rows with `intent_version='2026-04-23.v1'` and `tool_outputs.intent_first_pass` matching v1 schema. | **No migration.** v1 cache rows are naturally invalidated by the lookup keying on `intent_version='2026-05-01.v2'`. Existing rows stay queryable for analytics; Phase 66 cleanup or Phase 70 telemetry consolidation may purge later. |
| Live service config | Orq.ai `debtor-intent-agent` row in Studio (output_schema, model_config, response_format). Currently primary=`anthropic/claude-haiku-4-5-20251001`, fallbacks include the *non-existent* `anthropic/claude-sonnet-4-6` and `mistral/mistral-large-latest`. | **PATCH via Orq MCP** (after `list_models` pre-flight). Update output_schema + model_config + response_format. Studio JSON Schema tool resource must be created **manually** in Studio first (Orq MCP exposes no tool CRUD per CLAUDE.md). |
| Live service config (NEW) | `debtor-orchestrator-agent` and `synthesis-agent` Studio rows do not exist. | **CREATE via MCP** (after `list_models` pre-flight) → PATCH to attach `response_format` (D-13: `create_agent` drops it). JSON Schema tool resource for each must be created in Studio first. |
| OS-registered state | None. Phase 65 introduces no Task Scheduler / launchd / pm2 entries. | None — verified by grep over CLAUDE.md OS-state list. |
| Secrets / env vars | `ORQ_API_KEY` already used by `invokeOrqAgent`; `AUTOMATION_WEBHOOK_SECRET` already used by `/api/automations/debtor/create-draft`. No new secrets. | None — code rename only, no key rotation. |
| Build artifacts / installed packages | None. No new npm packages. | None. |
| Inngest function registry | `debtor-email-triage` ID stays. Two **new** function IDs: `automations/debtor-email-orchestrator`, `automations/debtor-email-synthesis`. | Add the new functions to the Inngest serve handler at `web/app/api/inngest/route.ts` (verify path — likely already a serve registration list). |
| Supabase migrations | `swarm_categories` schema needs `requires_orchestration boolean DEFAULT false` (D-08); `coordinator_runs` table is new (D-11); RPC `coordinator_complete_handler` is new (D-04). | Two new migration files (a + b naming follows `20260429b/g` precedent). |
| Existing `swarm_categories` rows | 7 rows (debtor-email): `payment`, `payment_admittance`, `auto_reply`, `ooo_temporary`, `ooo_permanent`, `invoice_copy_request`, `unknown`. None of these correspond to the **8-intent vocabulary** D-12 references (`copy_document_request`, `payment_dispute`, `address_change`, `peppol_request`, `credit_request`, `contract_inquiry`, `general_inquiry`, `other`). | **Open question** — see Open Questions §1: `swarm_categories.category_key` and `INTENT` enum are NOT the same vocabulary today. Phase 65 must reconcile. Likely answer: seed 8 new `swarm_categories` rows for the intent vocabulary with `swarm_dispatch='debtor-email/<intent>.requested'`. |

**The canonical question:** *After every code file lands, what runtime state still has the old shape?* Answer: only the Orq Studio rows for the three agents — and those are the explicit work in Plan 02 (Studio + MCP). Everything else (cache, migrations, registry seeds) is owned by the new migrations.

## Common Pitfalls

### Pitfall 1: Vocabulary mismatch between `INTENT` enum and `swarm_categories.category_key`

**What goes wrong:** `INTENT` (in `triage/types.ts`) is `[copy_document_request, payment_dispute, …]`. `swarm_categories.category_key` for `debtor-email` is `[payment, payment_admittance, auto_reply, …, invoice_copy_request, unknown]`. The single-shot dispatch pattern (Pattern 1) looks up `category.swarm_dispatch` by `top.intent` — but the keys won't match.

**Why it happens:** `swarm_categories` was seeded for the *Stage 1 regex classifier* output (broad noise buckets), not for the *Stage 3 intent vocabulary*. Phase 65 conflates the two.

**How to avoid:** The migration in Plan 01 must seed the 8 intent rows in `swarm_categories` (or a sibling table) with their canonical event names in `swarm_dispatch`. Example:

```sql
INSERT INTO public.swarm_categories (swarm_type, category_key, display_label, action, swarm_dispatch, requires_orchestration, display_order)
VALUES
  ('debtor-email', 'copy_document_request', 'Copy document request', 'swarm_dispatch', 'debtor-email/copy_document_request.requested', false, 100),
  ('debtor-email', 'payment_dispute',       'Payment dispute',       'swarm_dispatch', 'debtor-email/payment_dispute.requested',       true,  110),
  ('debtor-email', 'address_change',        'Address change',        'swarm_dispatch', 'debtor-email/address_change.requested',        false, 120),
  -- ...
ON CONFLICT (swarm_type, category_key) DO UPDATE SET ...;
```

Note: `payment_dispute` and `address_change` are good candidates for `requires_orchestration=true` because they often co-occur with copy-document asks in the same email — concrete cases the orchestrator was designed for.

**Warning signs:** Single-shot dispatch logs `no swarm_dispatch registered for intent=copy_document_request` on every fast-path email.

### Pitfall 2: RPC race condition on the last-handler completion

**What goes wrong:** Two handlers finish at the exact same instant; both observe `completed_handlers + 1 == expected_handlers`; both emit `debtor-email/synthesis.requested`; synthesis runs twice; iController gets two drafts.

**How to avoid:** The RPC must atomically check-and-mark. Add a `synthesis_dispatched_at timestamptz` column to `coordinator_runs`; the RPC sets it via `UPDATE … SET synthesis_dispatched_at = now() WHERE synthesis_dispatched_at IS NULL AND completed_handlers >= expected_handlers RETURNING …`. The handler only emits the synthesis event when the returned row shows the dispatch was claimed by *this* RPC call. Postgres single-row UPDATE is atomic; the second handler's RPC returns NULL and emits nothing.

**Warning signs:** Two `debtor-email/synthesis.requested` events for the same `run_id` in Inngest dev-server logs; duplicate `coordinator_runs.completed_at` writes.

### Pitfall 3: Idempotency cache key shape on the orchestrator path

**What goes wrong:** Fan-out child handlers replay; each one re-invokes its Stage 4 LLM. The existing `findCachedOutput` keys on `(email_id, intent_version)` — but in the orchestrator path there are *N intents per email_id*, all with the same `intent_version`. The cache returns the wrong row.

**How to avoid:** Either (a) extend the cache key to `(email_id, intent_version, intent)` for handler agent runs, or (b) rely on Inngest step memoization within the handler invocation (which is per-event-id, not per-email-id, so it's already step-scoped). Option (b) is cleaner and matches the comment already in `debtor-email-triage.ts:251` ("Inngest's own step memoization already handles replay-safety within a function invocation").

### Pitfall 4: `intent_version` literal drift between coordinator output and persisted row

**What goes wrong:** Coordinator agent emits `intent_version: '2026-05-01.v2'`; code constants in `types.ts` still say `'2026-04-23.v1'`. The zod validator rejects the agent output with "literal mismatch".

**How to avoid:** Add `INTENT_VERSION_V2 = '2026-05-01.v2' as const` to `triage/types.ts`. Coordinator agent's `output_schema.intent_version.const` MUST equal this literal exactly. Plan 01 task: codify both sides; Plan 02 task: PATCH the agent's output_schema with the same literal.

### Pitfall 5: Partial synthesis footer hides handler-level cost in budget accounting

**What goes wrong:** Two handlers fail before the LLM call; one succeeds. `coordinator_runs.failed_handlers=2, completed_handlers=1`. Budget counter only sees the successful handler's cost — but the failed ones still consumed Stage 0 + coordinator + planner cost. The breach event fires late or not at all.

**How to avoid:** Increment `coordinator_runs.cost_cents_total` (add column) and `tokens_total` *before* every Stage 4 LLM call (inside the handler's `step.run("budget-pre-check")`), not after. Breach check happens at increment time. This mirrors `web/lib/stage-0/budget-counter.ts:check()` shape — just persisted to Postgres instead of in-memory.

### Pitfall 6: Synthesis agent prompt sees PII across handler outputs

**What goes wrong:** `address_change` handler returns the new address; `copy_document_request` handler returns the invoice PDF metadata. Synthesis prompt concatenates everything. No injection-safe boundary between handler outputs.

**How to avoid:** Synthesis input is the structured `HandlerOutput[]` array (D-06), passed as JSON to the agent — NOT free-text concatenation. The agent's system prompt explicitly handles each entry as data. This is already the pattern; flag for verification in plan-checker.

## Code Examples

### Coordinator V2 schema (types.ts addition)

```typescript
// Source: CONTEXT.md D-12 + existing triage/types.ts pattern
export const INTENT_VERSION_V2 = "2026-05-01.v2" as const;

export const rankedIntentEntrySchema = z.object({
  intent: z.enum(INTENT),
  confidence: z.enum(CONFIDENCE),
  document_reference: z.string().max(64).nullable(),
  sub_type: z.enum(SUB_TYPE).nullable(),
  reasoning: z.string().max(200),
});

export const intentAgentOutputSchemaV2 = z.object({
  ranked: z.array(rankedIntentEntrySchema).min(1),
  language: z.enum(LANGUAGE),
  urgency: z.enum(URGENCY),
  intent_version: z.literal(INTENT_VERSION_V2),
});

export type IntentAgentOutputV2 = z.infer<typeof intentAgentOutputSchemaV2>;
```

### Escalation gate (pure function)

```typescript
// Source: CONTEXT D-09
import type { IntentAgentOutputV2 } from "../triage/types";
import type { SwarmCategoryRow } from "@/lib/swarms/types";

export type EscalationDecision =
  | { kind: "single_shot" }
  | { kind: "orchestrator"; reason: "low_confidence" | "high_intent_count" | "requires_orchestration_flag" };

export function evaluateEscalationGate(
  output: IntentAgentOutputV2,
  categories: SwarmCategoryRow[],
): EscalationDecision {
  if (output.ranked[0].confidence === "low") {
    return { kind: "orchestrator", reason: "low_confidence" };
  }
  if (output.ranked.length >= 3) {
    return { kind: "orchestrator", reason: "high_intent_count" };
  }
  const flagged = output.ranked.some(r =>
    categories.find(c => c.category_key === r.intent)?.requires_orchestration === true
  );
  if (flagged) return { kind: "orchestrator", reason: "requires_orchestration_flag" };
  return { kind: "single_shot" };
}
```

### `HandlerOutput` canonical shape (D-06)

```typescript
// web/lib/agentic-pipeline/types.ts — NEW file this phase
export interface HandlerOutput {
  handler_key: string;
  intent: string;
  content_kind: "draft_body" | "action_confirmation" | "data_payload";
  content: string;
  language: "nl" | "fr" | "en" | "de";
  tone: "neutral" | "de-escalation";
  references: string[];
  confidence: "low" | "medium" | "high";
}
```

## State of the Art

| Old Approach (today) | Phase 65 Approach | Impact |
|----------------------|-------------------|--------|
| Single-label `intent` field on coordinator output | Ranked `[{intent, confidence, …}, …]` array | Phase 71 can score the full ranking, not just top-1; secondary intents no longer silently dropped. |
| Hybrid Haiku→Sonnet escalation on `confidence==='low' OR language==='fr'` | Single Sonnet call with ranked output (D-01); separate orchestrator-planner Sonnet call only on D-09 escalation | French-language escalation collapses into the same path as low-confidence. Cost ~2× per coordinator call but no 2nd Haiku call on the fast path. |
| Hardcoded if-else dispatch on intent | `swarm_categories.swarm_dispatch` registry-driven dispatch (already the pattern in Phase 56.7) | New intents = INSERT row, zero code change. Phase 66's rename is then trivial. |
| Cache_key keyed on `intent_version='2026-04-23.v1'` | Cache_key keyed on `intent_version='2026-05-01.v2'` | v1 cache invalidates naturally; no migration code. |

**Deprecated:**
- `anthropic/claude-sonnet-4-6` model ID in current `debtor-intent-agent.model_config.fallbacks` — does NOT exist in Orq's catalog (CLAUDE.md). Replace with `aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0`.
- `mistral/mistral-large-latest` in current fallbacks — does NOT exist. Replace with `mistral/mistral-large-2411`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (per `web/vitest.config.ts`) |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run <pattern>` |
| Full suite command | `cd web && npx vitest run` |

Existing test patterns to mirror:
- `web/lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts` — mock-step strategy: import the worker, mock all I/O modules (`@/lib/supabase/admin`, `@/lib/inngest/client`, agent invocations), call `worker.handler({ event, step })` directly with synthetic args.
- `web/lib/stage-0/__tests__/budget-counter.test.ts` — pure-module unit tests.
- `web/lib/automations/debtor-email/triage/__tests__/` — direct module unit tests for `invoke-intent`, `agent-runs`, `circuit-breaker`.

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|--------------|
| CORD-01 | `intentAgentOutputSchemaV2` accepts ranked array, rejects single-label v1 shape | unit | `npx vitest run web/lib/automations/debtor-email/triage/__tests__/types-v2.test.ts` | ❌ Wave 0 |
| CORD-01 | `invokeIntentAgent` returns `IntentAgentOutputV2` parsed from `/responses` body; v1 shape rejected with informative error | unit | `npx vitest run web/lib/automations/debtor-email/triage/__tests__/invoke-intent-v2.test.ts` | ❌ Wave 0 |
| CORD-02 | Pure escalation gate: low confidence → escalate; ≥3 ranked → escalate; flagged intent → escalate; else single-shot | unit | `npx vitest run web/lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts` | ❌ Wave 0 |
| CORD-02 | Coordinator function: `swarm_categories.requires_orchestration=true` row triggers `escalation_decision='orchestrator'` and `escalation_reason='requires_orchestration_flag'` | integration (mock-step) | `npx vitest run web/lib/inngest/functions/__tests__/debtor-email-triage.test.ts` | ❌ Wave 0 |
| CORD-03 | Orchestrator-planner emits N `inngest.send` calls matching planner output `handlers[]` length; updates `coordinator_runs.expected_handlers=N` first | integration (mock-step) | `npx vitest run web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts` | ❌ Wave 0 |
| CORD-03 | RPC fan-in: when `completed_handlers == expected_handlers`, exactly one `debtor-email/synthesis.requested` is emitted (race-condition test) | unit (Postgres-mock) + integration | `npx vitest run web/lib/automations/debtor-email/coordinator/__tests__/rpc-fanin.test.ts` | ❌ Wave 0 |
| CORD-03 | Synthesis function: builds `HandlerOutput[]` from `agent_runs` rows, calls `synthesis-agent`, writes one iController draft, sets `partial_synthesis=(failed_handlers>0)` | integration (mock-step) | `npx vitest run web/lib/inngest/functions/__tests__/debtor-email-synthesis.test.ts` | ❌ Wave 0 |
| CORD-04 | Single-shot path: `escalation_decision='single_shot'` emits exactly one `debtor-email/<intent>.requested` event with the top-ranked intent; orchestrator-planner is NOT invoked | integration (mock-step) | covered by `debtor-email-triage.test.ts` above (separate `it()` block) | ❌ Wave 0 |
| CORD-04 | Idempotency cache: replay of the same email_id returns cached `intent_first_pass` from `agent_runs.tool_outputs`, no second Orq call | unit | `npx vitest run web/lib/automations/debtor-email/triage/__tests__/idempotency-cache-v2.test.ts` | ❌ Wave 0 |
| CORD-04 | Cache invalidation: an `agent_runs` row with `intent_version='2026-04-23.v1'` does NOT match the V2 lookup; new Orq call fires | unit | covered by idempotency test above | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd web && npx vitest run web/lib/automations/debtor-email/coordinator web/lib/automations/debtor-email/triage web/lib/inngest/functions/__tests__/debtor-email-{triage,orchestrator,synthesis}.test.ts`
- **Per wave merge:** `cd web && npx vitest run`
- **Phase gate:** Full suite green + manual end-to-end via dev-server: emit a synthetic `debtor/email.received` for (a) a single-intent email (CORD-04), (b) a 3-intent email (CORD-03 escalation via count), (c) a low-confidence email (CORD-02 low-confidence).

### Wave 0 Gaps

- [ ] `web/lib/automations/debtor-email/triage/__tests__/types-v2.test.ts` — V2 schema accept/reject (CORD-01).
- [ ] `web/lib/automations/debtor-email/triage/__tests__/invoke-intent-v2.test.ts` — transport returns V2 (CORD-01).
- [ ] `web/lib/automations/debtor-email/triage/__tests__/idempotency-cache-v2.test.ts` — cache invalidation on version flip (CORD-04).
- [ ] `web/lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts` — pure escalation gate (CORD-02).
- [ ] `web/lib/automations/debtor-email/coordinator/__tests__/rpc-fanin.test.ts` — RPC race-safety (CORD-03).
- [ ] `web/lib/inngest/functions/__tests__/debtor-email-triage.test.ts` — coordinator function (CORD-02, CORD-04).
- [ ] `web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts` — orchestrator + fan-out (CORD-03).
- [ ] `web/lib/inngest/functions/__tests__/debtor-email-synthesis.test.ts` — synthesis + draft (CORD-03).
- [ ] No new framework install needed — Vitest already in `web/package.json`.

### Observability (Dimension 4)

Per CONTEXT D-11, every meaningful state transition writes to `coordinator_runs`. The Bulk Review surface (existing) joins this row. Specific signals to expose for ops:

- `coordinator_runs.escalation_decision` distribution per day → confirms ~80/20 split (CORD-04 success criterion).
- `coordinator_runs.partial_synthesis = true` count → handler-failure rate.
- `coordinator_runs.failed_handlers / coordinator_runs.expected_handlers` ratio per intent → which handlers fail most under fan-out.
- `pipeline/budget_breached` event volume scoped by `coordinator_runs.budget_run_id` → escalation paths breaching ceilings.

These ride on existing `automation_runs` view shape; no new dashboard work in Phase 65.

## Security Domain

> `security_enforcement` is implicit; this swarm processes externally-sourced email.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Service-role Supabase client (`createAdminClient`); `AUTOMATION_WEBHOOK_SECRET` for create-draft route. |
| V3 Session Management | no | Server-to-server only. |
| V4 Access Control | yes | `zapier_tools.allowed_for_intents` enforces handler-to-tool authorisation (Phase 64 BUDG-02). Orchestrator-spawned handlers go through the same `nxt-zap-client.ts` gate. |
| V5 Input Validation | yes | zod on every LLM output (`intentAgentOutputSchemaV2`, `bodyAgentOutputSchema`); Orq Studio JSON Schema as defence-in-depth. |
| V6 Cryptography | no | No new crypto. |
| V13 API | yes | Orq.ai called via Bearer token in env var (`ORQ_API_KEY`); never client-side. |

### Known Threat Patterns for {Inngest + Orq + Supabase RPC}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt-injection in email body reaching synthesis prompt | Tampering | Stage 0 (Phase 64) already screens; synthesis sees structured `HandlerOutput[]`, not raw email body. |
| RPC race emits duplicate synthesis events → duplicate iController drafts | Repudiation / data integrity | Atomic UPDATE with `synthesis_dispatched_at IS NULL` guard (Pitfall 2). |
| Orchestrator passes one intent's tool-allowlist to a handler that should not have it | EoP | Per-handler intent identity is the handler's own input data (`intent` field); `nxt-zap-client.ts` reads the intent from the handler's call site, not from the orchestrator's plan. Orchestrator can't "promote" a tool. |
| Replay attack on `coordinator_complete_handler` RPC | Tampering | Pitfall 5 idempotent claim via `synthesis_dispatched_at`. Plus Inngest step memoization within the same event invocation. |
| Cost amplification on Inngest auto-retry | Resource exhaustion | All three new functions register `retries: 0` (matches `classifier-verdict-worker`, `classifier-label-resolver`, `stage-0-safety-worker`, `budget-breach-handler` pattern). Recovery path = operator Retry button. |

## Project Constraints (from CLAUDE.md)

- **Stack lock:** Vercel · Supabase · Inngest · Orq.ai · `playwright-core` (existing iController drafter only — Phase 65 doesn't add browser code). NEVER direct Anthropic/OpenAI SDK; LLM via Orq.
- **Anthropic model IDs:** `anthropic/claude-sonnet-4-5-20250929` (primary) and `aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0` (Bedrock EU fallback) are the verified live IDs. `anthropic/claude-sonnet-4-6` does NOT exist; `claude-3-5-haiku` and `claude-sonnet-4-5` (no date) also do NOT exist. `mistral/mistral-large-2411` is the dated pin; `-latest` does NOT exist.
- **Orq workflow (mandatory):** `list_models` pre-flight → `create_agent` → PATCH with `model.parameters.response_format` → `get_agent` verify. Skipping any step has a documented failure mode in CLAUDE.md learnings.
- **JSON Schema tool resources:** Created in Studio (Orq MCP exposes no tool CRUD). Then PATCH the agent so `model.parameters.response_format` references the tool by name.
- **Strict json_schema nullable:** Use `anyOf`, NEVER `["string","null"]` array shorthand. Applies to all three new agent rows + the codified `output_schema` JSONB.
- **Supabase JSONB double-encoding:** `while (typeof state === 'string') state = JSON.parse(state)` when reading `tool_outputs`. Already handled in `agent-runs.ts`; new readers must follow the same pattern.
- **Inngest cron in JSDoc:** Phase 65 has no cron, but never put one in `/** */` — `*/N` closes the comment.
- **Test-first / acceptance-by-default credentials:** N/A for Phase 65 (no NXT/iController writes from new code; reuses existing draft route which already has env-banner gating).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `swarm_categories.category_key` vocabulary needs to be extended to include the 8 `INTENT` enum values (`copy_document_request`, etc.). | Pitfall 1, Runtime State Inventory | If wrong: single-shot dispatch silently fails to route; planner needs alternative seam (e.g., separate `swarm_intents` table earlier than Phase 68). |
| A2 | The existing `/api/automations/debtor/create-draft` route is suitable for the synthesis path with no modifications. | Architecture diagram | If wrong: a new helper or route variant is needed — adds one task to Plan 04. |
| A3 | Inngest `inngest.send` (not `step.invoke`) is the right fan-out primitive given Vercel Pro 60s timeout. | Stack alternatives table | If wrong (e.g., handlers actually return in <30s): `step.invoke` would be simpler, no RPC needed. **VERIFY**: measure existing `classifier-invoice-copy-handler` p95 before locking. |
| A4 | The proposed RPC signature `coordinator_complete_handler(p_run_id, p_failed) RETURNS (completed, expected, all_done)` is fit for Postgres + supabase-js's `.rpc()` shape. | Pattern 4 | If wrong: tweak signature; no architectural impact. |
| A5 | The new `coordinator_runs.cost_cents_total` and `tokens_total` columns (Pitfall 5 mitigation) belong in Phase 65 rather than Phase 70 telemetry. | Pitfall 5 | If wrong: cost-amplification breach risk on partial-synthesis; planner can defer if Phase 64 budget enforcement covers fan-out children directly. |
| A6 | The Orq Studio JSON Schema tool resource for the v2 coordinator can be created manually in Studio before Plan 02 runs (since MCP exposes no CRUD). | Pattern 2, Runtime State | If wrong (e.g., tool resource API gets exposed): can be automated in Plan 02. Net positive. |
| A7 | The 8-intent vocabulary in D-12 is the authoritative list and matches `INTENT` in `triage/types.ts`. | Code Examples, types-v2 schema | If wrong: schema literal mismatch; trivial fix. |

**[ASSUMED]** A1 is the highest-impact unknown — it determines whether Plan 01 is "ALTER one column + INSERT 8 rows" or "create a new table". The Open Questions section flags this for the planner.

## Open Questions

1. **`swarm_categories.category_key` vs `INTENT` enum reconciliation.**
   - What we know: today's 7 `swarm_categories` rows are Stage 1 noise buckets, not Stage 3 intents. The 8 intents in `INTENT` enum (`copy_document_request`, `payment_dispute`, etc.) are not present as `swarm_categories.category_key` values (only `invoice_copy_request` ≈ `copy_document_request` is similar — and the rename is itself a Phase 66 concern).
   - What's unclear: Should Phase 65 (a) seed 8 new rows into `swarm_categories` with `swarm_dispatch='debtor-email/<intent>.requested'` and accept that `swarm_categories` now mixes Stage 1 buckets + Stage 3 intents, or (b) use a different table/column for intent-→event routing in Phase 65 and let Phase 68 (`swarm_intents`) clean up?
   - Recommendation: **Option (a)** — minimises new surface area; the column `swarm_categories.requires_orchestration` (D-08) already commits Phase 65 to using this table for intent-level metadata. Mixed semantics is a Phase 68 cleanup concern, not a Phase 65 blocker. Confirm with planner.

2. **RPC emits the synthesis event, or the handler does?**
   - What we know: Postgres can emit HTTP via `pg_net.http_post`, or the app emits after observing `all_done=true` from the RPC return. CONTEXT D-04 says "the RPC emits `debtor-email/synthesis.requested`" — but the codebase has no precedent for `pg_net.http_post`-driven Inngest emits.
   - Recommendation: **App-side emit** based on RPC return value (`all_done=true`), gated by the `synthesis_dispatched_at IS NULL` claim pattern (Pitfall 2). Keeps the boundary clean: Postgres for state, app for orchestration. CONTEXT wording is loose enough to permit this read.

3. **Concurrency policy for fan-out children.**
   - Today's `debtor-email-triage` is `concurrency: [{ key: "event.data.entity", limit: 2 }]`. With orchestrator fan-out, we may have 3 handlers × 5 entities × N concurrent emails = handler concurrency unbounded.
   - Recommendation: **`concurrency: [{ key: "event.data.entity", limit: 4 }, { key: "event.data.run_id", limit: 1 }]`** on each Stage 4 handler — one execution per (run_id, intent) at a time, max 4 concurrent per entity. Planner verifies against current Browserless/iController capacity.

4. **`coordinator_runs.cost_cents_total` column scope.**
   - Belongs in Phase 65 (this research's Pitfall 5) or Phase 70 (telemetry consolidation)? Phase 64 enforces ceilings on Stage 0 only; Phase 65 inherits that pattern but extends to fan-out. Without the column, fan-out budget breach can fire late.
   - Recommendation: include in Phase 65 migration; simple `int4` columns. Phase 70 can backfill into `pipeline_events`.

5. **Backfill / regression strategy size.**
   - CONTEXT Claude's Discretion mentions running new coordinator over last N production emails. Volume hint from `agent_runs` table volume — planner should query `SELECT count(*) FROM public.agent_runs WHERE swarm_type='debtor-email' AND created_at > now() - interval '14 days'` to size N. Likely 100-500 emails is enough for a sanity-check vs v1 single-label.

6. **Top-K cap on `ranked` array.**
   - D-12 says `minItems: 1` but no `maxItems`. Should we cap at e.g. 5 to bound prompt sizes downstream? Cheap defence-in-depth.
   - Recommendation: `maxItems: 5` in the json_schema. Planner picks; trivial to add.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Inngest dev server (local) | Coordinator + orchestrator + synthesis function tests | ✓ (existing project setup) | n/a | n/a |
| Orq.ai API access | All three new agents | ✓ (`ORQ_API_KEY`) | n/a | n/a |
| Orq.ai MCP (for `list_models` + `update_agent` + `create_agent`) | Plan 02 agent setup | ✓ (used in Phases 56, 64) | n/a | Manual REST calls if MCP unavailable; Studio for JSON Schema tool resources is mandatory regardless. |
| Anthropic Sonnet 4.5 model in Orq catalog | Coordinator + orchestrator + synthesis primary model | ✓ (`anthropic/claude-sonnet-4-5-20250929`) per CLAUDE.md | 2025-09-29 dated pin | Bedrock EU variant `aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0` configured as fallback. |
| Supabase Postgres function support | RPC `coordinator_complete_handler` | ✓ (already used for trigger functions) | n/a | n/a |
| Vitest | All Wave 0 tests | ✓ | per `web/package.json` | n/a |

**No missing dependencies. No fallbacks required.**

## Sources

### Primary (HIGH confidence, VERIFIED in repo this session)

- `web/lib/automations/debtor-email/triage/invoke-intent.ts` — Orq `/responses` transport, key-sorted JSON, AbortSignal timeout pattern.
- `web/lib/automations/debtor-email/triage/types.ts` — `INTENT` (8-value enum), `INTENT_VERSION`, existing zod schemas.
- `web/lib/automations/debtor-email/triage/agent-runs.ts` — `findCachedOutput` keyed on `(email_id, version_field, version_value)`; `mergeToolOutputs` JSONB merge.
- `web/lib/inngest/functions/debtor-email-triage.ts` — current coordinator function (the rewrite target). Notable: `concurrency: [{ key: "event.data.entity", limit: 2 }]`; cache+invoke pattern in step `classify-intent`.
- `web/lib/inngest/functions/classifier-verdict-worker.ts:149-176` — `swarm_dispatch` registry-driven event emit (the prototype Phase 65 reuses).
- `web/lib/inngest/functions/classifier-label-resolver.ts` — parallel `Promise.all` of `step.run` calls; `retries: 0` + Bulk Review retry button pattern.
- `web/lib/inngest/functions/stage-0-safety-worker.ts` + `web/lib/inngest/functions/budget-breach-handler.ts` — Phase 64 patterns Phase 65 builds on (registers retries:0, emits `pipeline/budget_breached`).
- `web/lib/automations/orq-agents/client.ts` — `invokeOrqAgent(agent_key, inputs)` generic transport; cost_cents=0 caveat documented in header.
- `web/lib/automations/debtor-email/nxt-zap-client.ts:48-54` — `ToolNotAllowedForIntentError` enforcement pattern.
- `web/lib/swarms/registry.ts` — `loadSwarmCategories` with 60s in-memory TTL.
- `supabase/migrations/20260429b_swarm_registry.sql` — `swarm_categories` schema; existing 7 rows for debtor-email; the table D-08 alters.
- `supabase/migrations/20260429g_orq_agents_registry.sql` — current `debtor-intent-agent` row; D-01 PATCH target.
- `supabase/migrations/20260430e_stage_0_safety_and_allowlist.sql` — Phase 64 `allowed_for_intents` allowlist.
- `web/lib/inngest/events.ts` — current event taxonomy (the file Phase 65 adds 3 events to).
- `web/lib/stage-0/budget-counter.ts` — pure-module budget check shape.
- `.planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-CONTEXT.md` — locked decisions.
- `.planning/REQUIREMENTS.md` — CORD-01..04 verification truths.
- `.planning/phases/64-stage-0-input-safety-per-run-budgets/64-CONTEXT.md` — D-13/14/15 budget primitives.
- `docs/agentic-pipeline/stage-3-coordinator.md`, `stage-4-handler.md`, `context-shape-contract.md` — RFC contracts.
- `CLAUDE.md` § Orq.ai (model routing, list_models pre-flight, create-then-PATCH, anyOf nullable, JSON Schema tool resource via Studio); § Inngest (cron-in-JSDoc pitfall).

### Secondary (MEDIUM confidence)

- Inngest `step.invoke` semantics — verified via `node_modules/inngest/CHANGELOG.md`; not used elsewhere in repo, so confidence in fan-out approach choice is informed by absence rather than positive precedent.

### Tertiary (none)

No WebSearch was performed — the codebase + CONTEXT + CLAUDE.md fully constrain the implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all primitives already in repo; verified file by file.
- Architecture: HIGH on shape, MEDIUM on RPC vs `pg_net.http_post` decision (planner picks per Open Question 2).
- Pitfalls: HIGH — derived from actual code-paths (cache_key shape, RPC race, vocabulary mismatch).
- Validation Architecture: HIGH — mirrors existing Vitest patterns in `__tests__/stage-0-safety-worker.test.ts`.

**Research date:** 2026-05-01
**Valid until:** 2026-06-01 (30 days; stable foundation, model IDs may shift sooner — re-verify `list_models` immediately before Plan 02 execution).

## RESEARCH COMPLETE

**Phase:** 65 — stage-3-ranked-multi-intent-coordinator
**Confidence:** HIGH on integration shapes; MEDIUM on a few planner-discretion items (RPC name, concurrency keys, ranked-array maxItems, vocabulary reconciliation).

### Key Findings

- Phase 65 is **plumbing on top of existing primitives** — no new dependencies, no new infrastructure. Every load-bearing piece (`invokeOrqAgent`, `findCachedOutput`, `loadSwarmCategories`, `swarm_dispatch` registry, `nxt-zap-client` allowlist, `emitAutomationRunStale`, `retries: 0` recovery pattern, JSONB `tool_outputs` merge) already ships.
- The biggest *non-obvious* landmine is **vocabulary mismatch**: today's 7 `swarm_categories` rows are Stage 1 noise buckets; the 8-value `INTENT` enum is a different vocabulary. Plan 01's migration must seed intent rows into `swarm_categories` with `swarm_dispatch='debtor-email/<intent>.requested'` (Open Question 1). Without this, single-shot dispatch silently fails.
- **RPC race-safety** requires a `synthesis_dispatched_at IS NULL` claim guard in addition to the counter increment (Pitfall 2). Naive `completed >= expected` check duplicates synthesis on simultaneous handler completion.
- **`step.invoke` is the wrong primitive** for fan-out: 60s Vercel timeout makes durable event-emit + RPC counter the safer choice. No `step.invoke` calls exist anywhere in the codebase — this is the established convention.
- **Orq agent setup is a 5-step ritual per agent** (CLAUDE.md): `list_models` → Studio JSON Schema tool resource → `create_agent` (or PATCH for existing) → PATCH with `model.parameters.response_format` → `get_agent` verify. Skipping any step has a documented failure mode. Plan 02 must execute this for all three agents.
- The **idempotency cache invalidates "for free"** when `INTENT_VERSION_V2='2026-05-01.v2'` literal flips. No SQL migration; v1 rows simply don't match new lookups.
- **5-plan structure recommended:** (1) DB migration + types codification, (2) Orq Studio + MCP agent setup, (3) coordinator rewrite (CORD-01, CORD-02, CORD-04), (4) orchestrator + synthesis workers + RPC fan-in (CORD-03), (5) regression backfill + Bulk Review badge.

### File Created

`.planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | All deps installed; transport + RPC + registry patterns verified in repo. |
| Architecture | HIGH | Fan-out shape mirrors existing cleanup-dispatcher; RPC fan-in is the only novel piece and it's a single Postgres function. |
| Validation Architecture | HIGH | Mirrors `stage-0-safety-worker.test.ts` mock-step pattern; all 8 test files needed are explicitly enumerated. |
| Open Questions | MEDIUM | Open Question 1 (vocabulary) has impact on migration shape; planner needs to confirm before Plan 01 lands. |

### Open Questions Surfaced

See § Open Questions above. The planner should pre-resolve OQ1 (vocabulary), OQ2 (RPC vs app-side synthesis emit), and OQ4 (cost columns scope) before splitting plans, as they affect plan boundaries.

### Ready for Planning

Research complete. Planner has the integration shapes, file paths, code examples, test mapping, and pitfall enumeration needed to produce 5 PLAN.md files.
