# Phase 113: Stage 3 Sales Intent Agent (greenfield) — Research

**Researched:** 2026-06-05
**Domain:** Cross-swarm agentic-pipeline Stage 3 onboarding (Orq intent classifier + registry-driven dispatch + data-driven vocabulary seeding)
**Confidence:** HIGH — the entire pattern is proven in-tree (debtor swarm), the shared code is already generalized for cross-swarm use (Phase 110/80), and live DB state was verified this session.

## Summary

Phase 113 onboards `sales-email` as the second swarm through the v8.0 5-stage funnel's Stage 3. The architectural work is **almost entirely registry + data**, not code: the shared classifier (`debtor-email-coordinator.ts`) and dispatcher (`stage-3-dispatcher.ts`) were generalized in Phases 80 and 110 to derive `swarm_type` per-invocation and route via the `swarm_intents` registry with zero hardcoded swarm names. Onboarding = (1) a new Orq `sales-intent-agent` row + Studio json_schema, (2) `swarm_intents` rows seeded from the live corpus via the Phase 86/87 retro machinery + operator promotion, (3) `swarms.stage3_coordinator_agent_key` set (already done in DB), (4) a thin sales `invoke-intent.ts` + a sales retro-classify Inngest function mirroring debtor's, and (5) opening the per-stage dry-run gate after an operator green-light.

The single net-new shared-shape change is the nullable, swarm-agnostic `entity_relationship` axis (D-05) added to the ranked-output schema — it must be additive (nullable, debtor ignores it) so it does not force edits to the dispatcher or Bulk Review read path. Everything else reuses existing surfaces.

**Verified live state this session:** `swarms.stage3_coordinator_agent_key='sales-intent-agent'` is ALREADY SET; `stage2_entity_resolver` is wired; `swarm_intents` for sales is EMPTY (the inert guard keeping Stage 3 no-op); `intent_proposals_v1` + `intent_proposal_clusters` for sales are EMPTY (0 rows — the discovery surface has never been populated for sales); the `sales-intent-agent` row does NOT yet exist in `orq_agents` (only debtor + cross-cutting agents present); sales `pipeline_events` has Stage 0 (912) + Stage 1 (88) rows but ZERO Stage 3 rows. The corpus is larger than the "827" figure: 933 Outlook `verkoop@smeba.nl` rows all-time, 933 in the last 30d, plus 34,725 historic SugarCRM rows.

