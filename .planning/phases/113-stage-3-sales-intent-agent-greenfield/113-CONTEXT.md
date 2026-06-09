# Phase 113: Stage 3 Sales Intent Agent (greenfield) - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

A sales-specific Orq intent agent (`sales-intent-agent`, registered in `orq_agents`) classifies every sales email leaving Stage 1 into a ranked intent list; `swarm_intents` rows are seeded from the live corpus (data + operator promotion, never hand-curated); `swarms.stage3_coordinator_agent_key` is set; dispatch runs through the existing generalized Stage 3 classifier (Phase 110 D-07) and Stage 3.5 dispatcher with **zero edits to shared code** (STAGE3-01). Handler-less intents land in the Kanban human-lane with a clear reason — zero silent dead-letters (STAGE3-03).

**Requirements:** STAGE3-01, STAGE3-02, STAGE3-03.

**Sequencing change (decided this discussion):** **Phase 116 (Attachment Ingest — uniform cross-swarm) executes BEFORE this phase.** The retro batch-resolve and intent discovery must see attachment-derived data (PO/offertenummer in PDFs, "stuurt PO mee" intent signals). ROADMAP updated accordingly.

**Out of scope:** Stage 4 handlers (V11.0), debtor adoption of the new output axis, Outlook-categorie side-effect, Sugar sent-replies harvest, chat-agent (all deferred — see below).

</domain>

<decisions>
## Implementation Decisions

