# Phase 74: Stage 1 LLM Category Classifier (swarm-agnostic) - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire a swarm-agnostic LLM category classifier into the Stage 0 → Stage 1 seam: new Orq agent `stage-1-category-classifier`, new Inngest worker `classifier-screen-worker` consuming `classifier/screen.requested`, registry-driven regex-then-LLM ordering, dual-write to `pipeline_events`. Cross-swarm reuse proved by seeding `sales-email` rows in `swarms` + `swarm_categories` and routing one sales-email mailbox through the same agent + worker on Friday rollout (firecontrol@, SMEBA fire@, +1 sales inbox).

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `74-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `74-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- New Orq agent `stage-1-category-classifier` (Haiku-class, strict json_schema, swarm-agnostic).
- New Inngest worker `classifier-screen-worker` at `web/lib/inngest/functions/classifier-screen-worker.ts`.
- Regex-first ordering with LLM fall-through on `unknown` only.
- Low-confidence coercion to `unknown` (hardcoded `low`→`unknown` gate).
- Phase 70 dual-write of Stage-1 decisions to `pipeline_events` + legacy read-models.
- `swarm_categories` seed rows for `swarm_type='sales-email'` (5 keys, mirroring debtor-email).
- `swarms` row for sales-email sufficient to make the registry-driven worker function.
- End-to-end production rollout on firecontrol@, SMEBA fire@, and one sales mailbox.

**Out of scope (from SPEC.md):**
- Promotion of common LLM picks → new regex rules (Phase 72 territory).
- Deriving an initial sales-email regex set from the Supabase corpus.
- New Bulk Review UI columns for LLM-specific data.
- Labeled eval dataset / offline regression tests for the LLM.
- Cost/latency dashboards specific to the new agent.
- Per-swarm `min_llm_confidence` registry column.
- Coordinator/handler changes for sales-email.
- Sales-email regex Stage 1 implementation.

</spec_lock>

<decisions>
## Implementation Decisions

### Event Contract (Stage 0 → Stage 1 seam)
- **D-01:** Extend `classifier/screen.requested` payload to carry `swarm_type: string`. Stage-0 emit site (`web/lib/inngest/functions/stage-0-safety-worker.ts:75` and the `safety_overridden` branch at `:177`) gets one new field on the `inngest.send` call. No behavior change to Stage-0 logic. Rationale: Worker must dispatch registry lookup per-swarm; resolving via DB lookup on `automation_run_id` is an unnecessary extra round-trip when Stage 0 already knows the swarm at emit time.
- **D-02:** Stage-0 also emits `entity` (already in its event data) into the new payload so downstream `pipeline_events` rows can record entity without re-deriving.

### Regex Invocation Surface
- **D-03:** Worker resolves regex module per-swarm via `swarms.stage1_regex_module` (Phase 68 column, already populated for debtor-email = `@/lib/debtor-email/classify`). For `null` (sales-email today) the worker skips regex entirely → goes straight to LLM. No `swarm_type === 'debtor-email'` literal in the worker.
- **D-04:** Build a tiny registry helper `loadRegexModule(swarms_row)` that dynamic-imports the configured module path and returns its `classify(input)` function. Errors on import = throw, treated as a failed run (preserves the "no silent skip" property).

### LLM Agent Contract
- **D-05:** Agent name: `stage-1-category-classifier`. `swarm_type='cross-cutting'` in `public.orq_agents`. Primary model resolved at agent-creation time via `list_models`; expected primary `aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0` (CLAUDE.md). Fallback chain: `openai/gpt-4o-mini` → `google-ai/gemini-2.5-flash`. All three IDs verified via `list_models` BEFORE `update_agent`.
- **D-06:** Strict json_schema response_format with this output shape:
  ```json
  {
    "category_key": "string",
    "confidence": "low" | "medium" | "high",
    "reasoning": { "anyOf": [{"type":"string"},{"type":"null"}] }
  }
  ```
  No alternates / no runner-up array in v1. Reasoning is captured for telemetry but not surfaced in any UI this phase.
