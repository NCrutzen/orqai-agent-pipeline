# Phase 65: Stage 3 ranked multi-intent coordinator + orchestrator escalation — Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the single-label Stage 3 classifier with a **ranked-intent coordinator**, add a **Stage 3.5 orchestrator-worker** that fans out to multiple Stage 4 handlers and synthesises one iController draft, and keep the **single-shot fast path** for the ~80% of inbound that doesn't need decomposition.

In scope (CORD-01..04):

1. Coordinator output shape change: ordered `[{intent, confidence}, …]` replaces today's `{intent, confidence}` (CORD-01).
2. Escalation gate to Stage 3.5 on `confidence == 'low' OR intent_count >= 3 OR any intent.requires_orchestration` (CORD-02).
3. Orchestrator-worker spawns N parallel Stage 4 handlers and a synthesis step that produces one iController draft visible in Bulk Review (CORD-03).
4. Default single-shot path stays (~80% of inbound) with no orchestrator overhead (CORD-04).

Out of scope:

- Numeric confidence thresholds — RFC defers these to Phase 71 (LERN-*).
- Final `swarm_intents` registry — that's Phase 68 (SWRM-*). Phase 65 ships an interim shape on the existing `swarm_categories` table.
- Retiring `debtor-email-triage` as a function name — Phase 66 (CONS-*) does the rename + legacy-code delete.
- Bulk Review override UI for ranked output — Phase 71 (LERN-*) ships the proper override control.
- Canonical `pipeline_events` table — Phase 70 (TELE-*).
- Canonical handler **input** shape across swarms — Phase 69 (CANO-*). Phase 65 only canonicalises the *output* shape (`HandlerOutput`).

</domain>

<decisions>
## Implementation Decisions

### Coordinator agent identity + model

- **D-01:** **Replace `debtor-intent-agent` in-place.** `agent_key` stays. Bump `version` from `2026-04-23.v1` → `2026-05-01.v2`. Swap `output_schema` to ranked-list shape (see D-12). Swap `model_config.primary` to `anthropic/claude-sonnet-4-5-20250929` (Anthropic-direct) with `aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0` (Bedrock EU) as first fallback, then `openai/gpt-4o`, `google-ai/gemini-2.5-pro`, `mistral/mistral-large-2411`. **Reason against a parallel new agent:** same role, same swarm, same input contract; Phase 64's biggest time sink was registry mismatches across multiple `orq_agents` rows (learning `f980a2a1-4500-4c2e-98c5-803261ab7d78`). Fewer rows = less surface for that bug. **Reason against the wrap pattern:** loses the actual ranking model.
- **D-12:** Coordinator `output_schema` (strict json_schema, `anyOf` for nullable per CLAUDE.md):
  ```jsonc
  {
    "type": "object",
    "required": ["ranked", "language", "urgency", "intent_version"],
    "properties": {
      "ranked": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "required": ["intent", "confidence", "reasoning"],
          "properties": {
            "intent":      {"type": "string", "enum": [/* existing 8-intent vocab */]},
            "confidence":  {"type": "string", "enum": ["low","medium","high"]},
            "document_reference": {"anyOf": [{"type":"string"}, {"type":"null"}]},
            "sub_type":    {"anyOf": [{"type":"string","enum":[/* SUB_TYPE */]}, {"type":"null"}]},
            "reasoning":   {"type": "string", "maxLength": 200}
          }
        }
      },
      "language":       {"type":"string","enum":["nl","en","de","fr"]},
      "urgency":        {"type":"string","enum":["low","normal","high"]},
      "intent_version": {"type":"string","const":"2026-05-01.v2"}
    }
  }
  ```
- **D-13:** Orq workflow per CLAUDE.md: `list_models` pre-flight before any `create_agent`/`update_agent`; create-then-PATCH because `create_agent` silently drops `model.parameters.response_format` (learning `cba7352b`); JSON Schema tool resource configured via Studio (Tools → Add → JSON Schema), then Model parameters → Response Format dropdown = "JSON Schema" pointing at the tool name.

### Stage 3.5 mechanics (hybrid orchestrator-planner + Inngest fan-out + cross-cutting synthesis)

