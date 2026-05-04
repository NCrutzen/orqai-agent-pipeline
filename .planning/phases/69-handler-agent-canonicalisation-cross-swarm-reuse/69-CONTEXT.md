# Phase 69: Handler-agent canonicalisation (cross-swarm reuse) — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** `--auto` (Claude selected recommended option for each gray area; user can revise before plan-phase)

<domain>
## Phase Boundary

Refactor the existing Stage 4 handler agent `debtor-copy-document-body-agent` so it consumes the canonical `PipelineStageContext` shape (Phase 68 contract) and reads its brand list from the `swarms.entity_brand` registry, instead of hardcoding the 5-entity ENTITY enum + an inline `<entity_register>` block in its Orq.ai prompt. After Phase 69, onboarding a new brand (UK/IE backlog 999.1, or sales-email Phase 73) is a single registry INSERT — zero agent prompt edits, zero TS enum changes.

In scope (CANO-01..04):

1. **CANO-01:** `debtor-copy-document-body-agent` accepts the canonical context shape from Phase 68's `swarms.canonical_context_shape`. Input contract becomes `PipelineStageContext + intent_specifics + brand_register` (per-brand metadata fetched from registry at invocation time). The `<entity_register>` block in the system prompt is replaced by a parameterised template that interpolates a single brand's register/signoff/formal-address strings.
2. **CANO-02:** Brand list driving handler prompts is sourced from `swarms.entity_brand` registry rows (Phase 68 D-Discretion-3 seeded `["smeba", "smeba-fire", "sicli-noord", "berki", "iccafe", "iccafe-france"]`). Phase 69 expands the shape from a flat string array into a richer per-brand metadata structure so the prompt has what it needs (signoff, register language, formal-address phrase). The TS `ENTITY` enum at `web/lib/automations/debtor-email/coordinator/types.ts:9-15` is **deleted** (or aliased as a deprecated re-export of the registry read) — registry is the source of truth.
3. **CANO-03:** Mark Stage 4 handler agents that are domain-agnostic with `swarm_type='cross-cutting'` in `public.orq_agents`. For Phase 69 the only canonicalised agent is `debtor-copy-document-body-agent` → flip its row to `swarm_type='cross-cutting'`. Per-swarm specialisation (e.g. an NXT-specific resolver agent) keeps its concrete `swarm_type`.
4. **CANO-04:** Validate the canonicalisation by inserting a synthetic UK-brand row (e.g. `smeba-uk`) into `swarms.entity_brand` + a fixture sales-email run; confirm the body agent produces correct output (English register, GB-formatted brand name, correct signoff) without ANY prompt edit.

Out of scope (explicitly deferred):

- **`pipeline_events` runtime telemetry** — Phase 70 (TELE-*).
- **Override learning loop / `promotion_candidates`** — Phase 71 (LERN-*).
- **Sales-email swarm implementation** — Phase 73. Phase 69 only adds sales-email fixtures for regression; it does NOT build the resolver/coordinator/handler wiring for sales-email.
- **New handler-agents** (payment-dispute, address-change, contract-inquiry, credit-request, peppol-request, general-inquiry) — opvolg-milestone.
- **Actual UK/IE mailbox onboarding** (Zapier setup, Outlook subscriptions) — separate operational milestone.
- **Per-handler agent canonicalisation beyond `debtor-copy-document-body-agent`** — only the body agent has documented entity_register hardcoding today (verified by grep on `web/lib/automations/orq-agents/` and `web/lib/inngest/functions/`); other Stage 4 events fan out to handlers that don't yet exist (D-09 left their `handler_agent_key` NULL). When those land they are born-canonical.

</domain>

<decisions>
## Implementation Decisions

### Brand registry shape expansion (CANO-02)