- **D-07:** Closed-category list is built at call time inside the worker (loaded from `swarm_categories` for the inbound `swarm_type`, filtered to `enabled=true`), injected into the agent prompt as a `<categories>` XML block listing `(category_key, display_label)` pairs. Single agent definition; the list varies per call. No per-swarm agent variants.
- **D-08:** Prompt structure follows CLAUDE.md XML-tagged convention: `<role>`, `<task>`, `<categories>`, `<input>` (subject + body_text), `<constraints>` (must pick from listed `category_key`s OR `unknown`), `<output_format>`.
- **D-09:** Agent creation flow: `create_agent` (bare model id, no parameters) → `update_agent` (full `model.parameters` incl. `response_format` strict json_schema + `fallback_models`) → `get_agent` to verify persisted shape (CLAUDE.md `cba7352b` learning).

### Confidence Gate
- **D-10:** Hardcoded gate inside worker: `final_category_key = (llm.confidence === 'low') ? 'unknown' : llm.category_key`. No registry column for thresholds in v1.

### Failure Handling
- **D-11:** On LLM error / timeout / schema-validation failure: coerce to `category_key='unknown'` with `confidence='low'`, write `agent_runs.error_message` describing the failure mode, still emit `classifier/verdict.recorded` with `predicted_category='unknown'`. Verdict-worker then routes via existing `unknown` → label-resolver chain (debtor) / `manual_review` (sales). Retries stays at 0; no exception thrown.
- **D-12:** On regex module import failure (D-04): throw; `automation_runs.status='failed'` with error message. Recovery via Bulk Review retry.

### Worker Implementation Constraints
- **D-13:** All side effects in `step.run()`. Any non-deterministic id (the `agent_runs.id` for the LLM call) generated INSIDE `step.run()` per Phase 65 replay-id learning.
- **D-14:** `inngest.send` is never destructured — call inline as `inngest.send({...})` per Phase 65 `dae6276` learning.
- **D-15:** `retries: 0` on the function definition.
- **D-16:** Order of operations inside the worker:
  1. `step.run("load-swarm-row")` — load `swarms` row + `swarm_categories` rows for `swarm_type` (cached together).
  2. `step.run("regex")` — resolve regex module via D-03/D-04; if module exists, call `classify`; if returns non-`unknown`, skip to step 5 with `final_category_key=regex.category`.
  3. `step.run("llm-call")` — invoke `stage-1-category-classifier` Orq agent. Persist `agent_runs` row. Apply D-10 gate.
  4. `step.run("emit-pipeline-event")` — write canonical `pipeline_events` row (stage='stage-1', includes regex outcome + llm outcome + final).
  5. `step.run("emit-verdict")` — `inngest.send({ name: "classifier/verdict.recorded", data: {...} })`.

### Sales-Email Registry Seed
- **D-17:** Migration `supabase/migrations/{date}_phase74_sales_email_seed.sql` inserts:
  - One `swarms` row for `swarm_type='sales-email'` with `stage1_regex_module=null`, `stage2_entity_resolver=null`, `stage3_coordinator_agent_key=null`, `entity_brand=[]` (or appropriate brand list — planner confirms with operator), `side_effects=[]`, `ui_config` minimal (matches debtor shape), `review_route='sales-email-review'`.
  - Five `swarm_categories` rows: `auto_reply, ooo_temporary, ooo_permanent, payment_admittance` → `action='categorize_archive'` with `outlook_label` matching debtor naming pattern (Auto-Reply, OOO Temporary, OOO Permanent, Payment Admittance); `unknown` → `action='manual_review'` (no Stage 2/3 chain exists yet for sales-email).
- **D-18:** No coordinator/handler/regex code is added for sales-email this phase. Sales-email only gets: registry rows + ingest hook (operator decision on which mailbox + how Outlook ingestion is wired into `stage-0/email.received` for that mailbox — Phase 73 territory if not already done).