- **D-02:** **Hybrid path**: ranking → orchestrator-planner LLM → Inngest parallel dispatch → synthesis LLM. Ranking gives the ordered intents; the planner adds per-handler context extraction and cross-handler dependency expression that pure ranking alone can't carry (e.g., "address_change handler needs the new address; copy_document_request handler needs reference '12345'").
- **D-03:** **Separate `debtor-orchestrator-agent`** (`swarm_type='debtor-email'`), runs ONLY on escalation (~20% of inbound). Input = email + coordinator's ranked list + `PipelineStageContext`. Output = execution plan: `{handlers: [{handler_key, intent, context_payload}], ordering: 'parallel'|'sequential', notes}`. Model = `anthropic/claude-sonnet-4-5-20250929` (same as coordinator). Keeps coordinator prompt focused on rank-only so the 80% fast path stays cheap.
- **D-04:** **Fan-in via Supabase counter + RPC trigger.** Orchestrator writes a `coordinator_runs` row with `expected_handlers=N`. Each Stage 4 handler, on completion, calls `rpc.coordinator_complete_handler(run_id)` which atomically increments `completed_handlers`; when `completed_handlers = expected_handlers`, the RPC emits `debtor-email/synthesis.requested`. Durable, observable, debuggable; same shape `automation_runs` already uses.
- **D-05:** **Partial synthesis on handler failure.** Synthesis runs on whatever completed; the iController draft includes a footer noting which intents could not be addressed; row lands in Bulk Review with `coordinator_runs.partial_synthesis = true` for operator attention. Failed handler errors are logged but do not kill the run. Never silently drop secondary intents; never fail the whole run on one child failure.
- **D-06:** **Cross-cutting `synthesis-agent`** (`swarm_type='cross-cutting'` in `orq_agents`, alongside `label-tiebreaker`). Operates on a canonical `HandlerOutput[]` shape codified in `web/lib/agentic-pipeline/types.ts` in this phase:
  ```ts
  export interface HandlerOutput {
    handler_key: string;            // 'debtor-copy-document-body-agent', etc.
    intent: string;                 // 'copy_document_request'
    content_kind: 'draft_body' | 'action_confirmation' | 'data_payload';
    content: string;                // body_html | text confirmation | structured json
    language: 'nl' | 'fr' | 'en' | 'de';
    tone: 'neutral' | 'de-escalation';
    references: string[];           // invoice numbers, addresses changed, etc.
    confidence: 'low' | 'medium' | 'high';
  }
  ```
  Existing `debtor-copy-document-body-agent` gets a thin output adapter (it already produces `body_html` + `detected_tone`; the wrap is small). Future Stage 4 handlers (sales-email Phase 73, etc.) conform to this shape — synthesis logic does not change when new handlers arrive. Synthesis agent model = `anthropic/claude-sonnet-4-5-20250929`. **Synthesis output:** single `body_html` + `detected_tone` + `synthesis_version` (post-validated footer with run_id + version, mirroring the body agent's idempotent footer pattern).
- **D-07:** **Budget propagation under one shared run.** Phase 64 D-15 defines "per-run = one top-level Inngest invocation". Phase 65 treats the orchestrator family (orchestrator-planner + N handlers + synthesis) as one logical run via shared `run_id`. Orchestrator passes `(run_id, remaining_tokens, remaining_cost_cents)` into each child event; each handler increments shared counters in `coordinator_runs` via RPC before its Stage 4 LLM call; any breach emits the existing `pipeline.budget_breached` event (Phase 64), aborting subsequent children in the same run.

### Interim escalation gate (until Phase 71's promotion math)

- **D-08:** **`requires_orchestration` lives on `swarm_categories`.** `ALTER TABLE swarm_categories ADD COLUMN requires_orchestration boolean NOT NULL DEFAULT false`. Phase 64 already chose `swarm_categories.key` as the intent identifier (Phase 64 D-07); reuse the same row. Phase 68 migrates this column cleanly to the new `swarm_intents` table — no semantic change, just a rename + table move.
- **D-09:** **Tri-state escalation gate.** Coordinator output keeps the existing `{low, medium, high}` confidence enum per ranked entry. Escalate when:
  ```
  ranked[0].confidence == 'low'
    OR ranked.length >= 3
    OR any(r.intent in swarm_categories WHERE requires_orchestration = true)
  ```
  No numeric threshold to defend; no eval data needed before launch; matches the enum the agent already produces; Phase 71 cleanly swaps in numeric confidence as a separate axis.

### Rollout + telemetry

- **D-10:** **Replace `debtor-email-triage` in-place. Pre-stage Phase 66 events.** Phase 65 rewrites `web/lib/inngest/functions/debtor-email-triage.ts` to be the new coordinator function. Single-shot path emits `debtor-email/<intent>.requested` (the canonical Phase 66 event taxonomy — pre-staged so Phase 66's diff is just a rename + legacy-code delete, not a cutover). Escalation path emits `debtor-email/orchestrator.requested`. The function name `debtor-email-triage` survives Phase 65 and is renamed in Phase 66. **No parallel paths in production**; no feature flag.
- **D-11:** **New `coordinator_runs` table** holds Phase 65's persistence needs:
  ```sql
  CREATE TABLE public.coordinator_runs (
    run_id              uuid PRIMARY KEY,
    automation_run_id   uuid REFERENCES public.automation_runs(id),
    email_id            text NOT NULL,
    swarm_type          text NOT NULL,
    ranked_intents      jsonb NOT NULL,                -- the full ranked list from coordinator
    escalation_decision text NOT NULL,                  -- 'single_shot' | 'orchestrator'
    escalation_reason   text,                           -- 'low_confidence' | 'high_intent_count' | 'requires_orchestration_flag'
    expected_handlers   int NOT NULL DEFAULT 1,
    completed_handlers  int NOT NULL DEFAULT 0,
    failed_handlers     int NOT NULL DEFAULT 0,
    partial_synthesis   boolean NOT NULL DEFAULT false,
    budget_run_id       text,                           -- shared budget identifier (D-07)
    created_at          timestamptz NOT NULL DEFAULT now(),
    completed_at        timestamptz
  );
  ```
  Phase 70 either backfills the canonical `pipeline_events` table from `coordinator_runs` or treats `coordinator_runs` as a denormalised read-model populated alongside it. Either way, Phase 65 owns the schema; Phase 70 doesn't have to retrofit.

### Claude's Discretion

- **Concurrency limits on fan-out** — current triage is `concurrency: [{key: "event.data.entity", limit: 2}]`. Planner picks an explicit per-handler concurrency policy that doesn't blow up the Stage 4 fan-out (likely scoped per `(entity, run_id)`).
- **Idempotency keys** for orchestrator + synthesis steps (likely `(run_id, step_name)` keyed via Inngest step IDs + `agent_runs.cache_key`).
- **iController draft creation post-synthesis** — reuse the existing path used by the single-shot copy-document handler, or factor a shared helper. Planner picks based on file shape.
- **Exact RPC name + signature** for `coordinator_complete_handler`. Likely `public.coordinator_complete_handler(p_run_id uuid)` returning the new `(completed_handlers, expected_handlers)` pair.
- **Idempotency cache invalidation** for the coordinator agent — `intent_version` field handles it (`v1` cached results are invalidated by the v2 version literal). Planner verifies the cache lookup keys on `intent_version`.
- **Whether the orchestrator-planner output schema includes a `notes` field for downstream debugging.** Probably yes; planner decides exact shape.
- **Eval / regression strategy** on the rank-shape change — likely a one-off backfill that re-runs the new coordinator over the last N production emails and compares top-1 against the old single-label output as a sanity check before flipping live. Planner sizes N.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v8.0 Agentic Pipeline RFC (locks the cross-swarm shape)

- `docs/agentic-pipeline/README.md` — RFC entry point. 5-stage funnel, tenancy, forward-references table.
- `docs/agentic-pipeline/stage-3-coordinator.md` — Stage 3 contract. Names "Stage 3.5 full design — Phase 65" as the placeholder this phase fills in.
- `docs/agentic-pipeline/context-shape-contract.md` — Stage 2 → Stage 3 input contract (`PipelineStageContext`, `context_version: 1`).
- `docs/agentic-pipeline/stage-4-handler.md` — handler contract; tool allowlist (`zapier_tools.allowed_for_intents`) gating.
- `docs/agentic-pipeline/override-model.md` — Axis 3 captures Stage 3 corrections; Phase 71 ships the override UI.
- `docs/agentic-pipeline/graduated-automation.md` — promotion ladder; Phase 71 ships concrete thresholds.

### Phase 64 (immediately upstream — sets the budget + tool-allowlist primitives)

- `.planning/phases/64-stage-0-input-safety-per-run-budgets/64-CONTEXT.md` — D-13 (`pipeline.budget_breached` as a first-class event), D-14 (token + cost ceilings tracked side-by-side), D-15 (per-run = one top-level Inngest invocation — Phase 65 honours this via shared `run_id`).
- `web/lib/automations/debtor-email/nxt-zap-client.ts` — tool allowlist enforcement pattern; orchestrator-spawned handlers must go through this same gate.

### Debtor-email swarm implementation map

- `docs/debtor-email-pipeline-architecture.md` — current pipeline shape; Phase 65 changes the Stage 3 internals while preserving the surface.
- `web/lib/automations/debtor-email/triage/invoke-intent.ts` — the existing single-label call. Phase 65 rewrites the schema and the response parsing; the Orq `/v2/agents/{key}/responses` transport stays.
- `web/lib/automations/debtor-email/triage/types.ts` — `INTENT`, `CONFIDENCE`, `intentAgentOutputSchema`. Bump to `intentAgentOutputSchemaV2` (ranked) alongside the v1 schema; remove v1 in Phase 66.
- `web/lib/inngest/functions/debtor-email-triage.ts` — the function being rewritten in-place (D-10).
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — registry-driven dispatch pattern via `swarm_categories.action` + `swarm_dispatch`. Phase 65's escalation dispatch follows this same pattern (intents map to handler events through the registry, no hardcoded if/else).
- `web/lib/inngest/functions/classifier-label-resolver.ts` — parallel example of an Inngest worker following the canonical event taxonomy (`debtor-email/label-resolve.requested`).

### Orq.ai patterns (mandatory pre-flight)

- `docs/orqai-patterns.md` — `response_format: json_schema`, fallback chain, 45s client timeout, XML-tagged prompts.
- `CLAUDE.md` § Orq.ai — `list_models` pre-flight, create-then-PATCH workflow, `anyOf` for nullable, JSON Schema tool resources via Studio. **Read before any agent create/update.**
- `supabase/migrations/20260429g_orq_agents_registry.sql` — current `debtor-intent-agent` row shape; D-01 PATCHes this row.

### Inngest patterns

- `docs/inngest-patterns.md` — durable functions, `step.run` boundaries, retry semantics, watermark syncs.
- `web/lib/automations/orq-agents/client.ts` — the working `/v2/agents/{key}/responses` transport (rewritten this session). Coordinator + orchestrator + synthesis all call through here.

### Supabase patterns

- `docs/supabase-patterns.md` — service-role writes, JSONB double-encoding pitfall.
- `supabase/migrations/20260429b_swarm_registry.sql` — `swarm_categories` table that D-08 alters.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`web/lib/inngest/functions/classifier-verdict-worker.ts`** — registry-driven dispatch via `swarm_categories.action` + `swarm_dispatch`. Phase 65's coordinator escalation dispatch reuses this pattern: intents map to handler events through the registry, no hardcoded if/else. Specifically, the `case "swarm_dispatch"` block (lines 149-176) is the prototype for how the new coordinator dispatches `debtor-email/<intent>.requested`.
- **`web/lib/automations/debtor-email/triage/invoke-intent.ts`** — Orq `/v2/agents/{key}/responses` transport with key-sorted JSON, AbortSignal timeout, zod-validated output. The transport stays; only the agent schema and the response parser change for D-12.
- **`web/lib/automations/debtor-email/triage/agent-runs.ts`** — `findCachedOutput` / `mergeToolOutputs` idempotency cache. Coordinator's v2 `intent_version` literal automatically invalidates v1-cached entries — no migration code needed.
- **`web/lib/automations/orq-agents/client.ts`** — generic `invokeOrqAgent(agent_key, input)` helper. Coordinator, orchestrator-planner, and synthesis agent all invoke through this single client.
- **`web/lib/swarms/registry.ts`** — `loadSwarmCategories(admin, swarm_type)`. Already the right shape; D-08's new column flows through automatically.
- **`emitAutomationRunStale(admin, '<swarm>-review')`** in `web/lib/automations/runs/emit.ts` — the Bulk Review revalidation hook. Coordinator + synthesis writers call this on every status transition to keep the operator UI fresh.

### Established Patterns

- **Per-stage Inngest function with `retries: 0` + Bulk Review retry button** (verdict-worker, label-resolver). Coordinator + synthesis follow the same shape. Failures land as `automation_runs.status='failed'` with an `error_message`; recovery is operator-driven, not Inngest-cascading.
- **Idempotent agent calls via `cache_key` + version literal** (`debtor-intent-agent` today, body agent today). Coordinator v2 follows the same pattern.
- **Strict json_schema `output_schema` enforcement** at the Orq layer + zod re-validation client-side. Two layers of defence-in-depth on every LLM call.
- **`swarm_type` column on every cross-swarm primitive** (`automation_runs`, `orq_agents`, `swarm_categories`). `coordinator_runs` follows the same convention.

### Integration Points

- **Inbound event:** `debtor/email.received` (no change — Phase 65 doesn't touch ingestion).
- **Stage 0 handoff:** the existing Stage 0 worker emits the event that Phase 65's coordinator function listens on. Phase 65 inherits the `run_id` and remaining-budget fields from Stage 0's payload.
- **Stage 4 dispatch:** new canonical events `debtor-email/<intent>.requested` (e.g., `debtor-email/copy_document_request.requested`). Phase 66 makes these the only dispatch shape; Phase 65 ships them already.
- **Synthesis trigger:** new event `debtor-email/synthesis.requested` emitted by the fan-in RPC (D-04).
- **Bulk Review surface:** `coordinator_runs` joins `automation_runs` for the existing draft-review tab. Operator sees the orchestrator-decomposed draft as a single row with a `partial_synthesis` badge if applicable. Full ranked-list visualisation + override controls land in Phase 71.
- **Budget breach:** existing `pipeline.budget_breached` event from Phase 64. Phase 65 emits it from inside any fan-out child that breaches the shared counter.

</code_context>

<specifics>
## Specific Ideas

- The fan-in counter pattern (D-04) explicitly mirrors the shape of `automation_runs` so operators reading `coordinator_runs` see something familiar.
- The canonical `HandlerOutput` shape (D-06) is the **first concrete piece of Phase 69's CANO-* work** to land. Phase 65 only canonicalises the *output* side; Phase 69 will canonicalise the input side. Decoupling these halves makes Phase 69 lighter.
- The interim `requires_orchestration` column on `swarm_categories` (D-08) is **deliberately the same row that holds today's intent-handler binding** — minimises the "where does intent metadata live?" surface area.
- Per CLAUDE.md, Orq agent create flows **must** do `list_models` pre-flight before `create_agent`/`update_agent`, and **must** use create-then-PATCH because `create_agent` drops `model.parameters.response_format`. Plan tasks for `debtor-intent-agent v2`, `debtor-orchestrator-agent`, and `synthesis-agent` all follow this workflow.

</specifics>

<deferred>
## Deferred Ideas

- **Numeric confidence threshold for escalation** — RFC defers to Phase 71 (LERN-*). Phase 65 ships tri-state (D-09); Phase 71 swaps in a numeric float threshold backed by promotion math.
- **`swarm_intents` table migration** — Phase 68 (SWRM-02). Phase 65's `swarm_categories.requires_orchestration` column moves cleanly to the new table.
- **Canonical handler INPUT shape across swarms** — Phase 69 (CANO-*). Phase 65 only canonicalises the output side via `HandlerOutput`.
- **`pipeline_events` canonical events table** — Phase 70 (TELE-01). Phase 65's `coordinator_runs` table is either backfilled into it or kept as a denormalised read-model.
- **Bulk Review override UI for ranked output** — Phase 71 (LERN-*). Phase 65 ships the data (full ranked list + escalation reason in `coordinator_runs`); Phase 71 ships the operator override controls (reorder, mark wrong, demote escalation).
- **Sales-email coordinator** — Phase 73. Cross-cutting `synthesis-agent` and canonical `HandlerOutput` shape are designed to absorb this with zero code changes.
- **Cost tracking for coordinator/orchestrator/synthesis runs** — Phase 64 deferred-items file already notes that Orq's `/responses` endpoint returns tokens but not billing. Same gap applies to Phase 65's three new agents; coordinator_runs.budget_run_id ties into whatever resolution Phase 64's deferred-items work picks.

</deferred>

---

*Phase: 65-stage-3-ranked-multi-intent-coordinator*
*Context gathered: 2026-05-01*