### Vocabulary seeding pipeline (STAGE3-02)
- **D-01:** **Reuse the Phase 86/87 retro machinery.** Build a sales retro-classify pass mirroring debtor's Phase 87 (`stage_3_retro_runs`, `debtor-email-stage-3-retro-classify.ts` as analog) that runs the open-set discovery agent over the corpus; proposals land in the existing `intent_proposals_v1`/`intent_proposal_clusters` surface (`intent-proposals-refresh.ts`); the operator promotes. No one-shot mining script, no live-only discovery.
- **D-02:** **Coverage threshold decides vocabulary size**, not a fixed count: promote clusters until promoted intents cover a target share of the retro corpus (≈80% maps to a promoted intent; rest falls through to `other`). Data decides — honors the locked 2026-05-19 principle.
- **D-03:** **Retro corpus = post-Stage-1 inbound only** — normalized-inbound mail that survives (or would survive) the Stage 1 noise filter; reuse the Phase 111 sales retro candidate selector (`web/lib/automations/sales-email/retro/select-candidates.ts`) and its direction normalization. Noise stays out of the intent clusters.
- **D-04:** **Batch migration after promotion.** UI promotion is a decision record; the phase ships ONE migration with all promoted `intent_key` rows + `npm run codegen` + Orq agent json_schema enum update in a single atomic commit. No runtime registry writes from the promote action (avoids the enum drift-window where the deployed closed-list schema can't return a live-inserted intent).

### Customer-vs-prospect axis (consumes Phase 114 output)
- **D-05:** **Both prompt input AND output axis.** Stage 2 resolution status (resolved customer + entity, or unresolved/likely-prospect) is passed as prompt context to the Intent Agent, AND the agent emits a **swarm-agnostic `entity_relationship` axis** (nullable, registry-friendly; e.g. resolved_entity / unresolved_known_pattern / unknown_third_party — exact values at planning) in its ranked output. Sales fills it now; debtor can adopt later without schema break. Design must be swarm-agnostic — this touches the shared ranked-output shape exactly once.
- **D-06:** **Stage 3 reads resolution from the live PipelineStageContext envelope** (the Stage 2→3 contract), NOT via a separate audit-table lookup. If Stage 2 is dry-run the envelope carries "unresolved" — that is the truth. No second read path.
- **D-07:** **Batch-resolve the retro corpus first.** Run the Phase 114 resolver in dry-run over the retro corpus before discovery so intent clusters can split by customer/prospect. This is the point of the 114-before-113 re-sequencing.

### Go-live gating & human-lane (STAGE3-03)
- **D-08:** **Dry-run observation first, then flip.** Stage 3 classifies live but verdicts are visible only in Bulk Review (per-stage dry-run gate from Phase 110 D-10 stays closed); Kanban routing opens only after operator green light. Shadow→promote pattern (Phase 111; archive-incident lesson).
- **D-09:** **End-station of this phase = Kanban routing live** after an operator-reviewed sample in Bulk Review. The human-lane IS the STAGE3-03 deliverable (operator console — salespeople keep working in Outlook per the 112.5 model). Flip is reversible via the registry gate; Kanban rows are additive, no irreversible writes.
- **D-10:** Green-light is an explicit operator decision recorded in the phase UAT; axis-3 overrides in Bulk Review are the correction signal during observation.

### Agent design & ranked output (STAGE3-01)
- **D-11:** **Open-set discovery rides in the same classifier call** (debtor pattern): ranked closed-list + optional snake_case open-set proposal in one response. Proposals keep flowing after go-live via `intent-proposals-refresh`.
- **D-12:** **Reuse the debtor intent-v3 ranked-list shape + XML prompt structure**, extended with the nullable `entity_relationship` axis. The generic coordinator/Bulk Review read path already consumes the v3 shape — diverging would force shared-code edits that STAGE3-01 forbids. Prompt examples in Dutch from the retro clusters.
- **D-13:** **Agent created/managed scripted via the Orq API**: `create_agent` with bare model id → immediate PATCH with full `model.parameters` (incl. `response_format` strict json_schema with `anyOf` nullables) → `get_agent` verification. json_schema enum is a codegen artifact from `swarm_intents`. Note: json_schema *tool resources* require Studio (MCP has no tool CRUD) — follow the canonical CLAUDE.md JSON-enforcement workflow where Studio is unavoidable.

### Claude's Discretion
- **Model choice** for the sales-intent-agent: pick during planning using the debtor-intent-agent config as anchor; ALWAYS `list_models`-validated, standard fallback chain per CLAUDE.md catalog rules.
- **Operator sample size** for the go-live green light: pick a reasonable number during planning based on intent distribution in the retro data (~100 verdicts in Bulk Review was the discussed anchor; per-intent minimums optional).
- Exact `entity_relationship` axis values and where the axis persists (coordinator_runs / pipeline_events) — planning decides, hard constraint: swarm-agnostic + nullable + no shared dispatcher edits.
- Retro-run batching/cost control over the corpus (Inngest function vs script; respect the 40k hard-cap fail-loud pattern from `select-candidates.ts`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture (locked RFCs — win over code-inferred conclusions)
- `docs/agentic-pipeline/stage-3-coordinator.md` — THE contract for this phase: classifier/dispatcher split, `predicted` state machine, cross-swarm onboarding recipe (registry rows + per-swarm classifier, zero dispatcher edits), intent-enum codegen invariant (three places must agree: TS union, `swarm_intents` rows, Orq json_schema enum), hard separation noise-vs-intents.
- `docs/agentic-pipeline/README.md` — 5-stage funnel, Stage 2→3 context-shape contract, 4-axis override model.
- `docs/agentic-pipeline/context-shape-contract.md` — the PipelineStageContext envelope D-06 reads resolution from.
- `docs/orqai-patterns.md` + CLAUDE.md Orq block — json_schema enforcement, `anyOf` nullables, model catalog IDs (Bedrock EU), create→PATCH→verify, 45s timeout.

### Prior phase decisions consumed here
- `.planning/phases/110-visibility-foundation-bulk-review-swarm-row-enrichment-inges/110-CONTEXT.md` — D-07 (generalized coordinator this phase dispatches through), D-08 (per-swarm codegen), D-10/D-11 (per-stage dry-run gates; sales defaults dry-run).
- `.planning/phases/114-stage-2-resolver-reuse-cross-swarm-generality-proof/114-VERIFICATION.md` — the customer-resolution capability D-05/D-07 consume; `stage_2_resolution` dry-run gate.

### Phase 86/87 machinery being reused
- `supabase/migrations/20260520_phase86_intent_proposals_v1.sql`, `..._intent_proposal_clusters.sql`, `..._intent_proposal_views.sql` — the proposals surface D-01 targets.
- `web/lib/inngest/functions/intent-proposals-refresh.ts` — live proposal flow after go-live (D-11).
- `web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts` + `supabase/migrations/20260521_phase87_stage_3_retro_runs.sql` — the debtor retro pattern D-01 mirrors for sales.
- `web/lib/automations/sales-email/retro/select-candidates.ts` — Phase 111 sales retro candidate selector (D-03), incl. direction normalization + 40k hard-cap.

### Codegen invariant
- `web/scripts/gen-intent-types.ts` (+ `gen-entity-types.ts` precedent) — per-swarm generated literal unions; `npm run codegen && git diff --exit-code` CI gate; never hand-edit `*.generated.ts`.

### Phase 113 inputs
- `.planning/ROADMAP.md` §Phase 113 — goal + 3 success criteria (+ the 116-before-113 re-sequencing note from this discussion).
- `.planning/REQUIREMENTS.md` — STAGE3-01/02/03 (lines 48-50).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/lib/inngest/functions/debtor-email-coordinator.ts` — already generalized (Phase 110 D-07): `swarm_type` derives per-invocation from the event payload; carries the open-set proposal path ("open-set path carries the snake_case", line ~366). This is the shared classifier sales dispatches through — **read-only for this phase**.
- `web/lib/inngest/functions/stage-3-dispatcher.ts` — wildcard `*/predicted`, registry-driven, branch-free. **Zero edits allowed** (STAGE3-01).
- Phase 86 proposals surface + Phase 87 retro pattern + Phase 111 sales selector (see canonical refs).
- `supabase/migrations/20260520_phase84_classifier_rules_seed.sql` — sales Stage 1 noise keys (`kind='agent_intent'`, 8 rows) — the hard-separation counterparty: none of these keys may appear in `swarm_intents`.

### Established Patterns
- Hard separation: a key exists in exactly one of `swarm_noise_categories` (Stage 1) or `swarm_intents` (Stage 3) — never both.
- Registry-as-source-of-truth + atomic migration+codegen commits (Phase 69/78 pattern).
- Inngest replay safety: non-deterministic ids inside `step.run()`; never destructure `inngest.send`.
- Shadow→promote go-live gating with operator green light (Phase 111; 2026-06-04 archive incident lesson: no production side-effect without a per-stage gate).

### Integration Points
- `swarms.stage3_coordinator_agent_key` for `sales-email` is currently **null** (20260506 seed D-18) — this phase sets it to the new agent key.
- `swarm_intents` for `sales-email` is currently **empty** — natural inert guard that has kept Stage 3 no-op for sales; seeding it + setting the agent key + opening the dry-run gate is the activation sequence.
- Per-stage dry-run gate keys (Phase 110 D-10) gate the Kanban flip (D-08/D-09).
- **Phase 116 (now sequenced before 113)** delivers attachment metadata + extracted text the batch-resolve (D-07) and discovery (D-01) consume.

</code_context>

<specifics>
## Specific Ideas

- "Een flip heeft toch alleen maar nut als er handlers zijn?" → resolved: the Kanban human-lane is the operator console deliverable itself (STAGE3-03), not a stepping stone; salespeople stay in Outlook (112.5 model).
- "Denk je dat [een aparte output-as] niet ook kan helpen om de Debtor mails te optimaliseren?" → yes, hence the swarm-agnostic design of `entity_relationship` (D-05); debtor adoption itself deferred.
- "De bijlagen zijn belangrijk om ook uit te lezen zodat we stage 2 en 3 goed kunnen draaien" → drove the 116-before-113 re-sequencing.

</specifics>

<deferred>
## Deferred Ideas

- **SugarCRM sent-replies harvest + storage** — fetch historically sent answers from SugarCRM and store them (Supabase, per CLAUDE.md knowledge-base rule) as a reference source for Stage 4 handler reply drafting. ⚠ **Must be secured BEFORE or independent of Phase 115 (Sugar dead-code decommission)** — and note the Power Automate sweep to Sugar Archive runs until the hard cut-over. Candidate: new phase or fold into V10.0 reply-tracing.
- **Temporary chat-agent for employees** — an internal agent that consults the harvested Sugar replies / knowledge base to help staff answer customer questions while Stage 4 handlers don't exist yet. New capability — own phase.
- **Debtor adoption of the `entity_relationship` axis** — use the swarm-agnostic Stage 3 output axis for debtor unresolved-sender triage (internal forwards, external bookkeepers). Later phase; design here keeps it adoptable.
- **Outlook-categorie side-effect** — write the Stage 3 intent as an Outlook category so salespeople see triage in their own surface. Post-Sugar-cut-over / 112.5 activation; new production-write side-effect.

### Reviewed Todos (not folded)
- 19 keyword matches from `todo.match-phase` were reviewed; all are weak generic matches (debtor handler idempotency, Bulk Review UX, CI debt, etc.) — none fold into Stage 3 sales scope. Notable adjacent: `2026-05-21-orq-agent-spec-drift-ci-gate.md` (relevant context for D-13's scripted agent management, but the CI gate itself stays its own todo).

</deferred>

---

*Phase: 113-Stage 3 Sales Intent Agent (greenfield)*
*Context gathered: 2026-06-04*
