# Phase 63: Architecture RFC - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Produce a single canonical architecture RFC (a directory of self-contained docs under `docs/agentic-pipeline/`) that defines the 5-stage funnel shape (Stage 0 safety → Stage 1 regex → Stage 2 entity → Stage 3 coordinator → Stage 4 handler), the cross-swarm Stage 2→3 context-shape contract, the 4-axis override model, and the graduated-automation hook model. Supersedes `docs/debtor-email-pipeline-architecture.md` for cross-swarm shape; that doc is retained as a swarm-specific implementation addendum.

**This is a docs-only phase.** No code changes, no migrations. RFC must be readable end-to-end before Phase 64+ touch implementation.

</domain>

<decisions>
## Implementation Decisions

### Doc structure & scope
- **D-01:** RFC ships as **index + per-stage files** under `docs/agentic-pipeline/`:
  ```
  docs/agentic-pipeline/
    README.md                    ← the RFC entry point (overview + tenancy + index)
    stage-0-safety.md
    stage-1-regex.md
    stage-2-entity.md
    stage-3-coordinator.md
    stage-4-handler.md
    context-shape-contract.md    ← Stage 2→3 contract (versionable)
    override-model.md            ← 4-axis override spec
    graduated-automation.md      ← promotion ladder principles
  ```
  README.md is the canonical entry point referenced from `CLAUDE.md`.
- **D-02:** Each file is **self-contained** — Anthropic principle citations, contract details, override taxonomy, and stage-internals live inline in the relevant file. Per-stage files link OUT only to existing implementation patterns (`docs/browserless-patterns.md`, `docs/orqai-patterns.md`, `docs/zapier-patterns.md`, `docs/inngest-patterns.md`, `docs/supabase-patterns.md`). One read of any stage file = full understanding of that stage.
- **D-03:** RFC supersedes the cross-swarm shape parts of `docs/debtor-email-pipeline-architecture.md`. That doc gets a banner: `> SUPERSEDED for cross-swarm shape by docs/agentic-pipeline/README.md. Retained as the implementation map for the debtor-email swarm specifically.` and stays in place as the debtor-email implementation addendum. `CLAUDE.md` is updated to point at both: RFC for canonical shape, debtor-email doc for that swarm's implementation. (Existing `docs/email-agent-swarm-architecture.md` already superseded — no further action.)

### Stage 2→3 context-shape contract
- **D-04:** Contract notation = **TypeScript interface (canonical) + prose table (semantics)**. The TS interface lives in `context-shape-contract.md`; downstream phases will codify the same shape in `web/lib/agentic-pipeline/types.ts` (or equivalent). The prose table explains every field's required/nullable status, source backend (NXT vs SugarCRM vs other), and semantic notes.
- **D-05:** Contract includes `context_version: 1` from day 1. `pipeline_events` rows persist the version. Future evolution = additive optional fields under same major version; breaking changes bump the major. RFC must state the versioning policy explicitly.
- **D-06:** Brand list (`entity_brand`) in the TS interface is documented as **data-driven from `swarms.entity_brand` registry rows, NOT a hardcoded enum**. RFC shows the today-set as a comment/example only (see D-09), never as a TypeScript literal-union enum.

### Worked examples & tenancy
- **D-07:** Use **debtor-email as the running concrete example** in every stage doc (real `category_keys`, real handler agent names like `debtor-copy-document-body-agent`). Add a short **sales-email parallel block** in `stage-1-regex.md` and `stage-3-coordinator.md` only — enough to prove brand-multitenancy, not so much that it bloats the RFC or front-runs Phase 73's design.
- **D-08:** README.md has a **dedicated Tenancy section** stating: brand multitenancy is day-1; `entity_brand` drives all routing, prompts, categories; no hardcoded enums. Each stage doc cross-references this section where relevant rather than re-explaining.
- **D-09:** **BRAND-NAME CORRECTION (must land in RFC):** PROJECT.md and v8 milestone language refer to "smeba-uk" and "smeba-ie" — this is **incorrect**. The truth from production:
  - `walkerfire.icontroller.eu` is the iController **tenant** (umbrella), NOT a brand.
  - Today's 6 entity_brands flowing through that tenant: `smeba`, `smeba-fire`, `firecontrol`, `sicli-noord`, `sicli-sud`, `berki`.
  - UK/IE expansion (Phase 999.1 backlog): brand names **TBD**. Do NOT speculate or use placeholder names like "smeba-uk".
  - RFC's tenancy section uses today's 6 brands as the example. UK/IE referenced as "future brand additions, names data-driven via registry insert".
  - This phase MUST also update PROJECT.md (and any other doc using "smeba-uk/-ie") to remove the speculative names. Capture as a docs-housekeeping task in PLAN.