- **D-01: Expand `swarms.entity_brand` from `text[]` (per Phase 68 seed shape) to `jsonb` with per-brand metadata.** New shape:
  ```jsonc
  [
    {
      "code": "smeba",
      "display_name": "Smeba",
      "register_language": "nl",
      "register_dialect": "nl-NL",
      "signoff_phrase": "Met vriendelijke groet",
      "formal_address": "u",
      "nxt_database_alias": "smeba",
      "icontroller_company": "smeba"
    },
    {
      "code": "sicli-noord",
      "display_name": "Sicli Noord",
      "register_language": "nl",
      "register_dialect": "nl-BE",
      "signoff_phrase": "Met vriendelijke groet",
      "formal_address": "u",
      "nxt_database_alias": "sicli-noord",
      "icontroller_company": "sicli-noord"
    },
    {
      "code": "sicli-sud",
      "display_name": "Sicli Sud",
      "register_language": "fr",
      "register_dialect": "fr-BE",
      "signoff_phrase": "Cordialement",
      "formal_address": "vous",
      "nxt_database_alias": "sicli-sud",
      "icontroller_company": "sicli-sud"
    }
    // berki, smeba-fire, iccafe, iccafe-france backfilled identically.
  ]
  ```
  Migration `supabase/migrations/20260505a_entity_brand_expansion.sql` does:
  - `ALTER TABLE swarms ALTER COLUMN entity_brand TYPE jsonb USING to_jsonb(entity_brand)` (text[] → jsonb in one step; data preserved as a jsonb array of strings).
  - Then `UPDATE swarms SET entity_brand = $1::jsonb WHERE swarm_type = 'debtor-email'` with the fully-populated array.
  - Idempotent: migration first checks current shape (`jsonb_typeof((entity_brand)->0)`); if already `'object'` it skips.

- **D-02: Brand metadata fields are stable; new fields are additive.** `code` is the brand identity used everywhere downstream (Stage 2 resolver writes it into `PipelineStageContext.entity_brand`, body agent reads it via `brand_register.code`). Adding new fields (e.g. `phone_number`, `vat_number`) is non-breaking; renaming or removing a field is a registry-version bump. No `version` column on the row itself today — Phase 70's `pipeline_events` will record the canonical_context_shape version which covers it.

- **D-03: Replace the TS `ENTITY` enum** at `web/lib/automations/debtor-email/coordinator/types.ts:9-15` with a registry-driven type. Concrete approach: keep the literal-union TS type for compile-time safety BUT generate it from the registry at build time via a small codegen script (`scripts/gen-entity-types.ts`) that reads `swarms.entity_brand` and writes a generated `web/lib/automations/debtor-email/coordinator/entity.generated.ts` exporting `type Entity = "smeba" | "sicli-noord" | ...`. Run in CI + as a `npm run codegen` step. Why: keeps strict TS types AND zero-edit onboarding (run codegen after registry INSERT; no manual enum edit). Alternative considered (drop enum, use `string`) is rejected because it loses too much type safety for handler call-sites that switch on entity.

### Body-agent prompt refactor (CANO-01)

- **D-04: Body-agent input shape changes from `email_entity: Entity` (5-value enum) to `brand_register: BrandRegister` (full metadata object).** New invocation contract from `classifier-invoice-copy-handler.ts:280`:
  ```typescript
  const inputs = {
    // PipelineStageContext fields (from Phase 68 canonical shape):
    customer_id: ...,
    customer_name: ...,
    language: ...,
    entity_brand: brandRegister.code,         // string, registry-driven
    recent_documents: [...],
    context_version: 1,

    // Per-invocation brand metadata (resolved from registry):
    brand_register: {
      code: "smeba",
      display_name: "Smeba",
      register_language: "nl",
      register_dialect: "nl-NL",
      signoff_phrase: "Met vriendelijke groet",
      formal_address: "u",
    },

    // Intent-specifics (unchanged from today):
    intent_result_intent: "copy_document_request",
    intent_result_sub_type: "invoice",
    intent_result_document_reference: invoiceRef,
    fetched_document_*: { ... },

    // Email surface (unchanged):
    email_subject, email_body_text, email_sender_*, email_mailbox,

    // Behavioural:
    body_version: BODY_VERSION,
    emotion_trigger_match,
  };
  ```
  Removed inputs: `email_entity` (replaced by `entity_brand` + `brand_register`), `email_language` (replaced by `language` + `register_language`).