### Acceptance & Verification
- **D-19:** Test fixtures live in `web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts`. RED tests cover: regex-hit-skip-LLM (debtor); LLM-low-confidence→unknown coercion; LLM-medium→pass-through; LLM-error→unknown coercion; sales-email no-regex path → LLM-only; pipeline_events row count = 1 per call; agent_runs row only when LLM invoked.
- **D-20:** Production rollout verification (SPEC req 7) is operator-driven post-deploy: 24-hour `pipeline_events` query for each of the three target mailboxes.

### Claude's Discretion
- Exact prompt wording for the agent's `<role>` and `<task>` blocks (planner/researcher drafts; verify against fixtures).
- The exact JSON shape for the `pipeline_events.payload` for a Stage-1 row (follow existing Phase 70 `emitPipelineEvent` convention; planner confirms the event name + payload schema).
- Which sales-email mailbox is the rollout target (operator chooses during execute-phase).
- Whether sales-email gets `entity_brand=[]` (truly cross-brand) or a starter brand list (planner confirms with operator before migration is applied).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 74 spec
- `.planning/phases/74-stage-1-llm-category-classifier-swarm-agnostic-fills-the-mis/74-SPEC.md` — Locked requirements (7), boundaries, acceptance criteria. **MUST read before planning.**

### Agentic pipeline (canonical RFC)
- `docs/agentic-pipeline/README.md` — v8.0 5-stage funnel architecture (Stage 0 → Stage 4). The architectural frame this phase fills the seam in.
- `docs/agentic-pipeline/stage-1-regex.md` — Today's Stage 1 routing pattern via `swarm_categories` + `swarm_categories.action` dispatch. The new LLM extends this seam, does not replace it.
- `docs/agentic-pipeline/context-shape-contract.md` — Stage 2 → 3 canonical context shape (informational; the new worker emits to Stage 2 indirectly via verdict-worker dispatch).
- `docs/agentic-pipeline/override-model.md` — Axis-1 (corrected_category) is reused as-is for LLM verdicts; no new override surface this phase.

### Swarm-specific
- `docs/debtor-email-pipeline-architecture.md` — Implementation map for the debtor-email swarm (Outlook ingest, classifier flow, swarm_categories registry).

### Patterns (CLAUDE.md project rules)
- `CLAUDE.md` — Non-negotiable Stack + the Orq.ai, Inngest, and Supabase patterns sections (Haiku model id, list_models pre-flight, create→PATCH→get_agent verify, anyOf nullable, replay-safe ids, never-destructure `inngest.send`, retries:0).
- `docs/orqai-patterns.md` — XML-tagged prompts, response_format strict json_schema, fallback chains, EU model routing.
- `docs/inngest-patterns.md` — step.run() side effects, replay safety, retries:0 rationale.

### Schema / migrations referenced
- `supabase/migrations/20260429b_swarm_registry.sql` — `swarms` + `swarm_categories` table shapes.
- `supabase/migrations/20260429h_swarm_categories_unknown_dispatch.sql` — debtor-email `unknown` → label-resolver dispatch row (preserved unchanged this phase).
- `supabase/migrations/20260504b_swarms_registry_generalisation.sql` — Phase 68 columns (`stage1_regex_module`, `stage2_entity_resolver`, `stage3_coordinator_agent_key`, `side_effects[]`). The `stage1_regex_module` column drives D-03.