### 4-axis override model
- **D-10:** `override-model.md` documents one override axis per stage 1–4:
  - Axis 1 = Stage 1 (wrong category) → learning signal feeds regex promotion
  - Axis 2 = Stage 2 (wrong customer) → learning signal feeds sender-mapping promotion
  - Axis 3 = Stage 3 (wrong intent) → learning signal feeds prompt-tune trigger
  - Axis 4 = Stage 4 (wrong handler output) → learning signal feeds prompt-tune / handler-replacement
  Each axis gets: definition, where the override is captured (Bulk Review UI), what telemetry row it produces, and which graduated-automation hook consumes it.
- **D-11:** Override axes are **independent** — overriding axis N does not invalidate downstream stages' decisions on the same email (those just become non-applicable, not wrong). RFC states this explicitly so eval logic in Phase 71 doesn't double-count.

### Graduated automation hooks
- **D-12:** `graduated-automation.md` ships **principles + signal types only**, NOT concrete thresholds. For each hook (regex promotion, sender mapping promotion, prompt-tune trigger): name it, define the telemetry signal it consumes, state the promotion direction (LLM → deterministic). **Concrete thresholds (e.g. "≥50 matches / 30d / Wilson-CI lower bound > 0.95") are deferred to Phase 71 (Learning Inbox)** once cross-stage telemetry exists. RFC notes Phase 56's Wilson-CI sender-mapping precedent as the working pattern but does not pin numbers.

### Diagrams
- **D-13:** **ASCII diagrams** throughout. Matches the existing `docs/debtor-email-pipeline-architecture.md` style, renders identically everywhere, diffs cleanly in PRs, no build step. README.md gets the headline funnel diagram; each stage doc gets a local zoom-in.

### Claude's Discretion
- Exact section order within each per-stage doc (Claude picks consistent template across stages).
- Length/depth of Anthropic citation blocks — paraphrase preferred, link to `https://www.anthropic.com/engineering/building-effective-agents` and similar canonical refs once at top of relevant doc.
- ASCII diagram precise glyphs/spacing.
- Whether `stage-3-coordinator.md` includes the orchestrator-worker (Stage 3.5) escalation diagram in this phase or defers to Phase 65 — Claude's call based on whether escalation can be drawn cleanly without Phase 65 design specifics. Default: include the principle + a placeholder, full design lands in Phase 65.

### Folded Todos
None — no relevant todos surfaced.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning or implementing the RFC.**

### Primary inputs
- `.planning/ROADMAP.md` §"Phase 63: Architecture RFC" — phase goal, depends-on, requirements RFC-01..04, success criteria.
- `.planning/REQUIREMENTS.md` §"Stage 0..4 / RFC" — RFC-01..04 requirement text.
- `.planning/PROJECT.md` §"Current Milestone: v8.0 Agentic Platform" — locked architectural decisions from 2026-04-30 design session. **Note D-09:** the "smeba-uk/-ie" reference here is incorrect and is corrected in this phase.

### Existing architecture docs (RFC supersedes / coexists with)
- `docs/debtor-email-pipeline-architecture.md` — current canonical map; gets a SUPERSEDED banner per D-03 and remains as swarm-specific addendum. Source of truth for the existing flow's concrete behavior (classifier-verdict-worker, swarm_categories, side_effects).
- `docs/email-agent-swarm-architecture.md` — already superseded; no action needed, but referenced as historical context.
- `docs/swarm-bridge-contract.md` — existing cross-swarm contract; RFC's `context-shape-contract.md` either supersedes this or links to it as a sibling. Researcher must read to decide.

### Implementation pattern docs (RFC links OUT to these)
- `docs/browserless-patterns.md` — Browserless.io playwright-core patterns.
- `docs/orqai-patterns.md` — Orq.ai agent + LLM Router patterns.
- `docs/zapier-patterns.md` — Zapier-tool registry + NXT SQL via whitelisted IP.
- `docs/inngest-patterns.md` — durable functions, business-hours cron, watermark syncs.
- `docs/supabase-patterns.md` — service-role writes, JSONB double-encoding.
- `docs/elevenlabs-patterns.md` — voice agent patterns (out of scope for v8 RFC, but cross-swarm linked).
- `docs/debtor-email-patterns.md` — debtor-email specific patterns; the running worked example pulls from here.
- `CLAUDE.md` — must be updated in this phase to point at `docs/agentic-pipeline/README.md` as the canonical doc; debtor-email doc demoted to "implementation map for the debtor-email swarm".

### Prior phase artifacts (read for grounding, not for re-decisions)
- `.planning/phases/55-debtor-email-pipeline-hardening/55-CONTEXT.md` — confirms today's 6 brands (smeba, smeba-fire, firecontrol, sicli-noord, sicli-sud, berki) and `walkerfire.icontroller.eu` as iController tenant. Source for D-09.
- `.planning/phases/56-icontroller-auto-labeling-van-accounts-aan-emails/56-CONTEXT.md` — sender-lookup-as-primary, multi-database routing per brand, Wilson-CI promotion gate (precedent for D-12).
- `.planning/phases/56.7-swarm-registry/56.7-CONTEXT.md` — `swarm_categories` registry shape; informs how `swarms.entity_brand` is data-driven (D-06, D-08).