**Primary recommendation:** Treat this as a "registry + data + one additive schema field" phase. Write NO new classifier/dispatcher code. Build (a) the sales coordinator support files (`invoke-intent.ts`, `assemble-input.ts` reuse, `types.ts` with the V3-shape + `entity_relationship`), (b) a `sales-email-stage-3-retro-classify.ts` Inngest function mirroring `debtor-email-stage-3-retro-classify.ts`, (c) the Orq agent via scripted create→PATCH→verify, (d) ONE atomic migration with promoted `intent_key` rows + `npm run codegen` + json_schema enum update. Gate Kanban routing behind the existing `dry_run_config` per-stage gate; flip only after operator review of ~100 Bulk Review verdicts.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Vocabulary seeding pipeline (STAGE3-02)**
- **D-01:** Reuse the Phase 86/87 retro machinery. Build a sales retro-classify pass mirroring debtor's Phase 87 (`stage_3_retro_runs`, `debtor-email-stage-3-retro-classify.ts` as analog) that runs the open-set discovery agent over the corpus; proposals land in the existing `intent_proposals_v1`/`intent_proposal_clusters` surface (`intent-proposals-refresh.ts`); the operator promotes. No one-shot mining script, no live-only discovery.
- **D-02:** Coverage threshold decides vocabulary size, not a fixed count: promote clusters until promoted intents cover a target share of the retro corpus (≈80% maps to a promoted intent; rest falls through to `other`). Data decides — honors the locked 2026-05-19 principle.
- **D-03:** Retro corpus = post-Stage-1 inbound only — normalized-inbound mail that survives (or would survive) the Stage 1 noise filter; reuse the Phase 111 sales retro candidate selector (`web/lib/automations/sales-email/retro/select-candidates.ts`) and its direction normalization. Noise stays out of the intent clusters.
- **D-04:** Batch migration after promotion. UI promotion is a decision record; the phase ships ONE migration with all promoted `intent_key` rows + `npm run codegen` + Orq agent json_schema enum update in a single atomic commit. No runtime registry writes from the promote action (avoids the enum drift-window where the deployed closed-list schema can't return a live-inserted intent).

**Customer-vs-prospect axis (consumes Phase 114 output)**
- **D-05:** Both prompt input AND output axis. Stage 2 resolution status (resolved customer + entity, or unresolved/likely-prospect) is passed as prompt context to the Intent Agent, AND the agent emits a swarm-agnostic `entity_relationship` axis (nullable, registry-friendly; e.g. resolved_entity / unresolved_known_pattern / unknown_third_party — exact values at planning) in its ranked output. Sales fills it now; debtor can adopt later without schema break. Design must be swarm-agnostic — this touches the shared ranked-output shape exactly once.
- **D-06:** Stage 3 reads resolution from the live PipelineStageContext envelope (the Stage 2→3 contract), NOT via a separate audit-table lookup. If Stage 2 is dry-run the envelope carries "unresolved" — that is the truth. No second read path.
- **D-07:** Batch-resolve the retro corpus first. Run the Phase 114 resolver in dry-run over the retro corpus before discovery so intent clusters can split by customer/prospect. This is the point of the 114-before-113 re-sequencing.

**Go-live gating & human-lane (STAGE3-03)**
- **D-08:** Dry-run observation first, then flip. Stage 3 classifies live but verdicts are visible only in Bulk Review (per-stage dry-run gate from Phase 110 D-10 stays closed); Kanban routing opens only after operator green light. Shadow→promote pattern (Phase 111; archive-incident lesson).
- **D-09:** End-station of this phase = Kanban routing live after an operator-reviewed sample in Bulk Review. The human-lane IS the STAGE3-03 deliverable (operator console — salespeople keep working in Outlook per the 112.5 model). Flip is reversible via the registry gate; Kanban rows are additive, no irreversible writes.
- **D-10:** Green-light is an explicit operator decision recorded in the phase UAT; axis-3 overrides in Bulk Review are the correction signal during observation.

**Agent design & ranked output (STAGE3-01)**
- **D-11:** Open-set discovery rides in the same classifier call (debtor pattern): ranked closed-list + optional snake_case open-set proposal in one response. Proposals keep flowing after go-live via `intent-proposals-refresh`.
- **D-12:** Reuse the debtor intent-v3 ranked-list shape + XML prompt structure, extended with the nullable `entity_relationship` axis. The generic coordinator/Bulk Review read path already consumes the v3 shape — diverging would force shared-code edits that STAGE3-01 forbids. Prompt examples in Dutch from the retro clusters.
- **D-13:** Agent created/managed scripted via the Orq API: `create_agent` with bare model id → immediate PATCH with full `model.parameters` (incl. `response_format` strict json_schema with `anyOf` nullables) → `get_agent` verification. json_schema enum is a codegen artifact from `swarm_intents`. Note: json_schema *tool resources* require Studio (MCP has no tool CRUD) — follow the canonical CLAUDE.md JSON-enforcement workflow where Studio is unavoidable.

### Claude's Discretion
- **Model choice** for the sales-intent-agent: pick during planning using the debtor-intent-agent config as anchor; ALWAYS `list_models`-validated, standard fallback chain per CLAUDE.md catalog rules.
- **Operator sample size** for the go-live green light: pick a reasonable number during planning based on intent distribution in the retro data (~100 verdicts in Bulk Review was the discussed anchor; per-intent minimums optional).
- Exact `entity_relationship` axis values and where the axis persists (coordinator_runs / pipeline_events) — planning decides, hard constraint: swarm-agnostic + nullable + no shared dispatcher edits.
- Retro-run batching/cost control over the corpus (Inngest function vs script; respect the 40k hard-cap fail-loud pattern from `select-candidates.ts`).

### Deferred Ideas (OUT OF SCOPE)
- **SugarCRM sent-replies harvest + storage** — reference source for Stage 4 reply drafting. Must be secured BEFORE/independent of Phase 115. Own phase or V10.0.
- **Temporary chat-agent for employees** — consults harvested Sugar replies. Own phase.
- **Debtor adoption of the `entity_relationship` axis** — later phase; design here keeps it adoptable.
- **Outlook-categorie side-effect** — write Stage 3 intent as an Outlook category. Post-Sugar-cut-over / 112.5 activation.
- Stage 4 handlers (V11.0), debtor adoption of the new output axis, Sugar sent-replies harvest, chat-agent — all deferred.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STAGE3-01 | New Orq `sales-intent-agent` in `orq_agents`; `swarm_intents` rows seeded; `swarms.stage3_coordinator_agent_key` set; dispatch through existing registry-driven dispatcher with NO shared-code edits. | Shared `debtor-email-coordinator.ts` (wildcard `*/coordinator.requested`, swarm_type derived from payload) + `stage-3-dispatcher.ts` (wildcard `*/predicted`, `loadSwarmIntents`) are already generic. `stage3_coordinator_agent_key='sales-intent-agent'` is ALREADY set in DB. Onboarding recipe in `stage-3-coordinator.md` §"Adding a new swarm". Net-new: sales `invoke-intent.ts` + `orq_agents` row + Studio json_schema. See Architecture Patterns §1–3. |
| STAGE3-02 | Vocabulary seeded from corpus + Phase 86 open-set discovery — emerges from data + operator promotion, never hand-curated. | Phase 87 `debtor-email-stage-3-retro-classify.ts` is the exact analog; `intent_proposals_v1`/`intent_proposal_clusters`/`intent-proposals-refresh.ts` already exist (and are empty for sales). Coverage-threshold promotion → ONE atomic migration + codegen. See Architecture Patterns §4 + Don't Hand-Roll. |
| STAGE3-03 | Every post-Stage-1 sales email reaches a Stage 3 verdict; handler-less intents land in Kanban human-lane with a reason — zero silent dead-letters. | Dispatcher `placeholder` branch already inserts `automation_runs` (`automation='<swarm>-kanban'`, `result.kanban_reason='no_handler'`) and flips `agent_runs.status → routed_human_queue`. All sales intents seed with `handler_status='placeholder'` (no Stage 4 = V11.0). Gate Kanban flip via `dry_run_config`. See Architecture Patterns §3 + Common Pitfalls §1. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Intent classification (per-email) | API/Backend (Inngest `debtor-email-coordinator` shared classifier) | Orq.ai LLM Router | Stage 3 is a backend durable function; the LLM is invoked via Orq, but orchestration/persistence/state are backend-owned `[CITED: docs/agentic-pipeline/stage-3-coordinator.md]`. |
| Ranked-intent → handler dispatch | API/Backend (`stage-3-dispatcher` wildcard `*/predicted`) | Database (`swarm_intents` registry) | Routing source-of-truth is the registry table; dispatcher is branch-free `[VERIFIED: stage-3-dispatcher.ts read this session]`. |
| Vocabulary discovery + promotion | Database (`intent_proposals_v1`, `intent_proposal_clusters`) | Frontend (Bulk Review promote UI) | Discovery is a read-model refresh (Inngest cron) over telemetry JSONB; promotion is an operator decision recorded in the UI then materialized as a migration `[CITED: 113-CONTEXT.md D-01/D-04]`. |
| Customer/prospect resolution input | API/Backend (Stage 2 resolver, Phase 114) | — | Stage 3 reads the `PipelineStageContext` envelope from Stage 2; no second read path (D-06). |
| Human triage of handler-less intents | Frontend (Kanban human-lane / Bulk Review) | Database (`automation_runs`) | The human-lane IS the STAGE3-03 deliverable; rows are additive Kanban cards `[CITED: 113-CONTEXT.md D-09]`. |
| Go-live gating | Database (`swarms.dry_run_config`) | API/Backend (dry-run-gate helpers) | Per-stage governance map; missing flag = blocked (fail-closed) `[VERIFIED: dry-run-gate/index.ts + 20260603b migration read this session]`. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@orq-ai/node` | ^4.7.7 (in `web/package.json`) | Orq agent CRUD (create→PATCH→verify) for the management script ONLY | CLAUDE.md mandated sole LLM gateway. Hot path POSTs directly to the REST endpoint, not the SDK `[VERIFIED: web/package.json read this session]`. |
| `inngest` | ^3.54.0 | Durable orchestration around the Orq call + the retro-classify function | Existing pipeline runtime; replay-safe `[VERIFIED: web/package.json]`. |
| `zod` | ^4.3.6 | Mandatory client-side output validation (the `salesIntentOutputSchema` gate) | CLAUDE.md hard rule: Zod on every LLM response `[VERIFIED: web/package.json]`. NOTE: zod v4 — confirm `.regex()`/`.enum()` API parity with debtor types.ts (debtor uses the same import). |
| `@supabase/supabase-js` | (in tree) | Service-role writes to `swarm_intents`, `coordinator_runs`, `stage_3_retro_runs` | CLAUDE.md stack `[VERIFIED]`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | (in tree) | Run `gen-intent-types.ts` codegen + the Orq management script | `npm run codegen` already chains it `[VERIFIED: package.json scripts.codegen]`. |
| `promptfoo` | latest (`npm i -D`, AI-SPEC §5) | CI prompt-regression / enum-contract gate | Optional eval add per AI-SPEC; CLI-only, no account. `[ASSUMED]` — not yet in tree; verify before adding. |
| `dotenv` | (in tree) | Load `.env.local` in codegen + scripts | Existing pattern `[VERIFIED]`. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Orq.ai | LangGraph / direct Anthropic SDK | CLAUDE.md hard violation (no direct provider keys); would force a from-scratch rebuild of the shared classifier/dispatcher STAGE3-01 forbids touching. Rejected at the framework layer — see AI-SPEC §2. |
| Reuse Phase 86/87 retro machinery | One-shot mining script | D-01 explicitly forbids; loses operator-promotion + ongoing proposal flywheel. |

**Installation:** No new runtime dependency for the hot path. Only `npm i -D promptfoo` if the CI eval gate is built (AI-SPEC §5).

**Version verification (run before pinning anything new):**
```bash
npm view @orq-ai/node version    # confirm ^4.7.7 is still current
npm view promptfoo version       # if adding the eval gate
```
`[ASSUMED]` for promptfoo currency — not verified against npm this session (offline-leaning). The runtime stack is `[VERIFIED]` against `web/package.json`.

## Package Legitimacy Audit

> No NEW external runtime packages are introduced by this phase. The hot path and orchestration reuse already-installed, long-established packages. The only candidate addition is a dev-only CI tool.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@orq-ai/node` | npm | already in tree (^4.7.7) | n/a | github.com/orq-ai | not re-run (pre-installed) | Approved (in tree) |
| `inngest` | npm | already in tree (^3.54) | n/a | github.com/inngest/inngest-js | not re-run | Approved (in tree) |
| `zod` | npm | already in tree (^4.3.6) | n/a | github.com/colinhacks/zod | not re-run | Approved (in tree) |
| `promptfoo` | npm | dev-only candidate | n/a | github.com/promptfoo/promptfoo | NOT RUN this session | `[ASSUMED]` — planner must gate behind `checkpoint:human-verify` if the eval gate is built |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

*slopcheck was not run this session (no new runtime packages to vet; `promptfoo` is an optional dev tool). If the planner elects to add `promptfoo`, gate it behind a `checkpoint:human-verify` task and run `npm view promptfoo` + slopcheck first.*

## Architecture Patterns

### System Architecture Diagram

```
sales email (verkoop@smeba.nl)
        │
        ↓
[Stage 0 safety]  →  [Stage 1 noise filter]  ── noise key ──→ terminal (categorize/archive)
        │                     │
        │                     │ category_key='unknown' → swarm_dispatch
        │                     ↓  'sales-email/stage-2.customer-resolve.requested'
        │            [Stage 2 customer resolver]  (Phase 114; reuses shared resolver)
        │                     │   folds Phase 116 attachment text into body_text
        │                     │   emits PipelineStageContext (customer_id | null, entity_brand, ...)
        │                     ↓  '<swarm>/coordinator.requested'  (carries swarm_type='sales-email')
        │   ┌─────────────────────────────────────────────────────────────┐
        │   │ SHARED Stage 3 CLASSIFIER  (debtor-email-coordinator.ts)     │
        │   │  • derive swarm_type from event.data.swarm_type              │
        │   │  • assembleInput (XML <inbound_message>/<quoted_thread>, 8k)│
        │   │  • invoke Orq 'sales-intent-agent' (NEW invoke-intent.ts)    │
        │   │  • Zod-gate salesIntentOutputSchema (ranked + entity_rel)   │
        │   │  • persist coordinator_runs.ranked_intents + pipeline_events│
        │   │  • flip agent_runs.status classifying→predicted             │
        │   │  • emit 'sales-email/predicted'                             │
        │   └────────────────────────┬────────────────────────────────────┘
        │                            ↓ wildcard '*/predicted'
        │   ┌─────────────────────────────────────────────────────────────┐
        │   │ SHARED Stage 3.5 DISPATCHER  (stage-3-dispatcher.ts)        │
        │   │  • loadSwarmIntents('sales-email')  (registry)              │
        │   │  • top intent → handler_status                              │
        │   └───────────┬─────────────────────────────┬───────────────────┘
        │   (placeholder — every sales intent today)  (registered — none yet, V11.0)
        │               ↓                              ↓
        │   INSERT automation_runs                emit handler_event
        │   (sales-email-kanban,                  → Stage 4 handler (DEFERRED)
        │    kanban_reason='no_handler')
        │   flip → routed_human_queue
        │               ↓
        │   Kanban human-lane card  ← gated by dry_run_config until operator green-light
        │   + Bulk Review verdict row (dry-run observation surface)
        │
   [retro side-channel, OFFLINE]
   sales-email-stage-3-retro-classify.ts (NEW, mirrors Phase 87)
     → reconstructInput per email → invokeIntentAgent (sales) → stage_3_retro_runs
     → intent_proposals flow → intent_proposal_clusters → operator promotes → migration
```

### Recommended Project Structure
```
web/
├── lib/automations/sales-email/
│   ├── coordinator/
│   │   ├── invoke-intent.ts          # NEW — sales Orq /responses call; AGENT_KEY='sales-intent-agent'; Zod-gated
│   │   ├── types.ts                  # NEW — salesIntentOutputSchema (V3 shape + nullable entity_relationship)
│   │   └── intent.generated.ts       # the codegen ALREADY targets this debtor path; see Pitfall 3
│   ├── retro/
│   │   ├── select-candidates.ts      # EXISTS (Phase 111) — reuse for Stage-1 corpus selection
│   │   └── reconstruct-input.ts      # NEW — sales analog of debtor retro reconstruct (folds attachment text)
│   └── resolve-customer.ts           # EXISTS (Phase 114) — Stage 2 resolver
├── lib/inngest/functions/
│   ├── debtor-email-coordinator.ts   # SHARED Stage 3 classifier — READ-ONLY (zero edits)
│   ├── stage-3-dispatcher.ts         # SHARED dispatcher — ZERO edits (STAGE3-01)
│   └── sales-email-stage-3-retro-classify.ts  # NEW — mirrors debtor Phase 87 (D-01)
├── scripts/
│   ├── gen-intent-types.ts           # EXISTS — reads ALL swarms; regen after sales seed migration
│   └── orq/manage-sales-intent-agent.ts  # NEW — create→PATCH→get-verify (D-13)
supabase/migrations/
└── <ts>_phase113_sales_swarm_intents.sql  # promoted intent_key rows (atomic w/ codegen, D-04)
```

### Pattern 1: Cross-swarm Stage 3 onboarding (the canonical recipe)
**What:** A new swarm joins Stage 3 via registry rows + a thin per-swarm invoke wrapper — never by editing the shared classifier or dispatcher.
**When to use:** This entire phase.
**Steps (from `stage-3-coordinator.md` §"Adding a new swarm", verified against live code):**
1. `swarms` row exists (it does — `sales-email`, `enabled=true`).
2. INSERT `swarm_intents` rows (one per promoted intent, `handler_status='placeholder'`).
3. Sales noise keys already in `swarm_noise_categories` (13 rows verified — Stage 1 only).
4. A per-swarm classifier function emitting `<swarm_type>/predicted`. **Here the shared `debtor-email-coordinator.ts` IS that function** — it derives `swarm_type` from the payload and the sales Stage 2 producer threads `swarm_type='sales-email'` through. NO new classifier function needed; only the `invoke-intent.ts` the classifier calls is per-swarm (today it hardcodes `AGENT_KEY='debtor-intent-agent'` — see Open Questions for the dispatch mechanism).

```typescript
// Source: stage-3-dispatcher.ts (read this session) — branch-free, registry-driven.
const swarm_type = data.swarm_type ?? eventName.split("/")[0];   // zero hardcoded names
const intents = await step.run("load-intents", () => loadSwarmIntents(admin, swarm_type));
const intentRow = intents.find((i) => i.intent_key === top.intent) ?? null;
if (!intentRow) throw new Error(`no swarm_intents row for (${swarm_type}, ${top.intent})`);
// handler_status==='placeholder' → Kanban human-lane (every sales intent today)
```

### Pattern 2: V3 ranked-output shape + the additive `entity_relationship` axis
**What:** Reuse debtor's `intentAgentOutputSchemaV3` shape verbatim, extended with ONE nullable field.
**When to use:** Defining `salesIntentOutputSchema` (D-05/D-12).
**Critical constraint:** The new axis MUST be nullable so the shared read path (Bulk Review, dispatcher) ignores it on debtor rows — additive under the `context_version: 1` contract policy.
```typescript
// Source: debtor coordinator/types.ts (read this session) — V3 shape to mirror.
export const salesIntentOutputSchema = z.object({
  ranked: z.array(rankedSalesIntentEntry).min(1).max(5),
  language: z.enum(["nl","en","de","fr"]),
  urgency: z.enum(["low","normal","high"]),
  intent_version: z.literal(SALES_INTENT_VERSION),
  intent_proposal: z.string().max(64).regex(/^[a-z][a-z0-9_]*$/).nullable(),  // D-11 open-set
  proposal_reason: z.string().max(280).nullable(),
  entity_relationship: z.enum([/* exact values at planning */]).nullable(),    // D-05 — NEW, nullable
});
```
**json_schema mirror:** nullable fields use `{"anyOf":[{...},{"type":"null"}]}` — NEVER `{"type":["string","null"]}` (Orq validator rejects the array shorthand — CLAUDE.md learning `3970bad9`).

### Pattern 3: Retro-classify side-channel (Phase 87 analog)
**What:** A one-shot Inngest function that re-runs the sales intent agent over the corpus into `stage_3_retro_runs`, feeding the proposal/cluster surface — writes NOTHING to live pipeline tables.
**When to use:** Vocabulary seeding (D-01).
**Architectural locks (copied from `debtor-email-stage-3-retro-classify.ts`, read this session):** side-channel isolation (only `stage_3_retro_runs` + baseline writes), cache bypass (call `invokeIntentAgent` directly), R-04 precondition gate, replay-safe `run_id` inside `step.run`, per-email step returns ONLY token count.
**Difference for sales:** use the sales `select-candidates.ts` (Phase 111, already direction-normalized + 40k hard-cap) and a sales `reconstruct-input.ts` that folds Phase 116 attachment text into the body (see Pitfall 4).

### Anti-Patterns to Avoid
- **Adding a per-swarm branch to the classifier or dispatcher.** Per `stage-3-coordinator.md`: "if you find yourself adding per-swarm branches in the classifier or coordinator workers, that's a cross-swarm architecture bug, fix it upstream."
- **A sales intent key that also exists in `swarm_noise_categories`.** Hard-separation lock (RFC-locked). The 13 sales noise keys (e.g. `auto_reply`, `ooo_temporary`, `payment_admittance`, `unknown`) must NEVER appear in `swarm_intents`.
- **Making `entity_relationship` non-nullable.** Forces a breaking shared-shape change and a debtor migration STAGE3-01 forbids.
- **Runtime `swarm_intents` writes from the promote button.** D-04: promotion is a decision record; the closed-list json_schema can't return a live-inserted intent until the agent is re-PATCHed → drift window. Ship as ONE atomic migration + codegen + json_schema update.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-swarm Stage 3 classifier | A `sales-email-coordinator.ts` | The shared `debtor-email-coordinator.ts` (already wildcard + swarm-type-derived) | STAGE3-01 forbids edits; it is already generic (Phase 110 D-07). |
| Dispatch / Kanban routing | Sales-specific dispatch logic | `stage-3-dispatcher.ts` (`*/predicted`, `loadSwarmIntents`) | Branch-free, zero hardcoded swarm names; placeholder branch already does the no-handler Kanban insert. |
| Vocabulary mining | A one-shot mining script | Phase 87 retro-classify + `intent_proposals_v1`/`clusters` + `intent-proposals-refresh.ts` | D-01; gives operator promotion + ongoing flywheel; surface already exists (empty for sales). |
| Corpus candidate selection | New corpus query | `sales-email/retro/select-candidates.ts` (Phase 111) | Already handles dual-corpus (Outlook+SugarCRM), direction normalization, 40k fail-loud cap, dedup. |
| Intent enum drift management | Hand-maintained TS union | `gen-intent-types.ts` codegen (`npm run codegen && git diff --exit-code`) | 3-way invariant (TS ⇄ `swarm_intents` ⇄ json_schema); hand-editing any one is forbidden. |
| Input assembly / truncation | New XML builder | `coordinator/assemble-input.ts` (8k cap, quoted-thread truncation) | Proven; same shape the shared classifier feeds. |
| Per-stage go-live gating | A new dry-run boolean | `swarms.dry_run_config` + `dry-run-gate/index.ts` helpers | Fail-closed per-stage map; sales already seeded all-blocked. |
| Orq structured output | Prompt-only JSON | `response_format` strict json_schema + Zod double-gate | Prompt-only ≈ 15–20% failure (CLAUDE.md). |

**Key insight:** In this codebase the cross-swarm seam is so mature that "building Stage 3 for sales" is mostly INSERTs + one Orq agent + one thin invoke wrapper + one retro function. The temptation to copy debtor's coordinator into a sales file is the #1 architecture bug this phase can introduce.

## Runtime State Inventory

> This is a greenfield-onboarding phase (no rename/migration), but it activates a previously-inert swarm and seeds registries. The relevant "state" is registry + Orq + corpus readiness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `swarm_intents` for `sales-email` is EMPTY (verified). `intent_proposals_v1` + `intent_proposal_clusters` for sales = 0 rows (verified). `stage_3_retro_runs` will be populated by the new retro function. | Seed `swarm_intents` via migration (after promotion); run retro to populate proposals/clusters first. |
| Live service config | `swarms.stage3_coordinator_agent_key='sales-intent-agent'` ALREADY SET (verified). `swarms.dry_run_config` for sales = all stages blocked incl. `stage_2_resolution:true`, `stage_4_handlers:{}` (verified). Orq agent `sales-intent-agent` does NOT yet exist in `orq_agents` (verified — only debtor + cross-cutting present). | Create the Orq agent (D-13). Flip the relevant dry-run flag only after operator green-light. |
| OS-registered state | None — no Task Scheduler / pm2 / launchd involvement. Inngest functions are code-registered. | None — verified by absence of any cron/OS scheduling in scope. |
| Secrets/env vars | `ORQ_API_KEY` (Vercel env, already present — debtor uses it). `SUPABASE_SERVICE_ROLE_KEY`. No new secrets. | None new. |
| Build artifacts | `intent.generated.ts` is the codegen output; it already iterates ALL swarms (emits `SWARM_INTENTS_BY_SWARM` with `sales-email: []` today). Re-run `npm run codegen` after the seed migration. | Run codegen in the same atomic commit as the seed migration (D-04). |

**Phase 116 dependency status (HARD prereq, verify before planning execution):** Phase 116 migrations exist in git (`20260605_email_attachments.sql`, `20260605b`, `20260605d`) and the phase is marked complete in git log. The `email_pipeline.email_attachments` table EXISTS (confirmed — permission-denied error path proves existence vs. "table not found"). The `emails` table does NOT have an `extracted_text` column — Phase 116 D-11 folds attachment text into `body_text`/`body_full_text` at READ time (inline in `stage-2-customer-resolver.ts:84+`, via `selectResolverBody`/body-source), not as a stored column. **Action:** the sales `reconstruct-input.ts` for the retro pass MUST replicate the same attachment-folding the live Stage 2 resolver does, or the retro corpus will see less context than live. Flag for planning.

## Common Pitfalls

### Pitfall 1: Silent dead-letter (the STAGE3-03 failure)
**What goes wrong:** An email leaves Stage 1 but never reaches a visible Stage 3 verdict — a Zod-gate throw is swallowed, or a handler-less intent is dropped instead of routed.
**Why it happens:** The classifier runs `retries: 0`; a `.parse()` throw goes to the catch block. If the dispatcher can't find a `swarm_intents` row for the top intent, it throws (line 97–101).
**How to avoid:** (a) EVERY sales intent must have a `swarm_intents` row (the enum the agent can return MUST be a subset of seeded rows — the codegen invariant guarantees this if the json_schema enum is regenerated from the registry). (b) `other` must be a seeded intent with `handler_status='placeholder'` so the residual bucket routes to Kanban, never throws. (c) A Zod throw surfaces the row in Bulk Review with raw output + operator retry — confirm this path renders for sales.
**Warning signs:** `agent_runs.status` stuck in `classifying` > 5 min (classifier bug) or `predicted` > 5 min (dispatcher bug) — the two SQL health queries in `stage-3-coordinator.md`.

### Pitfall 2: Out-of-enum / noise-key leakage breaks the 3-way invariant
**What goes wrong:** The agent returns an intent string not in `swarm_intents`, or returns a Stage-1 noise key.
**Why it happens:** The Studio json_schema enum drifted from the `swarm_intents` rows, or a noise concept was seeded as an intent.
**How to avoid:** Regenerate the json_schema enum from the registry in the SAME atomic commit as the seed migration + codegen (D-04). Add a guard asserting `swarm_intents ∩ swarm_noise_categories = ∅` for sales. Server json_schema (≈98%) + client Zod (residual) is the two-layer defense.
**Warning signs:** Validation-failure rate spikes (debtor saw ~12% from prompt-schema drift — Pitfall 3 below).

### Pitfall 3: `intent.generated.ts` lives under the DEBTOR path + codegen targets it
**What goes wrong:** Plans assume a separate `sales-email/coordinator/intent.generated.ts`. The codegen script writes ONE file: `web/lib/automations/debtor-email/coordinator/intent.generated.ts`, emitting `SWARM_INTENTS_BY_SWARM` keyed by swarm (debtor + sales both live in that one map).
**Why it happens:** Phase 110-02 generalized the script to a per-swarm map in the existing debtor-pathed file; it was never relocated.
**How to avoid:** Sales `types.ts` imports `SWARM_INTENTS_BY_SWARM["sales-email"]` from the debtor-pathed generated file (as AI-SPEC §4b shows). Do NOT create a second generated file. The AI-SPEC structure block lists a sales `intent.generated.ts` — that is aspirational; the VERIFIED reality is one shared file. Flag this discrepancy for the planner.
**Warning signs:** `npm run codegen && git diff --exit-code` fails, or a duplicate generated file appears.

### Pitfall 4: Retro corpus sees less context than live (attachment folding)
**What goes wrong:** The retro reconstruct-input reads raw `body_text`, but live Stage 2/3 (post-Phase-116) folds extracted attachment text into the body. Discovery clusters then miss attachment-driven intents (PO numbers, offertenummers in PDFs) — the exact reason 116 was sequenced before 113.
**Why it happens:** The debtor `reconstruct-input.ts` predates attachment folding and reads `body_full_text ?? body_text`.
**How to avoid:** The sales retro `reconstruct-input.ts` must replicate the live folding (the `selectResolverBody` + attachment-text concatenation done inline in `stage-2-customer-resolver.ts:84+`). Keep it byte-comparable to what live Stage 3 would assemble.
**Warning signs:** Clusters lack any PO/offerte intents despite the corpus containing PDF attachments.

### Pitfall 5: Orq `create_agent` drops `response_format`; unknown model IDs break Studio
**What goes wrong:** `create_agent` silently drops `model.parameters.response_format`; a bad/non-catalog model ID is accepted by PATCH and echoed by `get_agent` but renders an empty Studio dropdown.
**How to avoid:** D-13 workflow exactly: `list_models` FIRST (validate primary + every fallback ID), `create_agent` with a bare model id, immediate PATCH with full `model.parameters` (incl. strict json_schema, `anyOf` nullables), then `get_agent` to verify. The json_schema TOOL RESOURCE itself must be created in Studio (MCP has no tool CRUD) — CLAUDE.md canonical JSON-enforcement workflow. Anchor model on the live `debtor-intent-agent` config (debtor Stage 3 runs Haiku 4.5 via Bedrock EU).
**Warning signs:** Studio model dropdown empty; "Add tool" blocked; `response_format` absent in `get_agent`.

### Pitfall 6: 45s client timeout, not 30s
**What goes wrong:** A 30s `AbortSignal.timeout` fires false failures because Orq retries internally ~31s.
**How to avoid:** `TIMEOUT_MS = 45_000` (debtor `invoke-intent.ts` uses exactly this — read this session).

## Code Examples

### Hot-path Orq call (mirror debtor invoke-intent.ts)
```typescript
// Source: web/lib/automations/debtor-email/coordinator/invoke-intent.ts (read this session)
const ORQ_ENDPOINT = "https://api.orq.ai/v2/agents";
const AGENT_KEY = "sales-intent-agent";   // the only line that differs from debtor
const TIMEOUT_MS = 45_000;
const res = await fetch(`${ORQ_ENDPOINT}/${AGENT_KEY}/responses`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ message: { role: "user", parts: [{ kind: "text", text: userMessage }] },
                         configuration: { blocking: true, variables } }),
  signal: AbortSignal.timeout(TIMEOUT_MS),
});
const raw = (await res.json()).output?.[0]?.parts?.[0]?.text ?? "";
const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
const parsed = JSON.parse(stripped);
return salesIntentOutputSchema.parse(parsed);   // Zod double-gate
```

### Dispatcher placeholder branch (already handles STAGE3-03 — read-only reference)
```typescript
// Source: web/lib/inngest/functions/stage-3-dispatcher.ts (read this session)
if (intentRow.handler_status === "placeholder") {
  await step.run("dispatch-placeholder", async () => {
    const { data: row } = await admin.from("agent_runs").select("status").eq("id", agent_run_id).single();
    if (row?.status !== "predicted") return;   // replay idempotency
    await admin.from("automation_runs").insert({
      automation: `${swarm_type}-kanban`, swarm_type, status: "pending", topic: intent_key,
      result: { kanban_reason: "no_handler", intent: intent_key, confidence, email_id, /*...*/ },
      triggered_by: "stage-3-no-handler",
    });
    await admin.from("agent_runs").update({ status: "routed_human_queue" })
      .eq("id", agent_run_id).eq("status", "predicted");
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic coordinator (classify + dispatch in one fn) | Split: classifier flips `predicted`, dispatcher (`*/predicted`) routes | Phase 80 (2026-05-08) | `predicted` is a first-class status; dispatch is a single swarm-agnostic seam. |
| Module-level `SWARM_TYPE` constant in coordinator | `swarm_type` derived per-invocation from `event.data` | Phase 110-03 | The coordinator is now the shared cross-swarm Stage 3 runner; sales rides it with zero edits. |
| Hardcoded `INTENT` const in types.ts | `gen-intent-types.ts` codegen → `SWARM_INTENTS_BY_SWARM` per-swarm map | Phase 78 / 110-02 | Registry is the single source; hand-editing the union is forbidden. |
| Per-mailbox `labeling_settings.dry_run` boolean | `swarms.dry_run_config` per-stage governance map (fail-closed) | Phase 110-04 | Per-stage gating; the 867-delete footgun lesson; sales seeded all-blocked. |
| Raw `body_text` to Stage 2/3 | Attachment text folded into body at read time | Phase 116 (2026-06-05) | Retro reconstruct must replicate folding (Pitfall 4). |

**Deprecated/outdated:**
- The "827-email corpus" figure in the ROADMAP/CONTEXT is stale — verified live counts are 933 Outlook `verkoop@smeba.nl` (all-time and last-30d) + 34,725 historic SugarCRM. Plan corpus windows and cost against the real numbers (the retro `select-candidates` 40k cap covers it, but a full SugarCRM sweep at ~$0.005/email is ~$170 of Haiku — scope the window deliberately).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `promptfoo` is current/legitimate and the right CI eval tool | Standard Stack | Low — optional dev tool; gate behind checkpoint + `npm view` before adding. |
| A2 | The shared `invoke-intent` dispatch is per-swarm: the classifier must call a sales `invoke-intent.ts` (AGENT_KEY hardcoded per file), so SOME mechanism selects which invoke wrapper runs for `swarm_type='sales-email'` | Open Questions Q1 | HIGH — if the classifier hardcodes the debtor invoke import, a non-edit dispatch path must exist (e.g. agent key read from `swarms.stage3_coordinator_agent_key`). Must be resolved in planning; could mean a parameterized invoke or a registry-driven agent-key read. See Q1. |
| A3 | Phase 116 attachment folding for sales happens at Stage 2 read time and is NOT persisted as a column | Runtime State Inventory / Pitfall 4 | Medium — if 116 actually persists extracted text somewhere queryable, the retro reconstruct is simpler. Verify the exact 116 folding call site. |
| A4 | `other` will be among the promoted intents (residual bucket) | Pitfall 1 | High if omitted — without an `other` row the residual throws (dead-letter). Make `other` a mandatory seed. |
| A5 | Haiku 4.5 via Bedrock EU is the right primary (anchoring on debtor) | Common Pitfalls §5 | Low — `list_models`-validated at planning; escalate to Sonnet only if eval demands. |
| A6 | The sales Stage 2 producer threads `swarm_type='sales-email'` into `coordinator.requested` | Architecture Patterns §1 | HIGH — the classifier falls back to event-name prefix, so the EMITTED event name must be `sales-email/coordinator.requested` OR the payload must carry `swarm_type`. Verify the Phase 114 emit. |

## Open Questions

1. **How does the shared classifier select the SALES invoke wrapper / agent key?** `debtor-email-coordinator.ts` imports `invokeIntentAgent` from the debtor path, and that file hardcodes `AGENT_KEY='debtor-intent-agent'`. The coordinator derives `swarm_type` but the Orq call is import-bound to debtor.
   - What we know: `swarms.stage3_coordinator_agent_key='sales-intent-agent'` is set in the registry — strongly implying the agent key is meant to be READ from the registry per-invocation, not hardcoded per invoke file.
   - What's unclear: whether the existing `invokeIntentAgent` already accepts an `agent_key` param (it does NOT today — read this session), so SOME change is needed. The question is WHERE: parameterize `invokeIntentAgent` to take the agent key from the loaded swarm row (a change to a shared-ish file), or a per-swarm invoke wrapper the coordinator dispatches to. STAGE3-01 says "zero edits to shared classifier + dispatcher" — parameterizing `invoke-intent.ts` (a coordinator support file, arguably not the classifier itself) may be the intended seam.
   - Recommendation: **Planning must resolve this explicitly.** Inspect whether `debtor-email-coordinator.ts` is meant to read `stage3_coordinator_agent_key` from `loadSwarm(swarm_type)` and pass it into a parameterized `invokeIntentAgent({ agent_key, ... })`. This is the load-bearing design decision of the whole phase; the AI-SPEC's "only new code is one orq_agents row + invoke-intent + seed" understates it. Confirm the exact non-edit boundary with the plan-checker.

2. **Exact `entity_relationship` axis values + persistence location.** D-05 leaves values to planning (candidates: `resolved_entity` / `unresolved_known_pattern` / `unknown_third_party`).
   - Recommendation: derive values from what Phase 114's `PipelineStageContext` actually distinguishes (resolved customer_id vs null vs known-domain-pattern). Persist on `coordinator_runs` or `pipeline_events.decision_details` (additive JSONB — no schema migration, matches debtor's `intent_proposal` precedent). Keep swarm-agnostic + nullable.

3. **Corpus scope for the retro pass.** 933 Outlook + 34,725 SugarCRM is far larger than "827". A full SugarCRM sweep is real money and includes historic-era mail of unclear current relevance.
   - Recommendation: scope the retro window to recent Outlook (last 30–90d ≈ 933 rows) for the primary vocabulary; optionally a bounded SugarCRM sample for historic intent coverage. Respect the 40k fail-loud cap; stamp the window in the run output.

4. **Does Bulk Review already render a sales-email verdict row + retry path?** STAGE3-03's dead-letter guarantee depends on the Zod-throw-surfaces-to-Bulk-Review path existing for sales, not just debtor.
   - Recommendation: verify the Bulk Review surface is swarm-generic (it reads `automation_runs`/`coordinator_runs` by swarm_type) before relying on it as the dead-letter sink.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Orq.ai API (`ORQ_API_KEY`) | sales-intent-agent create + hot path | ✓ (debtor uses it live) | v2 Agents API | none — hard requirement |
| Supabase service role | registry seed, retro writes, codegen | ✓ | — | none |
| `email_pipeline.email_attachments` (Phase 116) | retro corpus attachment folding | ✓ (table exists; perms scoped) | — | retro reads raw body (degraded — Pitfall 4) |
| Phase 114 sales Stage 2 resolver | `entity_relationship` input + batch-resolve (D-07) | ✓ (`resolve-customer.ts` exists) | — | dry-run envelope carries "unresolved" (still valid per D-06) |
| `intent_proposals_v1` / `_clusters` | vocabulary discovery (D-01) | ✓ (tables exist, EMPTY for sales) | — | none |
| `node`/`tsx`/`npm run codegen` | enum codegen | ✓ | node 22 | none |

**Missing dependencies with no fallback:** none blocking — the `sales-intent-agent` Orq row is the only thing that must be CREATED (it's a phase deliverable, not a missing external dependency).
**Missing dependencies with fallback:** attachment folding degradation if the retro reconstruct skips Phase 116 folding (Pitfall 4).

## Validation Architecture

> nyquist_validation: config not inspected this session for an explicit `false`; included per default-enabled rule.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (the repo's test files are `*.test.ts` under `__tests__/`, e.g. `dry-run-gate.test.ts`, `stage-2-customer-resolver.test.ts`) `[VERIFIED: test dirs exist this session]` |
| Config file | `web/vitest.config.*` (assumed — confirm at plan time) |
| Quick run command | `cd web && npx vitest run <path>` |
| Full suite command | `cd web && npm test` (confirm script name) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STAGE3-01 | dispatcher routes sales `predicted` via registry, no hardcoded names | unit | `npx vitest run web/lib/inngest/functions/__tests__/stage-3-dispatcher*.test.ts` | ❌ Wave 0 (sales case) |
| STAGE3-01 | hard-separation: `swarm_intents ∩ swarm_noise_categories = ∅` for sales | unit | new guard test | ❌ Wave 0 |
| STAGE3-01 | codegen 3-way invariant holds after seed | CI | `npm run codegen && git diff --exit-code` | ✅ (script exists) |
| STAGE3-02 | retro-classify side-channel isolation (writes ONLY `stage_3_retro_runs`) | unit | source-grep guard test (mirror debtor's) | ❌ Wave 0 |
| STAGE3-02 | coverage threshold computable over retro corpus | integration | new | ❌ Wave 0 |
| STAGE3-03 | handler-less intent → Kanban row + `routed_human_queue` (zero dead-letter) | unit | dispatcher placeholder-branch test, sales swarm_type | ❌ Wave 0 |
| STAGE3-03 | `other` intent seeded + routes (no throw) | unit | new | ❌ Wave 0 |
| STAGE3-03 | dead-letter reconciliation: post-Stage-1 count == terminal-row count | smoke | `tsx web/scripts/eval/sales-stage3-deadletter-check.ts` (AI-SPEC §5) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched test>` + `npm run codegen && git diff --exit-code`
- **Per wave merge:** full sales-email + Stage 3 dispatcher/coordinator suite
- **Phase gate:** full suite green + dead-letter reconciliation = 0 before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `sales-email-stage-3-retro-classify` side-channel-isolation test (mirror debtor's source-grep guard)
- [ ] sales dispatcher placeholder-branch test (STAGE3-03)
- [ ] hard-separation guard test (sales intents vs noise keys)
- [ ] `other`-intent-routes test (no dead-letter)
- [ ] dead-letter reconciliation smoke (`sales-stage3-deadletter-check.ts`)
- [ ] (optional) promptfoo enum/schema regression config — only if the eval gate is adopted

## Security Domain

> `security_enforcement` config not inspected for explicit `false`; included per default-enabled rule. AI-SPEC §1b confirms NO sector-specific regulatory regime applies to intent classification; constraints are organizational/data-handling, enforced by the platform.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface; service-role backend writes only. |
| V3 Session Management | no | n/a |
| V4 Access Control | yes | Supabase RLS on every new/written table (`stage_3_retro_runs` already RLS-enabled, service_role FOR ALL + authenticated SELECT — verified). Any new table follows `_template.sql`. |
| V5 Input Validation | yes | Zod `salesIntentOutputSchema` on every LLM response + server-side strict json_schema. |
| V6 Cryptography | no | No new crypto; secrets stay in env vars. |
| V14 Data Protection | yes | GDPR/PII: all storage in Supabase under RLS; LLM calls only via Orq Router (no direct provider key); Anthropic via Bedrock EU for data residency (AI-SPEC §1b). No new PII surface. |

### Known Threat Patterns for {Orq-routed intent classifier on a shared multi-swarm corpus}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant corpus leakage (SugarCRM rows from a non-Smeba tenant) | Information Disclosure | `select-candidates.ts` single-tenant invariant (fail-loud on non-`sugarcrm` source) — already enforced. |
| Anon write to a new registry/retro table | Tampering | RLS service_role-only + global anon revoke (CLAUDE.md / `20260520_harden_rls`). |
| Prompt injection via email body / attachment text | Tampering | Stage 0 safety gate runs first; Stage 3 is classification-only (no tool use, no auto-action). Triage is human-in-the-loop. |
| Dead-letter (lost PO/complaint) | Denial of Service (to the human queue) | Zero-dead-letter terminal-state guarantee (Pitfall 1) — the core STAGE3-03 control. |
| Out-of-enum / noise-key leakage → non-routable verdict | Tampering | 3-way codegen invariant + hard-separation guard. |

## Sources

### Primary (HIGH confidence — read this session)
- `docs/agentic-pipeline/README.md`, `stage-3-coordinator.md`, `context-shape-contract.md` — locked RFCs (cross-swarm onboarding recipe, hard-separation lock, 3-way enum invariant, Stage 2→3 contract).
- `web/lib/inngest/functions/stage-3-dispatcher.ts`, `debtor-email-coordinator.ts`, `debtor-email-stage-3-retro-classify.ts`, `intent-proposals-refresh.ts`, `stage-2-customer-resolver.ts` — the shared/analog runtime code.
- `web/lib/automations/debtor-email/coordinator/{types,invoke-intent,assemble-input}.ts`, `retro/reconstruct-input.ts` — the shapes/patterns to mirror.
- `web/lib/automations/sales-email/retro/select-candidates.ts`, `resolve-customer.ts` — reusable sales assets (Phase 111/114).
- `web/lib/swarms/registry.ts`, `web/lib/pipeline-gating/dry-run-gate/index.ts`, `web/scripts/gen-intent-types.ts` — registry loaders, gate, codegen.
- `supabase/migrations/20260603b_swarms_dry_run_config.sql`, `20260521_phase87_stage_3_retro_runs.sql`, `20260605_email_attachments.sql` — migration shapes.
- **Live DB queries (service role, this session):** sales swarm config, `swarm_intents` emptiness, proposals/clusters emptiness, `orq_agents` contents, corpus counts, `pipeline_events` stage distribution, attachments-table existence.
- `113-CONTEXT.md`, `113-AI-SPEC.md`, `REQUIREMENTS.md` (STAGE3-01/02/03) — phase contract.
- CLAUDE.md Orq/Inngest/Supabase blocks — catalog IDs, anyOf nullables, create→PATCH→verify, replay safety, RLS rules.

### Secondary (MEDIUM)
- AI-SPEC §3–5 framework quick reference + eval strategy (distilled from official Orq docs + in-tree path by gsd-ai-researcher).

### Tertiary (LOW)
- `promptfoo` currency/legitimacy — not verified against npm this session (A1).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against `web/package.json`; no new runtime deps.
- Architecture: HIGH — shared code read directly; cross-swarm seam confirmed generic; live registry state verified. The ONE uncertainty (Q1, agent-key dispatch mechanism) is flagged HIGH-risk for planning.
- Pitfalls: HIGH — drawn from in-tree learnings, RFC locks, and verified DB/corpus state.
- Vocabulary seeding: HIGH — exact Phase 87 analog exists; surfaces confirmed present (and empty for sales).

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (stable — internal codebase + locked RFCs; re-verify corpus counts and `orq_agents` contents at execution time as they will change once the agent is created).