### Code reference points (not specs, but anchors)
- `web/lib/inngest/functions/stage-0-safety-worker.ts` — Emit-site of `classifier/screen.requested`. Modify to add `swarm_type` per D-01.
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — Existing consumer of `classifier/verdict.recorded`. Untouched this phase but is the next hop after the new worker.
- `web/lib/debtor-email/classify.ts` — The regex module dispatched per D-03 for debtor-email.
- `web/lib/inngest/functions/classifier-label-resolver.ts` — Pattern source for `pipeline_events` dual-write + `agent_runs` write semantics.
- `web/lib/swarms/registry.ts` — `loadSwarmCategories` helper (existing) — extend with a `loadSwarm(swarm_type)` if not already present.
- `web/lib/pipeline-events/emit.ts` — `emitPipelineEvent` helper used for Phase 70 dual-write.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `loadSwarmCategories(admin, swarm_type)` (`web/lib/swarms/registry.ts`) — already used by `classifier-verdict-worker`. Reuse in the new worker for D-07 closed-list build.
- `emitPipelineEvent` (`web/lib/pipeline-events/emit.ts`) — Phase 70 dual-write helper.
- `evaluateSideEffects` (`web/lib/swarms/side-effects.ts`) — not directly needed (this phase doesn't add side effects), but registry idiom example.
- Orq agent client at `web/lib/orq/client.ts` (per CLAUDE.md note: builds per-call response_format from `public.orq_agents.output_schema`).

### Established Patterns
- **Registry-driven dispatch** (`classifier-verdict-worker`): switch on `swarm_categories.action`, never on `swarm_type` literal. Same idiom drives D-03 here (switch on `swarms.stage1_regex_module` presence).
- **Dual-write** (`classifier-label-resolver`): every stage decision writes one canonical `pipeline_events` row + the legacy denormalized read-model. Direct template for D-16 step 4.
- **`agent_runs` insert pattern**: cost + duration + tool_outputs jsonb + run_id (replay-safe). Direct template for D-16 step 3.
- **Inngest function shape**: `{ id, retries: 0 }` + `{ event }` trigger + step.run-wrapped side effects. Every worker in `web/lib/inngest/functions/` follows this.

### Integration Points
- **Inbound:** `classifier/screen.requested` (already emitted by Stage 0; nothing else listens today). New worker fills this seam.
- **Outbound:** `classifier/verdict.recorded` (already consumed by `classifier-verdict-worker` for registry-driven dispatch). New worker is just another emitter.
- **DB writes:** `pipeline_events` (canonical), `agent_runs` (LLM call telemetry), `automation_runs` status flips (per existing patterns).
- **No UI changes** this phase (Bulk Review already handles `predicted_category` field; LLM verdicts flow through unchanged).

</code_context>

<specifics>
## Specific Ideas

- **Operator anchor for sales-email rollout:** Friday 2026-05-08, three target mailboxes (firecontrol@, SMEBA fire@, +1 sales inbox TBD). The phase ships only when all three are observed in `pipeline_events` within 24 hours of deploy.
- **Reuse claim is testable:** The same Orq agent + same Inngest worker process both swarms. Acceptance check: `grep -rn "swarm_type === 'sales-email'\\|swarm_type === \"sales-email\"" web/lib/inngest/functions/classifier-screen-worker.ts` returns zero matches.
- **Sales-email payment_admittance:** Operator note — payment confirmations also land in the sales mailbox. Keep `payment_admittance` in the sales-email seed; do NOT drop it.
- **Future-work flag:** Operator wants to derive a sales-email regex set from the Supabase corpus later (separate effort). Not this phase. Captured as deferred.

</specifics>

<deferred>
## Deferred Ideas

- **Sales-email regex Stage 1 from Supabase corpus** — operator-stated future work; LLM is the v1 substitute. Belongs in a follow-up phase.
- **Promotion of common LLM picks → regex rules** — Phase 72 (promotion-recommender + Learning Inbox) territory.
- **Bulk Review UI columns for LLM-specific data** (per-call cost, reasoning text) — future enhancement.
- **Labeled eval dataset + offline regression tests** — ship-then-eval cadence for v1; eval lands later.
- **Per-swarm `min_llm_confidence` registry column** — hardcoded `low`→`unknown` gate suffices for v1.
- **Cost/latency dashboards specific to the new agent** — existing `agent_runs` cost telemetry is enough for v1.
- **Coordinator/handler/regex code for sales-email** — Phase 73 territory (sales-email full pipeline).

</deferred>

---

*Phase: 74-stage-1-llm-category-classifier-swarm-agnostic-fills-the-mis*
*Context gathered: 2026-05-06*