### External canonical refs (cited inline in RFC)
- Anthropic, *Building Effective Agents* — `https://www.anthropic.com/engineering/building-effective-agents`. Workflow-vs-agent distinction underpins D-01's stage decomposition and D-12's promotion-ladder direction.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets (RFC documents these, doesn't replace them)
- **`web/lib/debtor-email/classify.ts`** — pure regex classifier; the canonical Stage 1 implementation. RFC's `stage-1-regex.md` cites this file as the reference implementation.
- **`web/lib/inngest/functions/classifier-verdict-worker.ts`** — current Stage 1→2 dispatch; informs how the RFC describes the `categorize_archive` vs `swarm_dispatch` action paths. Stage 1 doc cites it.
- **`swarm_categories` registry table** (Supabase) — already-shipped registry that drives action routing. RFC's `stage-1-regex.md` documents it as the canonical category-action registry.
- **`zapier_tools` registry table + `web/lib/automations/debtor-email/nxt-zap-client.ts`** — already-shipped tool routing pattern (one row per tool, `auth_secret_env` field, `allowed_for_intents` allowlist coming in Phase 64). RFC's `stage-4-handler.md` cites this as the canonical handler-tool integration pattern. The `allowed_for_intents` field is forward-referenced (Phase 64 implements it).
- **Existing handler agents in Orq.ai** — e.g. `debtor-copy-document-body-agent`. RFC's `stage-4-handler.md` uses this as the worked example; canonicalisation per Phase 69 is forward-referenced.

### Established patterns
- **ASCII flow diagrams** — `docs/debtor-email-pipeline-architecture.md` already uses ASCII boxes/arrows. RFC continues this style (D-13).
- **Registry-driven routing** — `swarm_categories`, `zapier_tools`, soon `swarms.entity_brand`. The RFC's data-driven brand list (D-06) extends an established pattern.
- **Wilson-CI promotion gate** — Phase 56's mailbox-flip pattern. RFC's graduated-automation doc (D-12) names this as the precedent without pinning thresholds.

### Integration points
- **`CLAUDE.md` "Canonical Architecture Docs" section** — currently points at `docs/debtor-email-pipeline-architecture.md`. Must be updated this phase to point at `docs/agentic-pipeline/README.md` as primary, demote the debtor doc to "swarm-specific implementation map" per D-03.
- **`PROJECT.md` v8 milestone bullets** — contain the speculative "smeba-uk/-ie" names; must be corrected per D-09.
- **No web/ code changes** — this phase is pure docs; downstream phases (64+) will codify the contract in TypeScript.

</code_context>

<specifics>
## Specific Ideas

- The RFC must read like a **decision document**, not a tutorial. Reader should walk away knowing: (1) the 5-stage shape, (2) the contract every Stage 3 agent receives, (3) the 4 places overrides happen and what each teaches, (4) how LLM-handled patterns graduate down to deterministic rules.
- The **brand-name correction (D-09)** is non-negotiable. Speculative names like "smeba-uk" leaking into the RFC would propagate the error to every downstream phase. Researcher and planner must explicitly verify this is corrected.
- **Anthropic citation discipline:** paraphrase the relevant principle (workflow-first, decomposition only when justified, allowlists per intent) into the RFC's own voice; cite the URL once. Don't quote-bomb.
- **Sales-email parallel blocks** in stage-1 and stage-3 stay short (≤10 lines each). Their job is to demonstrate that the shape is swarm-agnostic, not to design the SugarCRM integration (that's Phase 73).

</specifics>

<deferred>
## Deferred Ideas

- **Concrete graduated-automation thresholds** (e.g. promotion N≥50 / 30d / Wilson-CI lower bound > 0.95) — deferred to **Phase 71 (Learning Inbox / promotion recommender)** once cross-stage telemetry exists. Per D-12.
- **Stage 3.5 orchestrator-worker full design** — RFC's `stage-3-coordinator.md` includes the principle + escalation conditions, but the detailed multi-handler fan-out design lands in **Phase 65**. Per D-13 / Claude's discretion.
- **Sales-email/SugarCRM swarm onboarding** — RFC proves the shape is swarm-agnostic via short parallel blocks; the actual swarm onboarding is **Phase 73**.
- **`web/lib/agentic-pipeline/types.ts` codification** — RFC defines the TS interface in `context-shape-contract.md`; codifying it in actual TypeScript modules is downstream (likely Phase 64 or 70 depending on which phase first needs the type at runtime).
- **UK/IE brand naming** — names are TBD per D-09. Phase 999.1 backlog item handles onboarding when names are decided; RFC just states "data-driven via registry insert".
- **`pipeline_events` table migration** — single canonical events table is a v8 milestone goal; the table itself is created in a later phase. RFC references it as the persistence target for `context_version` and override telemetry.

### Reviewed Todos (not folded)
None — no relevant todos surfaced from cross-reference.

</deferred>

---

*Phase: 63-architecture-rfc*
*Context gathered: 2026-04-30*
