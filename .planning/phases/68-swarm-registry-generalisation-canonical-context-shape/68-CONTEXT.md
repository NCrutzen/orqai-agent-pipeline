# Phase 68: swarm_registry generalisation + canonical context shape — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** `--auto` (Claude selected recommended option for each gray area; user can revise before plan-phase)

<domain>
## Phase Boundary

Convert hard-coded swarm-specific bindings (`swarm_type === 'debtor-email'` gates, hard-coded module imports for Stage 1 regex / Stage 2 resolver, hard-coded intent→handler-event mappings) into **data-driven registry rows** so onboarding a second swarm (sales-email/SugarCRM, Phase 73) requires zero edits to `verdict-worker`, `classifier-label-resolver`, `coordinator-orchestrator`, or any handler.

In scope (SWRM-01..04):

1. **SWRM-01:** Extend `public.swarms` with `stage1_regex_module text`, `stage2_entity_resolver text`, `stage3_coordinator_agent_key text`, `canonical_context_shape jsonb`. (`side_effects jsonb` column already exists from Phase 67's CONTEXT — confirmed via Supabase MCP.)
2. **SWRM-02:** New `public.swarm_intents` table with `(swarm_type, intent_key)` composite PK + `handler_agent_key text` + `handler_event text` + `requires_orchestration boolean default false`. Replaces every hard-coded intent→handler mapping (today scattered across coordinator-orchestrator template literal and verdict-worker `swarm_categories.swarm_dispatch` lookups).
3. **SWRM-03:** New-swarm onboarding via SQL `INSERT` only — proven via a synthetic `sales-email-stub` row inserted in tests, with `loadSwarmRegistry` returning it correctly. Actual sales-email implementation is Phase 73; Phase 68 only proves the registry shape supports it.
4. **SWRM-04:** Replace the existing `swarm_type === 'debtor-email'` code gates (verdict-worker iController-delete dispatch + label-resolver icontroller-tag emit) with `side_effects[]` lookup against the registry row.

Out of scope (explicitly deferred):

- **Handler-agent canonicalisation** (CANO-01..04) — Phase 69. Phase 68 ships the registry; Phase 69 wires existing handlers to *consume* `swarms.canonical_context_shape` + `swarms.entity_brand`.
- **`pipeline_events` runtime telemetry** — Phase 70 (TELE-*).
- **Override learning loop / `promotion_candidates`** — Phase 71 (LERN-*).
- **Actual sales-email swarm implementation** — Phase 73.
- **Stage 1 worker for `classifier/screen.requested`** — still deferred from Phase 66.
- **Migration of `swarm_categories` rows into `swarm_intents`** — `swarm_categories` is the Stage-1-output dispatch registry (regex bucket → next event). `swarm_intents` is the Stage-3-output handler registry (intent → handler event). They serve different stages and coexist. Do NOT merge them; that's a Phase 70+ refactor if ever.

</domain>

<decisions>
## Implementation Decisions

### Migration shape (SWRM-01, SWRM-02)

- **D-01: Single migration `supabase/migrations/20260504b_swarms_registry_generalisation.sql`** adds:
  - 4 columns to `public.swarms`: `stage1_regex_module text`, `stage2_entity_resolver text`, `stage3_coordinator_agent_key text`, `canonical_context_shape jsonb`. All nullable (existing row backfilled in same migration).
  - New table `public.swarm_intents`: `(swarm_type text NOT NULL REFERENCES swarms(swarm_type) ON DELETE CASCADE, intent_key text NOT NULL, handler_agent_key text NOT NULL, handler_event text NOT NULL, requires_orchestration boolean NOT NULL DEFAULT false, created_at timestamptz DEFAULT now(), PRIMARY KEY (swarm_type, intent_key))`.
  - Index on `swarm_intents.handler_event` for reverse lookup.
  - Backfill INSERTs for the existing debtor-email swarm: 1 UPDATE on `swarms` (set the 4 new columns) + N INSERTs into `swarm_intents` for the existing intents.
  - All `IF NOT EXISTS` / `IF NOT EXISTS` clauses for idempotency.
  - Postgres 15 fast-default applies (all new columns nullable).

- **D-02: `stage1_regex_module` value format = TS module path string** that exports a `classify(email: EmailRow): RegexClassifyResult` function. For debtor-email: `"@/lib/debtor-email/classify"`. Loader is a small `web/lib/swarms/dynamic.ts` helper that does `await import(path)` — Vite/Next.js dynamic-import semantics already supported, no esbuild config changes needed.

- **D-03: `stage2_entity_resolver` same shape** — module path string. For debtor-email: `"@/lib/automations/debtor-email/resolve-debtor"`. Module exports `resolveEntity(email, ctx): EntityResolveResult` (the existing `resolveDebtor` aliased; planner picks whether to rename or alias-export).

- **D-04: `stage3_coordinator_agent_key` is an `orq_agents.agent_key` reference** (not a module path — coordinator agents live in Orq.ai, not local TS modules). For debtor-email: `"debtor-intent-agent"`. The label-resolver / coordinator looks up the agent via existing `loadAgentSpec(agent_key)` (already in codebase per Phase 65).

- **D-05: `canonical_context_shape` is a versioned JSON Schema-like jsonb document** describing the Stage 2 → Stage 3 handoff envelope:
  ```jsonc
  {
    "version": "2026-05-04.v1",
    "fields": {
      "customer_account_id": { "type": "string", "nullable": true, "description": "Stage 2 entity-resolution output" },
      "customer_name":       { "type": "string", "nullable": true },
      "language":            { "type": "string", "enum": ["nl","en","de","fr"], "default": "nl" },
      "entity_brand":        { "type": "string", "description": "Brand suffix used by handler agents (R-04 / Phase 69)" },
      "recent_documents":    { "type": "array",  "items": { "type": "object" }, "default": [] }
    }
  }
  ```
  Phase 69 handlers consume this shape via `loadCanonicalContextShape(swarm_type)`. Phase 68 just stores it — no code reads the JSON content yet.

### `side_effects[]` shape (SWRM-04)

- **D-06: `side_effects` jsonb is an array of side-effect descriptors:**
  ```jsonc
  [
    {
      "event": "debtor-email/icontroller-tag.requested",
      "trigger": "stage2_match_live",
      "gate": {
        "dry_run": false,
        "customer_account_id_present": true,
        "icontroller_company_present": true
      },
      "phase_origin": "67"
    },
    {
      "event": "icontroller/cleanup.requested",
      "trigger": "stage1_categorize_archive",
      "gate": { "category_action": "categorize_archive" },
      "phase_origin": "56.7"
    }
  ]
  ```
  - `trigger` enum: `stage1_categorize_archive | stage2_match_live | stage3_handler_complete | stage4_synthesis_complete`. The current Phase-67 dispatch gate maps to `stage2_match_live`; the cleanup-shard-worker maps to `stage1_categorize_archive`.
  - `gate` is a key→value map; the dispatcher checks every key against the runtime context and only emits if all match.
  - `phase_origin` is an annotation for traceability — which phase introduced this side-effect.

- **D-07: New module `web/lib/swarms/side-effects.ts`** exports `evaluateSideEffects(swarm_type, trigger, ctx): SideEffectDispatch[]` — loads the `swarms.side_effects` row, filters by `trigger`, evaluates each `gate` against `ctx`, returns the events to emit. Callers (verdict-worker, label-resolver) replace their inline `inngest.send` blocks with a `for (const dispatch of evaluateSideEffects(...))` loop.

- **D-08: Backfill the two known side-effects** for debtor-email in the migration so the verdict-worker + label-resolver can switch to registry-driven dispatch immediately.

### `swarm_intents` content (SWRM-02)

- **D-09: Backfill rows for every current debtor-email intent** the coordinator-orchestrator can fan out to today. Source of truth for "current intents" = the `intent` enum in `web/lib/automations/debtor-email/coordinator/types.ts` (the V2 ranked-output schema enum). Migration creates one row per enum value with `handler_event = "debtor-email/${intent}.requested"`, `handler_agent_key` mapped from the existing per-handler agent (e.g. `copy_document_request` → `debtor-copy-document-body-agent`; future intents → `null` until handler exists), `requires_orchestration = false` for all V1 intents (orchestration-required intents are Phase 71+ scope).

- **D-10: Coordinator-orchestrator's template-literal fan-out** (`debtor-email/${h.intent}.requested`) becomes a registry lookup: `swarm_intents WHERE swarm_type='debtor-email' AND intent_key=$1 RETURNING handler_event`. Same effective behaviour, but new intents (e.g. `peppol_request`, `payment_dispute`) onboard via INSERT.

### Code-edit scope (SWRM-03)

- **D-11: Update the following call sites to read from registry**:
  - `web/lib/inngest/functions/classifier-verdict-worker.ts` — replace inline iController cleanup dispatch with `evaluateSideEffects("debtor-email", "stage1_categorize_archive", ...)`.
  - `web/lib/inngest/functions/classifier-label-resolver.ts` — replace inline icontroller-tag emit (Phase 67) with `evaluateSideEffects("debtor-email", "stage2_match_live", ...)`.
  - `web/lib/inngest/functions/coordinator-orchestrator.ts` — replace template-literal `debtor-email/${intent}.requested` with `loadHandlerEvent(swarm_type, intent)`.
  - `web/lib/inngest/functions/debtor-email-coordinator.ts` — single-shot fast path lookup also uses `loadHandlerEvent`.
  - `web/lib/swarms/registry.ts` — add `loadHandlerEvent`, `loadSideEffects`, `loadCanonicalContextShape` exports alongside existing `loadSwarmCategories`.

- **D-12: No defensive fallback from registry to hardcoded.** If `loadHandlerEvent` returns null, throw a structured error → Inngest run fails → operator sees the misconfiguration in Bulk Review. Reason: Phase 68's whole point is "registry is the source of truth"; a fallback creates a slow drift where the codebase keeps the hardcoded path alive forever.

### `swarm_type === 'debtor-email'` gate elimination (SWRM-04)

- **D-13: Audit task** — grep for every `swarm_type === 'debtor-email'`, `swarm_type == "debtor-email"`, `swarm_type=="debtor-email"`, `if (swarm_type === ...)` site. Replace each with the appropriate registry lookup. Today's grep returned only one comment site (`classifier-verdict-worker.ts:14`); the actual gate may be elsewhere or may have already been generalised. Plan task confirms zero literal-string gates remain post-migration.

### Cutover sequencing

- **D-14: Single PR; sequential waves:**
  - **Wave 0:** migration file + registry helper module skeletons + test scaffolds.
  - **Wave 1:** apply migration via Supabase MCP (operator-gated checkpoint, same pattern as Phase 67); backfill rows verified.
  - **Wave 2:** `web/lib/swarms/registry.ts` extensions + `web/lib/swarms/side-effects.ts` + `web/lib/swarms/dynamic.ts` (module loader) + unit tests.
  - **Wave 3:** swap call sites in verdict-worker, label-resolver, coordinator-orchestrator, debtor-email-coordinator. Each as its own commit.
  - **Wave 4:** synthetic `sales-email-stub` test proving SWRM-03 (zero-code-edit onboarding).
  - **Wave 5:** static-audit + documentation update (`docs/agentic-pipeline/stage-2-entity.md`, `docs/debtor-email-pipeline-architecture.md`) reflecting registry-driven dispatch.

### Stage 1 / Stage 2 module loading (D-02, D-03 mechanics)

- **D-15: Dynamic import via `web/lib/swarms/dynamic.ts`** — wraps `import()` with a small cache (module-level Map; one `import()` per module path per cold start). Returns the exported `classify` / `resolveEntity` function. Throws if the module path doesn't resolve or doesn't export the expected symbol — prevents silent fallback to a missing module.
  - Cache invalidation: module path string IS the cache key; if a swarm row updates `stage1_regex_module`, deploy invalidates the cache (Vercel cold start). No runtime invalidation needed.
  - TypeScript pain point: dynamic imports lose type safety. Helper exports `loadStage1Classifier(swarm_type): Promise<ClassifyFn>` with a typed return signature; the cast happens once inside the helper and downstream callers see the canonical type.

### Claude's Discretion

- Whether to alias-export `resolveDebtor` as `resolveEntity` from `resolve-debtor.ts` or rename the export: planner picks. Recommendation: keep `resolveDebtor` for code-grep continuity, add `resolveEntity` alias.
- Migration column order in `swarms` ALTER: planner picks (cosmetic).
- Whether to seed the canonical_context_shape with the V1 shape from CONTEXT D-05 directly OR start with `null` and have Phase 69 populate: recommend seed in Phase 68 migration since the shape is locked here.
- Whether to add a `swarms.entity_brand` jsonb column in this phase (Phase 69 needs it for CANO-02): recommend YES — adding it now avoids a second migration in Phase 69. Backfill with `["smeba", "smeba-fire", "sicli-noord", "berki", "iccafe", "iccafe-france"]` for debtor-email.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 68 architecture inputs
- `docs/agentic-pipeline/README.md` — v8.0 5-stage funnel; canonical Stage boundaries.
- `docs/agentic-pipeline/context-shape-contract.md` — Stage 2 → 3 handoff contract; the `canonical_context_shape` jsonb encodes this.
- `docs/agentic-pipeline/stage-1-regex.md` — Stage 1 regex contract (the shape `stage1_regex_module` modules implement).
- `docs/agentic-pipeline/stage-2-entity.md` — Stage 2 resolver contract (the shape `stage2_entity_resolver` modules implement).
- `docs/agentic-pipeline/stage-3-coordinator.md` — Stage 3 coordinator contract.
- `docs/agentic-pipeline/stage-4-handler.md` — Stage 4 handler contract; `swarm_intents.handler_event` connects to it.

### Phase predecessors (Phase 68 builds on these)
- `.planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-CONTEXT.md` — defines the V2 intent enum the migration backfills `swarm_intents` from.
- `.planning/phases/66-pipeline-consolidation-retire-triage-path/66-CONTEXT.md` — establishes the canonical flow Phase 68 parameterises.
- `.planning/phases/67-stage-2-closure-icontroller-dom-tagging/67-CONTEXT.md` — added the icontroller-tag side-effect; Phase 68 moves it into `swarms.side_effects[]`.

### Existing code Phase 68 modifies
- `web/lib/swarms/registry.ts` — currently exports `loadSwarmCategories`; Phase 68 extends.
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — registry-driven dispatch site (already reads `swarm_categories.swarm_dispatch`).
- `web/lib/inngest/functions/classifier-label-resolver.ts` — Phase 67 emit site to refactor.
- `web/lib/inngest/functions/coordinator-orchestrator.ts` — template-literal fan-out to refactor.
- `web/lib/inngest/functions/debtor-email-coordinator.ts` — single-shot dispatch to refactor.
- `web/lib/automations/debtor-email/coordinator/types.ts` — source of truth for current intent enum.
- `web/lib/debtor-email/classify.ts` — the module `stage1_regex_module` will point at.
- `web/lib/automations/debtor-email/resolve-debtor.ts` — the module `stage2_entity_resolver` will point at.

### Project-level invariants
- `CLAUDE.md` — Inngest replay-safety + send-binding patterns; Supabase service-role for automation writes.
- `.planning/REQUIREMENTS.md` §SWRM-01..04 — the four acceptance bullets.
- `.planning/ROADMAP.md` Phase 68 entry (line 764).

### Database state at start of Phase 68 (verified live via Supabase MCP)
- `public.swarms` has columns: swarm_type, display_name, description, review_route, source_table, enabled, ui_config, **side_effects (already exists, jsonb, nullable, currently NULL)**, created_at, updated_at. Phase 68 ADDs 4 columns + optionally `entity_brand`.
- `public.swarm_categories` exists (Stage 1 → 2 dispatch registry; do NOT modify).
- `public.swarm_intents` does NOT exist; Phase 68 creates it.
- One `swarms` row exists: `debtor-email`. Phase 68 backfills its new columns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`loadSwarmCategories(admin, swarm_type)`** in `web/lib/swarms/registry.ts` — same pattern Phase 68 extends with `loadHandlerEvent`, `loadSideEffects`, `loadCanonicalContextShape`.
- **`swarms.side_effects` column already exists** — Phase 67 anticipated this; Phase 68 just populates it. Saves one migration.
- **`loadAgentSpec(agent_key)`** (Phase 65) — pattern for `stage3_coordinator_agent_key` lookup.
- **Phase 67 migration template** — same letter-suffix convention (`20260504b_...`).

### Established Patterns
- **Registry-driven dispatch via `swarm_categories.swarm_dispatch`** — verdict-worker line 162-174 already does this for Stage-1-output events. Phase 68 generalises the same pattern to Stage 2 + Stage 3 outputs.
- **Inngest function naming** + **migration letter-suffix convention** (`20260504a`, `20260504b`).
- **Supabase MCP `apply_migration` workflow** (Phase 67 precedent — works without operator running CLI).

### Integration Points
- One migration file → adds 4-5 columns + one new table.
- `web/lib/swarms/registry.ts` is the single registry-helper module — all new exports land here.
- 4 call sites change in `web/lib/inngest/functions/`.
- Zero new Inngest functions; zero new events.
- Zero Orq.ai agent CRUD.

</code_context>

<specifics>
## Specific Ideas

- **No "v2 sales-email" implementation in this phase.** Phase 68 only proves the registry shape supports a second swarm via a synthetic test row. Phase 73 builds the actual sales-email swarm.
- **`canonical_context_shape` is stored but not yet consumed.** Phase 69 wires handlers to read it. Phase 68 ships it on the registry so Phase 69 can reference it as the contract source.
- **`swarm_intents.handler_agent_key` may be NULL** for intents whose handler doesn't exist yet (e.g. `payment_dispute`). The registry lookup is null-safe; the orchestrator fails the run with a clear "no handler for intent X" error if `handler_agent_key` is null and orchestration is required.
- **Database referential integrity:** `swarm_intents.swarm_type` references `swarms.swarm_type` with `ON DELETE CASCADE`. Deleting a swarm row cleans up its intent rows.
- **Test fixtures:** Wave 4's synthetic `sales-email-stub` row demonstrates SWRM-03 by inserting a fully-populated swarm + 3 stub intents and running `loadSwarmRegistry("sales-email-stub")` to confirm the read path returns the row. The actual handler/coordinator work is Phase 73's; the test is read-only.

</specifics>

<deferred>
## Deferred Ideas

- **Handler-agent canonicalisation** (consume `canonical_context_shape`, parameterise `entity_brand`) → Phase 69 (CANO-*).
- **`pipeline_events` runtime telemetry** → Phase 70 (TELE-*) — Phase 68's `side_effects[]` execution will emit pipeline events when telemetry exists.
- **Override learning loop / `promotion_candidates`** → Phase 71 (LERN-*).
- **Sales-email swarm implementation** → Phase 73.
- **Stage 1 worker for `classifier/screen.requested`** → still deferred from Phase 66.
- **Migration of `swarm_categories` rows into `swarm_intents`** — intentionally NOT done; they serve different stages.
- **`findMessageRow` pagination** — carried from Phase 67; not Phase 68's concern.

</deferred>

---

*Phase: 68-swarm-registry-generalisation-canonical-context-shape*
*Context gathered: 2026-05-04 (auto mode)*
