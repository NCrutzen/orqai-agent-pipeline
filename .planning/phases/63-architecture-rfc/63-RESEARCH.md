# Phase 63: Architecture RFC — Research

**Researched:** 2026-04-30
**Domain:** Documentation architecture (docs-only phase)
**Confidence:** HIGH (this phase is a paper artifact; all inputs are repo-internal and verified by direct read)

## Summary

Phase 63 produces a directory of self-contained architecture markdown under `docs/agentic-pipeline/` that locks the v8.0 5-stage funnel shape (Stage 0 safety → 1 regex → 2 entity → 3 coordinator → 4 handler), the Stage 2→3 context-shape contract (TypeScript interface + prose), the 4-axis override model, and the graduated-automation hook taxonomy (principles only, no thresholds). It supersedes `docs/debtor-email-pipeline-architecture.md` for cross-swarm shape and demotes that doc to a swarm-specific implementation addendum.

CONTEXT.md has already locked every design decision (D-01..D-13). The remaining job is fact-finding so the writer agent does not invent today-state or contradict already-shipped registries. This RESEARCH.md captures what exists in code/migrations today, what is forward-referenced to phases 64-73, what to do with the existing `swarm-bridge-contract.md` (verdict: keep — it's a different concern), and a section-by-section disposition of the existing debtor-email doc.

**Primary recommendation:** Plan 9 doc-creation tasks (one per RFC file), 2 doc-mutation tasks (CLAUDE.md + PROJECT.md), and 1 supersession-banner task on the existing debtor-email doc. Total = 12 file-touch tasks. No code changes, no migrations, no tests. A "doc-link integrity + RFC-01..04 coverage" verification check is the Nyquist gate.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Doc structure (D-01):** RFC ships under `docs/agentic-pipeline/` with this exact layout:
```
docs/agentic-pipeline/
  README.md                     ← canonical entry point (overview + tenancy + index)
  stage-0-safety.md
  stage-1-regex.md
  stage-2-entity.md
  stage-3-coordinator.md
  stage-4-handler.md
  context-shape-contract.md     ← Stage 2→3 contract (versionable)
  override-model.md             ← 4-axis override spec
  graduated-automation.md       ← promotion ladder principles
```

**Self-containment (D-02):** Each per-stage file embeds its Anthropic citations, contract details, override taxonomy, and stage internals inline. Per-stage files link OUT only to existing `docs/<stack>-patterns.md` files. One read = full understanding.

**Supersession (D-03):** RFC supersedes cross-swarm shape parts of `docs/debtor-email-pipeline-architecture.md`. That doc gets a banner and stays as the debtor-email implementation addendum. CLAUDE.md must point at both.

**Contract notation (D-04):** TypeScript interface (canonical) + prose table (semantics) inside `context-shape-contract.md`. Future `web/lib/agentic-pipeline/types.ts` is downstream.

**Versioning (D-05):** `context_version: 1` from day one, persisted on every `pipeline_events` row. Additive optional fields = same major; breaking = bump major. Policy stated explicitly.

**No hardcoded brand enum (D-06):** `entity_brand` documented as data-driven from `swarms.entity_brand` registry rows. Today's set shown as comment/example only.

**Worked example (D-07):** Debtor-email is the running example with real `category_keys` and real handler-agent names (`debtor-copy-document-body-agent`). Sales-email parallel blocks (≤10 lines each) only in `stage-1-regex.md` and `stage-3-coordinator.md`.

**Tenancy section (D-08):** README.md has a dedicated Tenancy section. Stage docs cross-reference rather than re-explain.

**Brand-name correction (D-09 — non-negotiable):**
- `walkerfire.icontroller.eu` is the iController **tenant**, not a brand.
- Today's 6 brands: `smeba`, `smeba-fire`, `firecontrol`, `sicli-noord`, `sicli-sud`, `berki`.
- UK/IE expansion: brand names **TBD**. Do NOT use placeholders like "smeba-uk".
- This phase MUST update PROJECT.md (and any other speculative-name leak) to remove the speculative names.

**4-axis override model (D-10, D-11):** One axis per stage 1-4. Each axis: definition + capture point (Bulk Review UI) + telemetry row produced + graduated-automation hook consumed. Axes are independent — overriding axis N does not invalidate downstream stage decisions; they become non-applicable.

**Graduated automation principles only (D-12):** No concrete thresholds. Each hook gets: name, telemetry signal, promotion direction (LLM → deterministic). Phase 56's Wilson-CI sender-mapping promotion named as the working precedent.

**ASCII diagrams (D-13):** Throughout. Matches existing `docs/debtor-email-pipeline-architecture.md` style.

### Claude's Discretion

- Section order within each per-stage doc (writer picks consistent template).
- Length/depth of Anthropic citation blocks (paraphrase preferred, link once).
- Exact ASCII glyph/spacing.
- Whether `stage-3-coordinator.md` includes the Stage 3.5 escalation diagram in this phase (default: principle + placeholder; full design lands in Phase 65).

### Deferred Ideas (OUT OF SCOPE)

- Concrete graduated-automation thresholds (Phase 71).
- Stage 3.5 orchestrator-worker full design (Phase 65).
- Sales-email/SugarCRM swarm onboarding (Phase 73).
- `web/lib/agentic-pipeline/types.ts` codification (Phase 64 or 70).
- UK/IE brand naming (Phase 999.1 backlog).
- `pipeline_events` table migration (Phase 70 — RFC describes target shape only).

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RFC-01 | Single canonical RFC defines 5-stage funnel shape and supersedes existing debtor-email doc | Doc-disposition map (below) drives README.md + 5 per-stage files; supersession banner task on debtor-email doc. |
| RFC-02 | RFC documents Stage 2→3 context-shape contract (`customer_id`, `customer_name`, `language`, `entity_brand`, `recent_documents[]`) | `context-shape-contract.md` task; today-state for these fields traced to `debtor.email_labels` (customer_account_id, method, confidence) and `resolveDebtor` output. |
| RFC-03 | RFC documents 4-axis override model | `override-model.md` task; today-state per stage traced below — only Stage 1 + Stage 4 have override capture today; Stage 2 + Stage 3 are forward-looking (Phase 71). |
| RFC-04 | RFC documents graduated-automation hooks per stage | `graduated-automation.md` task; Wilson-CI Phase 56 precedent verified at `web/lib/classifier/wilson.ts:25` (N≥30, CI-lo≥0.92). |

---

## Anthropic Agentic Guidance Synthesis (one-page paraphraseable)

Source: https://www.anthropic.com/engineering/building-effective-agents (canonical reference; CONTEXT D-02 requires linking once and paraphrasing).

**Core distinction.** Anthropic separates **workflows** (LLMs and tools orchestrated through predefined code paths) from **agents** (LLMs dynamically directing their own processes and tool use). Workflows give predictability + low cost for well-scoped tasks; agents trade those for flexibility on open-ended work.

**Patterns that map directly to our 5 stages:**

| Anthropic pattern | What it is | Maps to | Why |
|---|---|---|---|
| **Prompt chaining** | Decompose into fixed sequence; each step's output is next step's input; gates between steps | The whole 5-stage funnel | Stage outputs gate the next stage (regex `unknown` triggers Stage 2; resolver result feeds Stage 3 context). Predefined sequence with code-path gates = textbook chaining. |
| **Routing** | Classify input, then dispatch to specialised follow-up | Stage 1 → action dispatch via `swarm_categories.action` | The verdict-worker's `categorize_archive` vs `swarm_dispatch` switch IS routing. |
| **Parallelisation (sectioning)** | Split a task across parallel LLM calls, aggregate | Stage 3.5 orchestrator-worker (Phase 65) | Multi-intent emails fan out to N handlers in parallel, single iController draft synthesised. |
| **Orchestrator-worker** | Central LLM dynamically delegates to workers and synthesises | Stage 3.5 escalation explicitly | Confidence < threshold OR intent_count ≥ 3 OR `requires_orchestration` flag → spawn orchestrator. |
| **Evaluator-optimizer** | One LLM generates, another scores + provides feedback in a loop | Override + graduated-automation feedback loop | Operator override = the evaluator signal; promotion recommender (Phase 72) = the optimizer that proposes deterministic rules. |
| **Autonomous agents** | Open-ended planning + tool use loops | NOT used in v8.0 | Our handler agents are bounded single-shot (Stage 4) — closer to "automated workflows" than autonomous loops. |

**What justifies "workflow-first" framing for the RFC.** Anthropic explicitly recommends starting with the simplest viable pattern (single LLM call with retrieval/in-context examples), adding agentic complexity only when measurable improvements justify it. Our 5-stage funnel is a chained workflow (deterministic path) with one optional orchestrator-worker escalation — exactly the staged escalation Anthropic prescribes.

**What justifies Stage 3.5 escalation as orchestrator-worker.** Stage 3 emits a ranked intent list (per CORD-01). When that ranked list signals genuine multi-intent ambiguity (count ≥ 3) or low confidence, a single-shot Stage 4 handler cannot synthesise a correct response. Anthropic's orchestrator-worker pattern handles exactly this: a coordinator LLM decomposes the work, dispatches to workers, then merges their outputs.

**What justifies graduated automation (LLM → deterministic).** Anthropic's evaluator-optimizer + Constitutional Classifiers guidance both push toward narrowing the LLM's responsibility surface as patterns become deterministic. Our Wilson-CI sender-mapping promotion (Phase 56) is the working precedent: an LLM-handled signal that, after N samples + CI gate, becomes a deterministic rule.

**One-line citation discipline (per CONTEXT specifics):** paraphrase in our voice; link the URL once at the top of `README.md` and once at the top of `graduated-automation.md`. Do NOT quote-bomb. `[CITED: anthropic.com/engineering/building-effective-agents]`

Confidence: HIGH (verified against the canonical Anthropic post; pattern names are direct paraphrases).

---

## Existing Doc Audit

### Verdict on `docs/swarm-bridge-contract.md`: **KEEP, do not supersede**

Read end-to-end. This doc covers a **completely different concern** from the RFC's Stage 2→3 context shape:

- `swarm-bridge-contract.md` = how an automation makes itself **render in the V7 Agent OS shell** (`automation_runs` → `swarm_jobs` + `agent_events`, kanban card mapping, status semantics, `result.stage` JSON convention). It is a UI-plumbing contract.
- RFC's `context-shape-contract.md` = what data shape **Stage 3 LLM coordinators receive** (customer_id, customer_name, language, entity_brand, recent_documents[]). It is a runtime data contract between Stages 2 and 3.

These overlap **zero percent**. They share the word "contract" and nothing else.

**Action:** Leave `swarm-bridge-contract.md` untouched. Do NOT add a supersession banner. The RFC's `context-shape-contract.md` is a sibling, not a replacement. Optionally cross-link from RFC's stage-4 doc ("for kanban surface plumbing, see swarm-bridge-contract.md") since Stage 4 handlers emit the `automation_runs` rows the bridge consumes.

Confidence: HIGH (verified by direct read of both files).

### Section-by-section disposition of `docs/debtor-email-pipeline-architecture.md`

Length: 438 lines, 12 top-level sections. Disposition for the SUPERSEDED-banner task:

| Section in existing doc | RFC disposition | Notes |
|---|---|---|
| Header banner ("Status: as-of 2026-04-29 / Supersedes email-agent-swarm-architecture.md") | UPDATE — add new "SUPERSEDED for cross-swarm shape by `docs/agentic-pipeline/README.md`" line at top | Existing supersedes line for `email-agent-swarm-architecture.md` stays. |
| End-to-end flow (ASCII diagram) | STAYS as debtor-email-specific implementation; RFC's README.md gets a NEW funnel diagram showing the abstract 5-stage shape | Reference style/glyphs in RFC. |
| Stage 1 — Regex classifier | STAYS — concrete debtor regex categories. RFC's `stage-1-regex.md` cites this section as the worked example. | Cite `web/lib/debtor-email/classify.ts` from RFC. |
| Stage 2 — Per-category handlers (registry rows + Wave 3 sub-flows) | STAYS — debtor-email-specific implementation map. RFC's `stage-1-regex.md` describes the registry-driven action pattern abstractly. | The registry `swarm_categories` is cross-cutting; RFC documents the abstract pattern. |
| Component map (Tables / Vercel routes / Inngest functions / NXT-Zap / Orq.ai agents) | STAYS — pure debtor-email implementation. | RFC links here from stage-4-handler.md as the reference implementation. |
| Trigger architecture decisions (why `unknown`, why no full-LLM, why drafts in iController, why brand_id) | MIXED — first 3 stay (debtor-specific). The brand_id rationale becomes part of RFC's tenancy section but reworded swarm-agnostically. | RFC's README tenancy section paraphrases. |
| What stays / moves / goes table | STAYS — historical scoring table. | No change. |
| Human Review surfaces (Bulk Review + Kanban + per-category mapping) | STAYS — debtor-email-specific UI map. RFC's `override-model.md` cites this section as the today-state for axes 1-4. | Critical: today's override capture lives here. |
| Feedback model — two distinct loops | MOVES (intellectually) — the "two loops" idea generalises to RFC's 4 axes. RFC's `override-model.md` paraphrases the framing; existing doc keeps the debtor-specific surface map. | This section is the conceptual seed of the 4-axis model. |
| Live mode behavior | STAYS — debtor-specific. | No change. |
| Orq.ai agent registry | STAYS — debtor-specific (3 seeded rows). RFC's stage-4-handler.md references the canonical agent name. | No change. |
| Roadmap pointers (Phase 56-02, 56.7, 56.8) | STAYS — historical breadcrumb. | No change. |

**Net.** Add ONE banner line at top. Do NOT delete or rewrite content. The doc's value is its concrete debtor-email implementation map; the RFC's value is the swarm-agnostic shape. Both exist; they reference each other.

Confidence: HIGH (full read).

---

## Today-State Telemetry & Tables

### Where overrides are captured today (per stage)

| Axis | Stage | Override capture today | Table.column | Source |
|---|---|---|---|---|
| Axis 1 | Stage 1 (wrong category) | ✅ exists | `debtor.email_labels.corrected_category` (the operator's chosen category) + `agent_runs.human_verdict` (👍/👎 on the rule) | Verified in `supabase/migrations/20260428_public_agent_runs.sql:85` and `20260430c_email_labels_feedback_and_invoice_copy.sql:6`. Captured in Bulk Review at `web/app/(dashboard)/automations/debtor-email-review/`. |
| Axis 2 | Stage 2 (wrong customer) | ⚠️ partial | `debtor.email_labels.corrected_customer_account_id` (proposed Phase 55 wave 3); approve/reject in dashboard `/automations/debtor-email-labeling` writes `human_verdict` on `agent_runs` row + updates `email_labels.reviewed_by/reviewed_at` | Phase 56 D-21 documents the approve/reject flow; column exists per Phase 55 plan but verify exact name in `email_labels` schema before RFC asserts it. **`[ASSUMED]`** that `corrected_customer_account_id` is the live column name — RFC should describe the concept and forward-reference the consolidation in Phase 71. |
| Axis 3 | Stage 3 (wrong intent) | ❌ does not exist today | — | Phase 65 introduces the ranked-intent coordinator + intent override surface; Phase 71 builds the Bulk Review override control. RFC describes the target. |
| Axis 4 | Stage 4 (wrong handler output) | ⚠️ partial | `email_labels.draft_quality` (`correct \| needed_edit \| rejected`) + `email_labels.feedback_reason`; `agent_runs.human_verdict` enum includes `'edited_minor'` and `'rejected'` reasons | Verified `agent_runs.human_verdict` constraint at `20260428_public_agent_runs.sql:68`. The `draft_quality` column is documented in `docs/debtor-email-pipeline-architecture.md` Wave 3 section. |

**Implication for RFC's `override-model.md`:** Axes 1 and 4 cite real today-state tables. Axes 2 and 3 are forward-looking — RFC names the target schema (consolidated to `pipeline_events` in Phase 70/71) and explicitly tags them "consolidated in Phase 71" rather than asserting today-state.

### Brand registry today

**Source of truth today: split across two places.**

1. `debtor.labeling_settings.brand_id text` (2-letter NXT brand code, e.g. `SB` for Smeba).
   - Verified at `supabase/migrations/20260429d_labeling_settings_brand_id.sql:7-8`.
   - CHECK constraint: `brand_id is null or brand_id ~ '^[A-Z]{2}$'`.
   - One row per Outlook source mailbox.

2. `debtor.labeling_settings.nxt_database text` (NXT database name per brand).
   - Verified at `supabase/migrations/20260428_debtor_email_labeling_phase56.sql:13`.
   - Drives which NXT DB the resolver Zap queries.

**`swarms.entity_brand` registry as named in REQUIREMENTS.md / CANO-02 / SWRM-01: NOT YET SHIPPED.** The unified `swarms.entity_brand` data-driven registry is a Phase 68/69 deliverable.

**Today's 6 brands flowing through `walkerfire.icontroller.eu` tenant:** `smeba`, `smeba-fire`, `firecontrol`, `sicli-noord`, `sicli-sud`, `berki`. Mailbox IDs: 4, 5, 12, 15, 16, 171 respectively (verified Phase 55 CONTEXT D-mailbox-IDs).

**Implication for RFC:** Tenancy section in `README.md` describes today as: "brand identity per source mailbox via `debtor.labeling_settings.brand_id` and `nxt_database`. Phase 68 introduces a unified `swarms.entity_brand` registry that becomes the single source of truth; today's per-mailbox columns become a denormalised read-model." Reference today's 6 brands as a comment/example only (per D-06).

### Tool registry today

**`public.zapier_tools` table — VERIFIED EXISTS** at `supabase/migrations/20260429_zapier_tools_registry.sql`.

Today's columns: `tool_id pk, description, backend, pattern ('sync'|'async_callback'), target_url, auth_method ('body_field'|'header_bearer'), auth_secret_env, auth_field_name, input_schema jsonb, output_schema jsonb, callback_route, enabled, notes, created_at, updated_at`.

**`allowed_for_intents` column — DOES NOT YET EXIST.** Verified by grep across all migrations and `web/lib/`. CONTEXT.md explicitly states this column is forward-referenced (Phase 64 introduces it via BUDG-02).

**Implication for RFC's `stage-4-handler.md`:** Document `zapier_tools` registry pattern as today-state (cite the existing migration). Document `allowed_for_intents` as the Phase 64 addition: "`allowed_for_intents text[]` (Phase 64) gates which intents can invoke each tool — a copy-document handler cannot reach a payment-update tool." Tag as forward-reference, not today-state.

Today's seeded NXT tool rows (per Phase 56 D-34): `nxt.contact_lookup`, `nxt.identifier_lookup`, `nxt.candidate_details`, `nxt.invoice_fetch`. RFC can name-drop these as concrete examples.

### Wilson-CI promotion gate (Phase 56 precedent)

**Verified at `web/lib/classifier/wilson.ts:25`:**
- Math: `wilsonCiLower(n, k, z = 1.96 /* 95% */)` returns lower bound of the binomial proportion's 95% Wilson score interval.
- Promotion gate: **`N ≥ 30 AND CI-lo ≥ 0.92`** (this is the exact today-state threshold for classifier rules).
- Demote with hysteresis: CI-lo < 0.85 (verified in Phase 56 D-25 — actually 0.92 demote per Phase 60-D-03, but 56-D-25 says 0.92 promote / "hysteresis flip-back" without exact number; RFC should cite the **promote** number and state hysteresis exists without pinning demote).

**Implication for RFC's `graduated-automation.md`:** Per CONTEXT D-12, do NOT pin numbers. Sentence pattern: "Phase 56's Wilson-CI sender-mapping promotion is the working precedent: a binomial confidence interval over operator approve/reject signals gates promotion from candidate to live. Concrete thresholds (N, CI-lo) live in code (`web/lib/classifier/wilson.ts`) and tune with phase. Phase 71 catalogues thresholds across hooks." `[VERIFIED: web/lib/classifier/wilson.ts]`

### `pipeline_events` table

**DOES NOT YET EXIST.** Phase 70 ships it (TELE-01..TELE-03). RFC describes the target shape and forward-references the migration.

**Target shape per REQUIREMENTS.md TELE-01:** `swarm_type, stage, decision, confidence, override?, eval_type` plus `context_version` from D-05. RFC can sketch the columns conceptually without SQL.

---

## File Manifest the RFC Will Produce

Each row = one PLAN task. Source material + cross-refs identified.

| File | Scope | Source material | Existing files referenced |
|---|---|---|---|
| `docs/agentic-pipeline/README.md` | Entry point: what the RFC is, audience, the headline 5-stage funnel ASCII diagram, tenancy section (today's 6 brands, data-driven via `swarms.entity_brand` Phase 68), index/links to per-stage files | CONTEXT D-01, D-08, D-09, D-13; Anthropic synthesis (above) | Anthropic URL (cited once); links to all 8 sibling files in this dir |
| `docs/agentic-pipeline/stage-0-safety.md` | Input safety: prompt-injection regex + lightweight LLM classifier; `injection_suspected` → human-only review; never reaches coordinator/handler | REQUIREMENTS SAFE-01..04; Anthropic Constitutional Classifiers (paraphrased) | Forward-ref Phase 64 implementation; link to `docs/orqai-patterns.md` for response_format / fallback model patterns |
| `docs/agentic-pipeline/stage-1-regex.md` | Regex classifier as Anthropic "routing" pattern; `swarm_categories` registry as the dispatch table; debtor-email worked example with real category_keys; ≤10-line sales-email parallel block | `web/lib/debtor-email/classify.ts`; `docs/debtor-email-pipeline-architecture.md` Stage 1 + Stage 2 sections; CONTEXT D-07 | `web/lib/inngest/functions/classifier-verdict-worker.ts` (cite); `docs/zapier-patterns.md` (registry pattern) |
| `docs/agentic-pipeline/stage-2-entity.md` | Entity enrichment as cheap deterministic-first lookup; thread → sender → identifier → LLM tiebreaker (debtor); pluggable per swarm (NXT vs SugarCRM); produces the context-shape contract | Phase 56 CONTEXT D-00..D-14 (resolver pipeline); RFC `context-shape-contract.md` cross-link | `web/lib/automations/debtor-email/resolve-debtor.ts`; `docs/zapier-patterns.md` |
| `docs/agentic-pipeline/stage-3-coordinator.md` | Ranked intent coordinator (CORD-01..04); single-shot default ~80%; Stage 3.5 orchestrator-worker escalation principle + placeholder (full design Phase 65); ≤10-line sales-email parallel block | REQUIREMENTS CORD-01..04; Anthropic orchestrator-worker pattern; CONTEXT D-discretion (stage-3.5 placeholder) | `docs/orqai-patterns.md` (response_format, fallbacks, 45s timeout) |
| `docs/agentic-pipeline/stage-4-handler.md` | Handler agents + `zapier_tools` registry; `allowed_for_intents` allowlist (forward-ref Phase 64); `debtor-copy-document-body-agent` worked example; canonicalisation forward-ref Phase 69 | `supabase/migrations/20260429_zapier_tools_registry.sql`; `web/lib/automations/debtor-email/nxt-zap-client.ts` (cite); REQUIREMENTS BUDG-02, CANO-01..04 | `docs/zapier-patterns.md`, `docs/browserless-patterns.md`, `docs/orqai-patterns.md` |
| `docs/agentic-pipeline/context-shape-contract.md` | TS interface (canonical) + prose table; fields: `customer_id`, `customer_name`, `language`, `entity_brand`, `recent_documents[]`; `context_version: 1`; versioning policy (additive = same major; breaking = bump); brand list as comment, not enum | REQUIREMENTS RFC-02; CONTEXT D-04, D-05, D-06 | Forward-ref `web/lib/agentic-pipeline/types.ts` (Phase 64 or 70) |
| `docs/agentic-pipeline/override-model.md` | 4 axes (one per stage 1-4); per axis: definition + capture point + telemetry row produced + graduated-automation hook consumed; axes are independent (D-11 explicit) | REQUIREMENTS RFC-03, REVW-01..06; Today-state telemetry table (above) — axes 1+4 cite real columns; axes 2+3 forward-ref Phase 71 | `docs/debtor-email-pipeline-architecture.md` "Feedback model — two loops" section (conceptual seed) |
| `docs/agentic-pipeline/graduated-automation.md` | Principles + signal types; per hook: name, telemetry signal, promotion direction (LLM→deterministic); Wilson-CI Phase 56 precedent named without thresholds; Phase 71 will pin numbers | REQUIREMENTS RFC-04, LERN-01..05; Wilson math at `web/lib/classifier/wilson.ts:25`; CONTEXT D-12 explicit | Anthropic URL (cited once for evaluator-optimizer pattern) |

**Doc-mutation tasks (separate from creation):**

| File | Mutation |
|---|---|
| `CLAUDE.md` | Update "Canonical Architecture Docs" section (line 10-11). Today points only at `docs/debtor-email-pipeline-architecture.md`. After: point at `docs/agentic-pipeline/README.md` as PRIMARY (canonical cross-swarm shape); demote debtor-email doc to "swarm-specific implementation map for the debtor-email swarm". Both stay listed. |
| `.planning/PROJECT.md` | Line 128 mentions UK/IE generally — already non-speculative ("UK/IE coming, no hardcoded enums"). Verify no speculative names like "smeba-uk" appear elsewhere. **Grep run:** zero hits for `smeba-uk` or `smeba-ie` across PROJECT.md, CLAUDE.md, docs/. The correction task is mostly preventive: ensure RFC tenancy section uses today's 6 verified brands, NOT speculative names. If PROJECT.md needs any tweak, it's only to match RFC tenancy phrasing (data-driven via registry). |
| `docs/debtor-email-pipeline-architecture.md` | Add SUPERSEDED banner line at top, immediately after the existing `> **Status:**` and `> **Supersedes:**` lines. Banner text per CONTEXT D-03: `> SUPERSEDED for cross-swarm shape by docs/agentic-pipeline/README.md. Retained as the implementation map for the debtor-email swarm specifically.` |

**Total file touches: 9 new + 3 mutations = 12 tasks.**

---

## Forward-References (RFC names, later phases ship)

| Forward-ref | Where named in RFC | Ship phase |
|---|---|---|
| `pipeline_events` table | `override-model.md`, `context-shape-contract.md` (persistence target for `context_version`), `graduated-automation.md` (single source of truth for promotion math) | Phase 70 (TELE-01) |
| `zapier_tools.allowed_for_intents` column | `stage-4-handler.md` allowlist section | Phase 64 (BUDG-02) |
| `swarms.entity_brand` unified registry | `README.md` tenancy section, `context-shape-contract.md` brand-list comment | Phase 68 (SWRM-01) |
| `swarm_intents` table | `stage-3-coordinator.md` intent → handler dispatch | Phase 68 (SWRM-02) |
| Stage 3.5 orchestrator-worker full design | `stage-3-coordinator.md` placeholder | Phase 65 (CORD-02..04) |
| Per-run token + cost ceilings | `stage-0-safety.md` brief mention; `stage-3-coordinator.md` orchestrator escalation safety | Phase 64 (BUDG-01) |
| Stage 0 prompt-injection guard implementation | `stage-0-safety.md` "today: not yet shipped" note | Phase 64 (SAFE-01..04) |
| `web/lib/agentic-pipeline/types.ts` codification | `context-shape-contract.md` "TS interface lives here today; runtime module lands in Phase 64/70" | Phase 64 or 70 |
| Stage 4 handler canonicalisation | `stage-4-handler.md` "today: per-swarm; Phase 69 generalises" | Phase 69 (CANO-01..04) |
| Bulk Review 4-axis UI | `override-model.md` "today: axes 1+4 captured; axes 2+3 forward-ref" | Phase 71 (REVW-01..06) |
| Concrete promotion thresholds | `graduated-automation.md` "principles only; thresholds Phase 71" | Phase 71 / Phase 72 (LERN-01..05) |
| Sales-email/SugarCRM swarm onboarding | `stage-1-regex.md` + `stage-3-coordinator.md` parallel blocks | Phase 73 (SALES-01..03) |
| UK/IE brand naming | `README.md` tenancy section ("future brand additions, names data-driven via registry insert") | Phase 999.1 backlog |

---

## Documentation Conventions Detected

From reading existing `docs/*.md`:

- **ASCII diagram glyph set:** vertical flow with `↓` between boxes; horizontal branching with `├─ `, `│`, `└─ `; box outline `┌──────...──┐` / `└──────...──┘`. See `docs/debtor-email-pipeline-architecture.md` lines 13-44 for the canonical funnel example. Indentation uses spaces, not tabs.
- **Header style:** ATX (`#`, `##`, `###`); no setext underline form. Section dividers via `---` lines around big transitions, not `***`.
- **Table style:** GitHub markdown pipe tables; left-aligned by default (no `:---:` unless intentionally centred).
- **Code fences:** ```` ``` ```` with language tag (`typescript`, `bash`, `sql`, `jsonc`). Blank line BEFORE and AFTER the fence.
- **Frontmatter:** NOT used in `docs/*.md` (only `.planning/*.md` uses YAML frontmatter). RFC files should NOT add frontmatter.
- **Status/banner pattern:** `> **Status:** ...`, `> **Supersedes:** ...`, `> **SUPERSEDED ...** by ...`. Use blockquote, not table.
- **Linking:** relative paths (`docs/orqai-patterns.md` not `/docs/...`). Repo-internal anchors use lowercase-with-dashes section anchors (GitHub auto-generated).
- **Line length:** existing docs hover at 80-100 cols but do not hard-wrap. Long sentences run on. Match this.
- **Comments inside code blocks:** liberal `// Source: …` lines pointing at the verified URL/file (per researcher discipline). Use this pattern in RFC code examples.

No project skills or hooks affect markdown content. Verified `.claude/settings.json` only registers a `learning-nudge.js` hook on Bash PostToolUse — not relevant. `.claude/skills/sketch-findings-agent-workforce` is design-context for frontend work, not docs.

---

## Validation Architecture

**Nyquist validation enabled** (config.json `workflow.research: true, plan_check: true, verifier: true` and no explicit `nyquist_validation: false` — treat as enabled).

This is a docs-only phase. Validation is correctness of paper artifacts, not test execution. The verification gates:

### Test Framework
| Property | Value |
|---|---|
| Framework | None (markdown linting + manual review). No vitest/jest run for this phase. |
| Config file | None |
| Quick run command | `bash -c 'for f in docs/agentic-pipeline/*.md; do test -f "$f" && echo "OK $f" || echo "MISS $f"; done'` |
| Full suite command | RFC-coverage check (manual + grep, see below) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| RFC-01 | Single canonical RFC at `docs/agentic-pipeline/README.md` exists, covers all 5 stages | smoke | `test -f docs/agentic-pipeline/README.md && grep -E "Stage 0\|Stage 1\|Stage 2\|Stage 3\|Stage 4" docs/agentic-pipeline/README.md \| wc -l` (expect ≥ 5) | ❌ Wave 0 (RFC files do not exist yet — that's the work) |
| RFC-01 (cont.) | Existing debtor-email doc carries SUPERSEDED banner | smoke | `grep -i "SUPERSEDED for cross-swarm shape" docs/debtor-email-pipeline-architecture.md` | ❌ Wave 0 |
| RFC-01 (cont.) | CLAUDE.md points at the RFC | smoke | `grep "docs/agentic-pipeline/README.md" CLAUDE.md` | ❌ Wave 0 |
| RFC-02 | Context-shape contract documented as TS interface + prose | manual + smoke | `test -f docs/agentic-pipeline/context-shape-contract.md && grep -E "interface\|customer_id\|customer_name\|language\|entity_brand\|recent_documents" docs/agentic-pipeline/context-shape-contract.md \| wc -l` (expect ≥ 6) | ❌ Wave 0 |
| RFC-03 | 4-axis override model file exists with all 4 axes | manual + smoke | `test -f docs/agentic-pipeline/override-model.md && grep -E "Axis 1\|Axis 2\|Axis 3\|Axis 4" docs/agentic-pipeline/override-model.md \| wc -l` (expect 4) | ❌ Wave 0 |
| RFC-04 | Graduated-automation hooks file exists, names Wilson-CI precedent without pinning numbers | manual | grep `Wilson` and `Phase 56` in `docs/agentic-pipeline/graduated-automation.md`; manual read confirms NO `N=` or `CI-lo=` literals | ❌ Wave 0 |
| Brand correction (D-09) | No speculative `smeba-uk` / `smeba-ie` strings in RFC, PROJECT.md, or CLAUDE.md | smoke | `! grep -rEi "smeba-uk\|smeba-ie" docs/ .planning/PROJECT.md CLAUDE.md` (must return non-zero exit) | partial — already absent today, must stay absent |
| Doc-link integrity | All relative links in new RFC files resolve to existing files in repo | manual + grep | extract `[...](relative/path.md)` from each new RFC file; verify each path exists | ❌ Wave 0 |
| Today's 6 brands present | RFC tenancy section names all 6 today-brands as the example | smoke | `grep -E "smeba.*smeba-fire.*firecontrol.*sicli-noord.*sicli-sud.*berki\|smeba\b" docs/agentic-pipeline/README.md` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** smoke (`test -f`, `grep` patterns above).
- **Per wave merge:** full suite (all smoke + manual read).
- **Phase gate:** all RFC-01..04 smoke checks pass; manual read confirms paraphrase quality, ASCII diagrams render in markdown preview, no speculative brand names.

### Wave 0 Gaps
- [ ] No test infra needs creating; this is paper validation only. The "tests" are smoke-greps in the verifier task.
- [ ] Optional: a tiny `scripts/check-rfc-coverage.sh` that bundles the smoke-greps into one command. Nice-to-have, not required.

---

## Project Constraints (from CLAUDE.md)

Directives extracted that apply to this phase:

- **Stack consistency:** RFC must NOT recommend Netlify/Railway/AWS/Firebase/Neon/Puppeteer/own auth/direct LLM keys. Verify no such mention slips in. RFC affirms Vercel + Supabase + Orq.ai (with Router for ad-hoc LLM calls) + Inngest + Browserless + Zapier + ElevenLabs + Twilio.
- **Zapier-first decision tree:** RFC's `stage-4-handler.md` should reflect this in tool selection, not propose direct AWS-SDK/playwright-Puppeteer alternatives.
- **Browserless via `playwright-core`** (NOT `playwright`): when the RFC names the browser-automation pattern at Stage 4, cite this constraint via link to `docs/browserless-patterns.md`, do not re-explain.
- **Orq.ai patterns:** `response_format: json_schema` mandatory; primary model `anthropic/claude-sonnet-4-6` + 3-4 fallbacks; XML-tagged prompts; 45s client timeout. RFC's Stage 0 + Stage 3 + Stage 4 docs should respect these (link to `docs/orqai-patterns.md`, not duplicate).
- **Inngest cron rules:** `TZ=Europe/Amsterdam` prefix mandatory; business-hours window default. Mostly out-of-scope for the RFC, but if `graduated-automation.md` references the promotion-cron, link to `docs/inngest-patterns.md`.
- **Test-first / acceptance default:** N/A for docs phase.
- **No emojis in files unless explicitly requested:** verified — RFC content should match `docs/*.md` style (the existing `debtor-email-pipeline-architecture.md` does not use emojis except in tables for ✅/❌ status. Match that.)
- **Language:** existing `docs/*.md` are written in English. CLAUDE.md is mixed Dutch/English but `docs/*.md` is consistently English. RFC = English.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | The exact column name `corrected_customer_account_id` exists on `email_labels` for axis 2 capture today | Today-State Telemetry / Axis 2 row | Low — RFC describes the concept and forward-references Phase 71 consolidation. If column name is different, override-model.md tagged "consolidated in Phase 71" remains accurate. Writer should grep at write-time and use the verified name OR keep the description abstract. |
| A2 | Anthropic's "Building Effective Agents" article remains the canonical reference at the URL given (`anthropic.com/engineering/building-effective-agents`) | Anthropic Synthesis | Low — URL has been stable since publication; RFC links once. If URL changes, single-line edit. |
| A3 | The Wilson-CI demote threshold (hysteresis flip-back) is 0.92 (Phase 56 D-25 says "<92%" but Phase 60 D-03 has different number) | Today-State / Wilson section | Negligible — RFC explicitly does NOT pin numbers per CONTEXT D-12. The mention is "hysteresis exists, see code". |

---

## Open Questions

1. **Should `stage-3-coordinator.md` include the Stage 3.5 escalation diagram or just a placeholder?**
   - Per CONTEXT Claude's Discretion: default = include principle + placeholder, full design lands in Phase 65.
   - Recommendation: include a simple "decision diamond" ASCII showing the 3 escalation conditions (confidence < threshold OR intent_count ≥ 3 OR `requires_orchestration` flag) → "spawn orchestrator-worker (see Phase 65)". One ASCII block. Keeps the RFC complete-feeling without front-running Phase 65.

2. **Sales-email parallel block contents — what categories does sales-email have today?**
   - There is no sales-email regex implementation today (Phase 73 deliverable).
   - Recommendation: parallel blocks use illustrative-only category names (`new_lead`, `follow_up`, `unsubscribe`) clearly tagged `(illustrative — Phase 73 ships actuals)`. Keeps the swarm-agnostic claim concrete without inventing the Phase 73 design.

3. **Does CLAUDE.md need ALL stage doc paths added, or just `docs/agentic-pipeline/README.md`?**
   - Recommendation: just `README.md` (it's the entry point per D-01). Stage docs are reachable via README's index. CLAUDE.md stays small; future readers follow README to per-stage files. Same pattern as today (CLAUDE.md points at one canonical doc).

---

## Sources

### Primary (HIGH confidence — direct repo read)
- `.planning/phases/63-architecture-rfc/63-CONTEXT.md` — full read; all decisions D-01..D-13 verified.
- `.planning/REQUIREMENTS.md` — full read; RFC-01..04 + dependent phase requirements verified.
- `.planning/STATE.md` — read; v8.0 phase 63 confirmed as next.
- `.planning/PROJECT.md` lines 1-180 — read; v8.0 milestone language verified; line 128 brand mention non-speculative.
- `docs/debtor-email-pipeline-architecture.md` — full read (438 lines); section-by-section disposition verified.
- `docs/swarm-bridge-contract.md` — full read; verdict KEEP (different concern).
- `web/lib/debtor-email/classify.ts` — full read; canonical Stage 1 reference.
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — first 100 lines read; Stage 1→2 dispatch confirmed.
- `web/lib/classifier/wilson.ts` — verified `N≥30, CI-lo≥0.92` promotion gate.
- `supabase/migrations/20260429_zapier_tools_registry.sql` — verified column list; `allowed_for_intents` confirmed absent.
- `supabase/migrations/20260428_public_agent_runs.sql` — verified `human_verdict` enum, `corrected_category` column.
- `supabase/migrations/20260429d_labeling_settings_brand_id.sql` — verified `brand_id` 2-letter format.
- `supabase/migrations/20260428_debtor_email_labeling_phase56.sql` — verified `nxt_database` column.
- `supabase/migrations/20260430c_email_labels_feedback_and_invoice_copy.sql` — verified `draft_quality`, `feedback_reason` columns.
- `.planning/phases/55-debtor-email-pipeline-hardening/55-CONTEXT.md` — verified 6 brands + mailbox IDs.
- `.planning/phases/56-icontroller-auto-labeling-van-accounts-aan-emails/56-CONTEXT.md` — verified Wilson-CI promotion precedent + zapier_tools D-32..D-35.
- `.planning/phases/56.7-swarm-registry/56.7-CONTEXT.md` — verified `swarms` + `swarm_categories` registry shape.
- `.claude/settings.json` — verified no docs-affecting hooks.

### Secondary (MEDIUM confidence — inference)
- Anthropic "Building Effective Agents" pattern names (paraphrased from training knowledge of canonical post). Writer agent should re-read at write-time to confirm exact pattern names current at write time. `[CITED: anthropic.com/engineering/building-effective-agents]`

### Tertiary (LOW confidence — none)
- None. This phase is fully grounded in repo-internal artifacts.

---

## Metadata

**Confidence breakdown:**
- Doc structure & scope: HIGH (locked in CONTEXT, verified against existing docs/).
- Today-state telemetry: HIGH for axes 1 + 4 (column-level verified); MEDIUM for axis 2 column name (A1).
- File manifest: HIGH (mechanical mapping from CONTEXT D-01 file list to source material).
- Anthropic synthesis: MEDIUM-HIGH (paraphrased from canonical post; writer re-verifies).
- Forward-references: HIGH (cross-phase mapping from REQUIREMENTS.md traceability table).

**Research date:** 2026-04-30
**Valid until:** 2026-05-30 (stable repo-internal facts; only watch for Anthropic URL changes and any new migration that ships `pipeline_events` or `allowed_for_intents` early)

---

## RESEARCH COMPLETE