- **D-05: Body-agent system prompt changes (Orq.ai update).** The current `<entity_register>` block (5 hardcoded `<entity code="...">...</entity>` children) is replaced with a single `<brand_register>` block templated from the input:
  ```xml
  <brand_register>
    <code>{{brand_register.code}}</code>
    <display_name>{{brand_register.display_name}}</display_name>
    <register_language>{{brand_register.register_language}}</register_language>
    <register_dialect>{{brand_register.register_dialect}}</register_dialect>
    <signoff>{{brand_register.signoff_phrase}}</signoff>
    <formal_address>{{brand_register.formal_address}}</formal_address>
  </brand_register>
  ```
  The agent is instructed: "Draft the reply body using `{{brand_register.register_language}}` (`{{brand_register.register_dialect}}` dialect). Address the customer using `{{brand_register.formal_address}}`. End with `{{brand_register.signoff}}`." The agent never sees the union of brands — only the one brand for this invocation.

- **D-06: Agent prompt update applied via the Orq.ai create→patch pattern** (per CLAUDE.md "Orq.ai" section): use `mcp__orqai-mcp__update_agent` to PATCH the existing `debtor-copy-document-body-agent` (do NOT delete + recreate; that loses the agent's analytics history and orqai_id). Verify with `get_agent` after update. Run `list_models` first to confirm the model ID hasn't drifted (per CLAUDE.md learning `f980a2a1-...`).

- **D-07: Output schema unchanged.** The `bodyAgentOutputSchema` (`web/lib/automations/debtor-email/coordinator/types.ts`) keeps its current fields. Phase 69 changes the *input* shape and *prompt template*, not the output. This means the output-adapter (`output-adapter.ts`) and synthesis fan-in (Phase 65) keep working without edits.

### Cross-cutting `swarm_type` declaration (CANO-03)

- **D-08: Mark `debtor-copy-document-body-agent` as `swarm_type='cross-cutting'` in `public.orq_agents`.** Migration `supabase/migrations/20260505b_orq_agents_cross_cutting.sql`:
  ```sql
  UPDATE public.orq_agents
  SET swarm_type = 'cross-cutting'
  WHERE agent_key = 'debtor-copy-document-body-agent';
  ```
  No schema change needed — `swarm_type` is already free-text per Phase 65 / 68. Convention: `swarm_type IN ('debtor-email', 'sales-email', 'cross-cutting')` for now; future swarms add their own value.

- **D-09: Lookup pattern: `loadAgent(agent_key)` stays unchanged.** The orq-agents client (`web/lib/automations/orq-agents/client.ts:35`) already keys on `agent_key`, not `swarm_type`. `swarm_type='cross-cutting'` is a tagging hint for tooling and Bulk Review filters — it does NOT change the runtime read path. No code change in `client.ts` required.

- **D-10: No other agents are flipped in Phase 69.** The body agent is the only agent today whose prompt contains the brand union. The `debtor-intent-agent` (coordinator) is per-swarm by design (it interprets debtor-specific intent vocabulary) and stays `swarm_type='debtor-email'`. Future Stage 4 handlers (payment-dispute, etc.) are born-canonical when they land.

### Brand-register lookup module

- **D-11: New module `web/lib/swarms/brand-register.ts`** exports:
  ```typescript
  export interface BrandRegister {
    code: string;
    display_name: string;
    register_language: 'nl' | 'fr' | 'en' | 'de';
    register_dialect: string;
    signoff_phrase: string;
    formal_address: string;
    nxt_database_alias: string;
    icontroller_company: string;
  }

  export async function loadBrandRegister(
    swarm_type: string,
    brand_code: string
  ): Promise<BrandRegister>;

  export async function loadAllBrandRegisters(
    swarm_type: string
  ): Promise<BrandRegister[]>;
  ```
  Implementation reads `swarms.entity_brand` jsonb, finds the row matching `brand_code`, returns it. Cached with module-level Map keyed by `(swarm_type, brand_code)`; cache invalidation = Vercel cold start (same pattern as Phase 68 `loadSwarmCategories`). Throws structured error if `brand_code` not found in registry — no defensive fallback (Phase 68 D-12 precedent).

- **D-12: Stage 2 resolver populates `entity_brand` (string code) into `PipelineStageContext`; Stage 4 handlers call `loadBrandRegister(swarm_type, ctx.entity_brand)` to get the metadata.** Why split: keeping the register lookup at Stage 4 (not embedding the full metadata in `PipelineStageContext`) keeps the cross-stage payload small and lets each handler decide which register fields it actually needs. The body agent uses signoff + formal_address; future handlers may use other fields without changing the upstream contract.

### Code-edit scope

- **D-13: Files modified:**
  - `web/lib/automations/debtor-email/coordinator/types.ts` — generate `Entity` type from registry (codegen output); remove the inline `ENTITY = [...]` literal.
  - `web/lib/inngest/functions/classifier-invoice-copy-handler.ts:255-284` — replace `inferLanguageFromEntity(entity)` + `email_entity: entity` with `loadBrandRegister(...)` call + new input shape (D-04).
  - `web/lib/automations/debtor-email/handlers/output-adapter.ts` — verify still passes through unchanged (D-07).
  - `web/lib/swarms/brand-register.ts` — new module (D-11).
  - `web/lib/swarms/registry.ts` — add `loadEntityBrand` and `loadEntityBrandRegister` exports.
  - `scripts/gen-entity-types.ts` — new codegen script (D-03).
  - `package.json` — add `codegen` npm script.
  - `supabase/migrations/20260505a_entity_brand_expansion.sql` — D-01 migration.
  - `supabase/migrations/20260505b_orq_agents_cross_cutting.sql` — D-08 migration.

- **D-14: Body agent prompt update is a separate Orq.ai operation, not a code commit.** Use `mcp__orqai-mcp__update_agent` from the Phase 69 execution session. Verify with `get_agent`. Record the diff (before/after prompt) in the phase summary for audit.

### Regression tests + UK/IE fixture (CANO-04)

- **D-15: Regression fixtures live in `web/lib/automations/debtor-email/__tests__/canonicalisation/`:**
  - `debtor-fixtures/` — 6 fixtures, one per existing brand (smeba, smeba-fire, sicli-noord, sicli-sud, berki, iccafe). Each fixture: input email + expected `bodyAgentOutput` shape. Body agent invoked end-to-end via `classifier-invoice-copy-handler` test harness; output compared against expected for register language, signoff, formal address.
  - `sales-fixtures/` — 3 synthetic sales-email fixtures using a synthetic `sales-email-stub` swarm row (extends Phase 68 D-Wave 4). Same body agent, different swarm context, English register; verifies the agent works for a non-debtor swarm without prompt edits.
  - `uk-ie-fixture/` — 1 fixture using a synthetic `smeba-uk` brand row inserted ONLY in the test setup (rolled back in teardown). English register, GB dialect, "Kind regards" signoff. Verifies CANO-04 zero-prompt-edit onboarding.

- **D-16: Regression test gate.** Before Phase 69 closes: all 10 fixtures pass; body agent produces register-correct output. Failure on any fixture = ship-blocker.

- **D-17: Smoke test against live Orq.ai is required** (per Phase 65 learning `dae6276` — mocks pass while live integration breaks). One live invocation per swarm category (debtor + sales-stub + UK fixture) at end of execution wave; confirm Orq returns valid JSON, register matches expectation, no `400 Invalid JSON detected` errors.

### Cutover sequencing

- **D-18: Single PR; sequential waves:**
  - **Wave 0:** Migration files (D-01, D-08) + brand-register module skeleton (D-11) + codegen script (D-03) + test scaffolds. No live changes.
  - **Wave 1:** Apply migrations via Supabase MCP (operator-gated checkpoint, same pattern as Phase 67/68); verify `swarms.entity_brand` shape and `orq_agents.swarm_type='cross-cutting'` row.
  - **Wave 2:** Implement `web/lib/swarms/brand-register.ts` + extend `web/lib/swarms/registry.ts` + run codegen; commit generated type file. Unit tests for brand-register lookup.
  - **Wave 3:** Update `classifier-invoice-copy-handler.ts` to new input shape (D-04) + remove `inferLanguageFromEntity`. Unit tests for handler with mocked Orq.
  - **Wave 4:** Apply Orq.ai prompt update via MCP `update_agent` (D-06) + verify with `get_agent`. Operator-gated checkpoint: confirm prompt diff before applying.
  - **Wave 5:** Regression tests (D-15) + live smoke (D-17). UK/IE fixture confirms CANO-04.
  - **Wave 6:** Documentation update — `docs/agentic-pipeline/stage-4-handler.md` (mark CANO-01..04 as IMPLEMENTED, not RFC), `docs/debtor-email-pipeline-architecture.md` (update body-agent section), update `CLAUDE.md` if any new patterns emerge.

### Backwards-compat / migration risk

- **D-19: No backwards-compat shim for `email_entity` input.** The body agent prompt + invocation site are updated atomically in the same PR. The agent's old prompt + new prompt cannot coexist (Orq.ai stores one live version per agent). If a deploy ships the new prompt before the new code, in-flight Inngest events using old input shape will fail validation — Phase 65 replay-safe pattern (`dd2583a`) means failed runs surface as `automation_runs.status='failed'`, not silent corruption. Mitigation: deploy Vercel first (new code path uses new shape) then apply Orq prompt update (Wave 3 → Wave 4 ordering). Window of risk: ~minutes; acceptable given debtor-email volume.

- **D-20: No removal of legacy `swarms.entity_brand` text[] handling.** Migration converts in place (D-01); old shape never persists post-migration. No code reads `entity_brand` as `text[]` today (Phase 68 only seeded it; Phase 69 is first reader).

### Claude's Discretion

- Whether to keep the codegen script as TS (run via tsx) or compile it to plain JS — planner picks. Recommendation: TS via tsx, matches existing `scripts/` convention.
- Exact wording of the new prompt's `<brand_register>` block — copywriter's call within the constraints of D-05. Recommendation: planner drafts; operator reviews diff at Wave 4 checkpoint.
- Whether `loadBrandRegister` cache is per-process Map or shared via Supabase RT — planner picks. Recommendation: per-process Map (Phase 68 D-15 precedent); brand metadata changes rarely.
- Whether to keep `INTENT_VERSION` / `BODY_VERSION` constants or bump them — planner picks. Recommendation: bump `BODY_VERSION` to `"2026-05-04.v2"` so `agent_runs` rows produced before/after the prompt update are distinguishable in audit.
- Whether the synthetic `sales-email-stub` swarm row used for sales fixtures stays in the database or is created/torn down per test run — planner picks. Recommendation: created in test setup, torn down in teardown (no permanent stub row in production DB).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 69 architecture inputs
- `docs/agentic-pipeline/README.md` — v8.0 5-stage funnel; canonical Stage boundaries.
- `docs/agentic-pipeline/context-shape-contract.md` — Stage 2 → 3 handoff contract; **`entity_brand` is the field Phase 69 makes data-driven**.
- `docs/agentic-pipeline/stage-4-handler.md` — Stage 4 handler contract; Phase 69 marks CANO-01..04 as IMPLEMENTED.
- `docs/debtor-email-pipeline-architecture.md` — debtor-email implementation map; body-agent section gets updated.

### Phase predecessors (Phase 69 builds on these)
- `.planning/phases/68-swarm-registry-generalisation-canonical-context-shape/68-CONTEXT.md` — registry generalisation; specifically D-Discretion-3 (`swarms.entity_brand` seeded with 6-brand list) and D-05 (`canonical_context_shape` jsonb).
- `.planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-CONTEXT.md` — defines V2 intent enum and `agent_runs` orchestrator-fan-in pattern Phase 69 must keep working.

### Existing code Phase 69 modifies
- `web/lib/inngest/functions/classifier-invoice-copy-handler.ts` (esp. lines 42, 249-284, 437-439) — input shape and `inferLanguageFromEntity` replacement.
- `web/lib/automations/debtor-email/coordinator/types.ts` (lines 9-15) — `ENTITY` enum source of truth, replaced by codegen.
- `web/lib/automations/debtor-email/handlers/output-adapter.ts` — verified unchanged (D-07).
- `web/lib/swarms/registry.ts` — extended with `loadEntityBrand` / `loadEntityBrandRegister`.
- `web/lib/automations/orq-agents/client.ts` (lines 35-55) — `loadAgent(agent_key)` keeps working unchanged (D-09).

### Existing code Phase 69 reads but does NOT modify
- `web/lib/automations/debtor-email/resolve-debtor.ts` — Stage 2 resolver writes `entity_brand` code into `PipelineStageContext`; no edit needed if Phase 68 wave 3 already routed it through.
- `web/lib/automations/debtor-email/coordinator/detect-emotion.ts` — language-driven; uses canonical `language` field, not entity-specific.

### Project-level invariants
- `CLAUDE.md` — Orq.ai create→patch pattern (learning `cba7352b-...`); list_models pre-flight (`f980a2a1-...`); strict-mode `anyOf` for nullable; Inngest replay-safety + send-binding patterns.
- `.planning/REQUIREMENTS.md` §CANO-01..04 — the four acceptance bullets.
- `.planning/ROADMAP.md` Phase 69 entry.

### Database state at start of Phase 69 (must verify live via Supabase MCP)
- `public.swarms.entity_brand` exists from Phase 68. Phase 68 D-Discretion-3 recommended seed `["smeba", "smeba-fire", "sicli-noord", "berki", "iccafe", "iccafe-france"]` — **verify live shape (text[] vs jsonb of strings vs jsonb of objects) before drafting D-01 migration**. If Phase 68 already seeded as jsonb-of-objects with the metadata fields, D-01 is a no-op.
- `public.swarms.canonical_context_shape` exists from Phase 68 D-05. Phase 69 reads it but does not modify.
- `public.orq_agents` row `agent_key='debtor-copy-document-body-agent'` exists with `swarm_type='debtor-email'`. Phase 69 flips to `'cross-cutting'`.
- Orq.ai live agent `debtor-copy-document-body-agent` — current prompt contains `<entity_register>` block. Capture the prompt verbatim before Wave 4 (audit baseline).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`loadSwarmCategories(admin, swarm_type)`** in `web/lib/swarms/registry.ts` — pattern for `loadEntityBrand` extension.
- **`loadAgent(agent_key)`** in `web/lib/automations/orq-agents/client.ts:35` — already keys on agent_key (not swarm_type), so D-08 swarm_type flip is purely organisational, not runtime-affecting.
- **Phase 68 migration template** (`20260504b_swarms_registry_generalisation.sql`) — same letter-suffix convention for D-01 (`20260505a_...`) and D-08 (`20260505b_...`).
- **Phase 65 orchestrator-fan-in pattern** in `classifier-invoice-copy-handler.ts:55-94` — `notifyOnExitIfOrchestrator` wrapper stays intact; Phase 69's input-shape change is upstream of it.
- **Replay-safe patterns** (CLAUDE.md Phase 65 learning): all non-deterministic ID generation inside `step.run`; no destructure of `inngest.send`. Phase 69 changes don't introduce new ID generation but the brand-register lookup is async and goes inside an existing `step.run`.

### Established Patterns
- **Registry-driven lookups via Supabase service-role client** — `loadSwarmCategories` precedent.
- **Orq.ai create→patch + verify** for agent prompt updates (CLAUDE.md learning `cba7352b-...`).
- **Module-level Map cache, invalidated via Vercel cold start** — Phase 68 D-15 precedent.
- **Migration letter-suffix convention** (`20260505a`, `20260505b`).
- **Codegen-from-DB for type safety** — new pattern in this phase; pattern itself is well-established (e.g. Supabase's own `supabase gen types typescript`).

### Integration Points
- Two migration files (D-01, D-08).
- One new module (`brand-register.ts`); two extended modules (`registry.ts`, `classifier-invoice-copy-handler.ts`).
- One Orq.ai agent prompt update (live, via MCP).
- One codegen script + npm script.
- Zero new Inngest functions; zero new Inngest events; zero changes to Stage 2 resolver, Stage 3 coordinator, or synthesis worker.
- One existing `agent_runs` schema; no DB changes there.

</code_context>

<specifics>
## Specific Ideas

- **Body agent only sees one brand at a time** — the prompt does NOT contain the union of all brands. This is the key design decision: it makes the prompt fully data-driven. Stage 2 resolver decides which brand applies; Stage 4 handler renders for that one brand. Adding a brand = registry INSERT, no prompt change.
- **`bodyAgentOutputSchema` shape stays frozen.** Phase 69 changes inputs and prompt template, not outputs. This is what keeps `output-adapter.ts` and synthesis fan-in (Phase 65 plumbing) untouched.
- **The codegen script is the bridge between "registry as source of truth" and "TS strict typing".** Run in CI; failure = build fails. Operator never edits `entity.generated.ts` by hand.
- **Test fixture for UK brand uses `smeba-uk` as the canonical name** — matches the Phase 999.1 backlog naming. The fixture inserts the row in test setup only; it does NOT pollute the production seed.
- **Live smoke against Orq.ai is non-negotiable.** Phase 65 commit `dae6276` proved that mock-only tests can hide a TypeError that breaks every live invocation. Phase 69 risk surface (new input shape, new prompt template, JSON schema validation) is exactly the class of change where live smoke catches things mocks miss.
- **Audit baseline: capture the body agent's current Orq.ai prompt verbatim before Wave 4.** Save to `.planning/phases/69-handler-agent-canonicalisation-cross-swarm-reuse/orq-baseline-prompt.txt` so the diff is reviewable post-deploy.
- **`swarm_type='cross-cutting'` is enforced by convention, not constraint.** Phase 69 does not add a CHECK constraint to `orq_agents.swarm_type`. If Phase 73 (sales-email) needs to enforce, it can add the constraint then. YAGNI today.

</specifics>

<deferred>
## Deferred Ideas

- **Per-handler agent canonicalisation for handlers that don't yet exist** (payment-dispute, address-change, contract-inquiry, etc.) — opvolg-milestone. Those agents are born-canonical when they land.
- **CHECK constraint on `orq_agents.swarm_type` enum** — deferred until a second cross-cutting agent exists or Phase 73 sales-email lands and the convention needs enforcement.
- **`swarms.entity_brand` history / audit table** — promotion-recommender concern (Phase 71+). Today: registry edits go through migration commits; git history is the audit.
- **Unified `entity_brands` separate table** (instead of jsonb on `swarms`) — would normalise per-brand metadata and allow joins, but adds a second table to maintain. Defer until cross-swarm shared brand catalog is needed (e.g. UK Smeba mailbox shared between debtor-email and sales-email). Today, brands are 1:1 with swarm; jsonb is sufficient.
- **Localisation tooling** (i18n message catalogs for signoff phrases, register variations) — outside Phase 69 scope. The brand-register fields are sufficient for the body agent's needs today.
- **Removal of `inferLanguageFromEntity` heuristic globally** — Phase 69 removes its only call site. If the helper has other callers (verify before deletion), they migrate to `loadBrandRegister(...).register_language`.

</deferred>

---

*Phase: 69-handler-agent-canonicalisation-cross-swarm-reuse*
*Context gathered: 2026-05-04 (auto mode)*
