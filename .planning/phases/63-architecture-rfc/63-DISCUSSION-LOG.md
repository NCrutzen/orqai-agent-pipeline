# Phase 63: Architecture RFC - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 63-architecture-rfc
**Areas discussed:** Doc structure & scope, Context-shape contract notation, Worked examples & swarms, Supersession + automation hooks + diagrams

---

## Doc structure & scope

### Q: How should the RFC be structured?

| Option | Description | Selected |
|--------|-------------|----------|
| Single doc, all stages | One agentic-pipeline-architecture.md (~1500-2500 lines) covering all 5 stages | |
| Index + per-stage files | README + per-stage/per-spec files under `docs/agentic-pipeline/` | ✓ |
| Single doc + 2 sidecar specs | Main RFC + context-shape-contract.md + override-model.md | |

**User's choice:** Index + per-stage files
**Notes:** Layout: `docs/agentic-pipeline/` containing README.md, stage-{0..4}-*.md, context-shape-contract.md, override-model.md, graduated-automation.md.

### Q: What sits IN the RFC vs linked out?

| Option | Description | Selected |
|--------|-------------|----------|
| RFC self-contained (Recommended) | Citations + contract + overrides inline; only links to implementation patterns | ✓ |
| RFC thin, links heavily | RFC as index, content in linked docs | |
| RFC self-contained for principles, links for examples | Hybrid | |

**User's choice:** RFC self-contained
**Notes:** Each per-stage / per-spec file is fully self-contained; outbound links only to existing pattern docs (browserless, orqai, zapier, inngest, supabase).

---

## Context-shape contract notation

### Q: How should the Stage 2→3 context-shape contract be expressed?

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript + prose (Recommended) | TS interface as canonical + prose table for semantics | ✓ |
| JSON Schema + prose | Language-agnostic but no current JSON Schema infra | |
| Prose-only with table | Lowest friction, loses type-checking story | |

**User's choice:** TypeScript + prose
**Notes:** TS interface is the source of truth; downstream phases codify it in web/lib/.

### Q: Should the contract include a versioning strategy?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — explicit `context_version` field (Recommended) | `context_version: 1` from day 1; persisted in pipeline_events | ✓ |
| No — evolve via additive optional fields | Defer until needed | |
| Defer to a later phase | Out of scope | |

**User's choice:** Yes — explicit `context_version` field

---

## Worked examples & swarms

### Q: How concrete should the worked examples be?

| Option | Description | Selected |
|--------|-------------|----------|
| Debtor-email throughout, sales-email cameo (Recommended) | Debtor-email running example; short sales-email parallel in stage-1 + stage-3 | ✓ |
| Both swarms in parallel columns everywhere | Doubles doc size, front-runs Phase 73 | |
| Abstract architecture, examples in appendix | Cleanest separation, weakest motivation | |

**User's choice:** Debtor-email throughout, sales-email cameo

### Q: How explicit should the brand-multitenancy story be in the RFC?

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated tenancy section in README + cross-references (Recommended) | Single section in README with today's brand list; stage docs cross-reference | ✓ (with correction) |
| Weave tenancy into each stage doc inline | More repetitive but locally complete | |
| Single line in README, defer details | Minimal | |

**User's choice:** Option 1, but with brand-name correction
**Notes:** **Critical correction:** UK/IE brands are NOT "smeba-uk/-ie" (PROJECT.md is wrong). `walkerfire.icontroller.eu` is the iController tenant, not a brand. Today's 6 brands: smeba, smeba-fire, firecontrol, sicli-noord, sicli-sud, berki. UK/IE names TBD. RFC must correct PROJECT.md and any other doc using the speculative names.

---

## Supersession + automation hooks + diagrams

### Q: How should `docs/debtor-email-pipeline-architecture.md` be retired?

| Option | Description | Selected |
|--------|-------------|----------|
| Banner + keep as swarm-specific addendum (Recommended) | SUPERSEDED banner; doc stays as debtor-email implementation map | ✓ |
| Banner only, no further changes | Just the banner | |
| Annotate sections inline as superseded | Per-section banners | |

**User's choice:** Banner + keep as swarm-specific addendum
**Notes:** CLAUDE.md updated to point at both: RFC for canonical shape, debtor doc for that swarm's implementation.

### Q: How concrete should graduated automation hooks be in the RFC?

| Option | Description | Selected |
|--------|-------------|----------|
| Principles + signal types, thresholds deferred (Recommended) | Names + signals + direction; concrete thresholds in Phase 71 | ✓ |
| Concrete thresholds in RFC | Pin numbers using Phase 56 Wilson-CI precedent | |
| Examples only, no formal model | Lightest, weakest contract | |

**User's choice:** Principles + signal types, thresholds deferred
**Notes:** Phase 56's Wilson-CI sender-mapping precedent named as the working pattern; concrete numbers deferred to Phase 71 (Learning Inbox).

### Q: Diagram style?

| Option | Description | Selected |
|--------|-------------|----------|
| ASCII (matches existing pattern, Recommended) | Continues debtor-email-pipeline-architecture.md style | ✓ |
| Mermaid | Better for complex flows but harder to diff | |
| Both — ASCII for high-level, Mermaid for detailed | Most effort, richest result | |

**User's choice:** ASCII

---

## Claude's Discretion

- Exact section order within each per-stage doc (consistent template across stages).
- Length/depth of Anthropic citation blocks (paraphrase preferred).
- ASCII glyph/spacing choices.
- Whether `stage-3-coordinator.md` includes Stage 3.5 orchestrator-worker diagram now or defers detail to Phase 65 — default: include principle + placeholder.

## Deferred Ideas

- Concrete graduated-automation thresholds → Phase 71 (Learning Inbox).
- Stage 3.5 orchestrator-worker full design → Phase 65.
- Sales-email/SugarCRM swarm onboarding → Phase 73.
- TS contract codification in `web/lib/` → Phase 64 or 70.
- UK/IE brand naming → Phase 999.1 once names decided.
- `pipeline_events` table migration → later phase.
