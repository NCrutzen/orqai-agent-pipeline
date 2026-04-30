---
phase: 63-architecture-rfc
verified: 2026-04-30T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 63: Architecture RFC — Verification Report

**Phase Goal:** Produce a single canonical RFC (directory of self-contained docs under `docs/agentic-pipeline/`) that defines the 5-stage funnel shape, the cross-swarm Stage 2→3 context-shape contract, the 4-axis override model, and the graduated-automation hook model. Update canonical pointers and supersede prior cross-swarm doc.

**Verified:** 2026-04-30
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| SC-1 | Canonical RFC entry point exists, defines all 5 stages (Stage 0..4), and is linked from `CLAUDE.md` as canonical | VERIFIED | `docs/agentic-pipeline/README.md` exists with full 5-stage funnel ASCII diagram (lines 13–52) and Index section (lines 83–98). `CLAUDE.md` line 7 promotes it to canonical: "Agentic Pipeline (cross-swarm canonical) → docs/agentic-pipeline/README.md". Note: roadmap SC-1 names the doc as `docs/agentic-pipeline-architecture.md` (single file); D-01 in CONTEXT.md re-decided this as a directory with `README.md` as the entry point. The intent of SC-1 — single canonical RFC linked from CLAUDE.md, defines all 5 stages — is satisfied. |
| SC-2 | Stage 2 → Stage 3 context-shape contract (customer_id, customer_name, language, entity_brand, recent_documents[]) documented and lookup-backend-agnostic | VERIFIED | `docs/agentic-pipeline/context-shape-contract.md` lines 12–32 ship the canonical TypeScript `PipelineStageContext` interface with all five required fields plus `context_version: 1`. Prose semantics table (lines 36–43) documents required/nullable status and source backend per field. Backend-agnostic seam explicitly stated lines 7–8 ("a SugarCRM-backed sales swarm produces the exact same shape as an NXT-backed debtor swarm"). Versioning policy (lines 47–52) is explicit per D-05. |
| SC-3 | 4-axis override model documented with per-axis learning signal | VERIFIED | `docs/agentic-pipeline/override-model.md` ships the 4-axis overview table (lines 12–17) plus a dedicated section per axis (lines 19–92) — Axis 1 (category), Axis 2 (customer), Axis 3 (intent), Axis 4 (handler output). Each axis names its definition, today-state with verified migration cites, telemetry row produced, and graduated-automation hook consumed. Independence of axes (D-11) explicit at lines 94–96. |
| SC-4 | Graduated automation hooks per stage documented (regex promotion, sender mapping, prompt-tune triggers) | VERIFIED | `docs/agentic-pipeline/graduated-automation.md` ships the Hook Taxonomy table (lines 12–17) covering all four hooks: regex-rule promotion (Stage 1), sender-mapping promotion (Stage 2), prompt-tune trigger (Stage 3), handler-replacement / prompt-tune (Stage 4). Each hook names stage, signal consumed, and promotion direction. Wilson-CI sender-mapping precedent explicit (lines 19–23). D-12 honoured: thresholds explicitly deferred to Phase 71. |
| SC-5 | Existing `docs/debtor-email-pipeline-architecture.md` annotated as superseded with forward-pointer | VERIFIED | `docs/debtor-email-pipeline-architecture.md` line 7: `> **SUPERSEDED for cross-swarm shape** by [docs/agentic-pipeline/README.md](agentic-pipeline/README.md). Retained as the implementation map for the debtor-email swarm specifically.` Matches D-03 wording exactly. |

**Score:** 5/5 truths verified

### Required Artifacts (D-01 deliverable set)

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `docs/agentic-pipeline/README.md` | RFC entry point + tenancy + index + funnel diagram | VERIFIED | Substantive (142 lines), self-contained per D-02, ASCII funnel diagram per D-13, dedicated Tenancy section per D-08 (lines 56–81) with today's 6 brands explicit, no UK/IE placeholder names per D-09. |
| `docs/agentic-pipeline/stage-0-safety.md` | Stage 0 doc, today-state honest | VERIFIED | 58 lines, "NOT YET SHIPPED" today-state callout (line 4 + line 16), forward-refs Phase 64 (SAFE-01..04, BUDG-01). Anthropic citation per D-02. ASCII diagram per D-13. |
| `docs/agentic-pipeline/stage-1-regex.md` | Stage 1 doc with debtor worked example + sales parallel | VERIFIED | 94 lines. Cites real reference impl `web/lib/debtor-email/classify.ts` (verified exists), real `swarm_categories` registry, real category keys (`auto_reply`, `ooo_temporary`, `ooo_permanent`, `payment_admittance`, `unknown`). Sales-email parallel block lines 64–66 (illustrative, ≤10 lines per D-07). |
| `docs/agentic-pipeline/stage-2-entity.md` | Stage 2 doc, emits PipelineStageContext | VERIFIED | 86 lines. Cites real `web/lib/automations/debtor-email/resolve-debtor.ts` (verified exists). Documents per-brand routing via `debtor.labeling_settings.brand_id` + `nxt_database`. Backend-agnostic discipline explicit (Cross-Swarm Pluggability section). Forward-refs Phase 68 (SWRM-01) and Phase 73 (SugarCRM). |
| `docs/agentic-pipeline/stage-3-coordinator.md` | Stage 3 doc with ranked-intent + Stage 3.5 placeholder | VERIFIED | 97 lines. Ranked-intent output explicit (CORD-01). Stage 3.5 escalation present as principle + ASCII placeholder per D-13 / Claude's discretion (lines 47–69) — full design forward-ref Phase 65. Sales-email parallel block lines 43–45 per D-07. |
| `docs/agentic-pipeline/stage-4-handler.md` | Stage 4 handler doc, cites zapier_tools registry | VERIFIED | 102 lines. Cites real migration `supabase/migrations/20260429_zapier_tools_registry.sql` (verified exists), real `web/lib/automations/debtor-email/nxt-zap-client.ts` (verified exists), real handler agent name `debtor-copy-document-body-agent` per D-07. `allowed_for_intents` correctly forward-referenced to Phase 64 (BUDG-02). Stack constraints from CLAUDE.md re-asserted (lines 69–74). |
| `docs/agentic-pipeline/context-shape-contract.md` | TS interface + prose semantics + versioning policy | VERIFIED | 66 lines. TS interface (lines 12–32) with all 5 SC-2 fields + `context_version: 1`. `entity_brand` is `string` type with comment explicitly stating registry-driven, not literal-union enum (D-06). Prose table (lines 36–43). Versioning policy (lines 47–52) explicit per D-05. |
| `docs/agentic-pipeline/override-model.md` | 4-axis model with telemetry + hook mapping | VERIFIED | 113 lines. All 4 axes covered. Today-state callouts honest: Axis 1 REAL, Axis 2 PARTIAL, Axis 3 DOES NOT EXIST, Axis 4 REAL. Independence-of-axes section per D-11. All migration cites resolve to existing files. |
| `docs/agentic-pipeline/graduated-automation.md` | Hook taxonomy, principles only, no thresholds | VERIFIED | 43 lines. Hook taxonomy table covers all 4 stages. Wilson-CI Phase 56 precedent explicit. D-12 honoured: line 23 "This RFC deliberately does not pin numbers." Anthropic evaluator-optimizer mapping per D-02. |
| `CLAUDE.md` (canonical pointer update) | Promote RFC, demote debtor doc to swarm-specific | VERIFIED | Lines 7–8: RFC named first as "cross-swarm canonical", debtor doc demoted to "swarm-specific implementation". Matches D-03 / D-09 expectations. |
| `docs/debtor-email-pipeline-architecture.md` (banner) | SUPERSEDED banner per D-03 | VERIFIED | Line 7: banner present with exact D-03 wording. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `CLAUDE.md` Canonical Architecture Docs section | `docs/agentic-pipeline/README.md` | Markdown link with explanatory copy | WIRED | Line 7 of CLAUDE.md. RFC promoted to first / canonical position. |
| `docs/debtor-email-pipeline-architecture.md` (top) | `docs/agentic-pipeline/README.md` | SUPERSEDED banner with link | WIRED | Line 7 banner uses relative link `agentic-pipeline/README.md`. |
| README index | All 8 sibling docs | Index section with relative links | WIRED | README lines 87–97 link to all 5 stage docs + 3 contract docs. |
| Stage docs | Wave 1 contract docs | Cross-references | WIRED | Each stage doc has a "See Also" section + inline links to override-model + graduated-automation (verified by grep across files). |
| Stage 1 doc → reference impl | `web/lib/debtor-email/classify.ts` | Relative link | WIRED | File exists, link path resolves. |
| Stage 4 doc → migration | `supabase/migrations/20260429_zapier_tools_registry.sql` | Relative link | WIRED | File exists. |
| Override model → axis 1 / 2 / 4 cited migrations | `20260428_public_agent_runs.sql`, `20260430c_email_labels_feedback_and_invoice_copy.sql` | Verbatim path + line numbers | WIRED | Both files exist; line citations originate from researcher's direct migration read per Wave 1 summary's `decisions` block. |
| README implementation patterns | `../orqai-patterns.md`, `../zapier-patterns.md`, `../inngest-patterns.md`, `../browserless-patterns.md`, `../supabase-patterns.md` | Relative links | WIRED | Per D-02 RFC links OUT only; pattern docs are the existing how-to references. |

### Data-Flow Trace (Level 4)

Not applicable — this is a docs-only RFC phase. There are no runtime artifacts that render dynamic data.

### Behavioral Spot-Checks

SKIPPED (docs-only phase — no runnable entry points produced or modified).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| RFC-01 | 63-02-PLAN, 63-03-PLAN | Single canonical RFC document defines 5-stage funnel and supersedes existing debtor-email-pipeline-architecture | SATISFIED | README.md + 5 stage docs + SUPERSEDED banner on prior doc. |
| RFC-02 | 63-01-PLAN | Stage 2 → Stage 3 context-shape contract documented, lookup-backend-agnostic | SATISFIED | `context-shape-contract.md` ships canonical TS interface + prose + versioning. |
| RFC-03 | 63-01-PLAN | 4-axis override model with per-axis learning signal | SATISFIED | `override-model.md` ships taxonomy + per-axis sections. |
| RFC-04 | 63-01-PLAN | Graduated automation hooks per stage | SATISFIED | `graduated-automation.md` ships Hook Taxonomy + Wilson-CI precedent. |

Note: REQUIREMENTS.md table at lines 124–127 still shows RFC-01..04 as `pending`; the bracket marker at lines 13–20 already shows them as `[x]`. The traceability table is the lagging artifact, not a deliverable gap. The roadmapper / state-recorder owns flipping the table; this phase produced the underlying evidence. Flagging as informational, not as a gap (Phase 63 acceptance does not include the traceability-table flip — that's a state-update step).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | — | — | — | All 9 RFC files scanned for TODO / FIXME / placeholder / "coming soon" / hardcoded empty stubs / "not yet implemented" disclaimers misused as scope-cover. Forward-references are explicit and stage-tagged ("forward-ref Phase N") rather than hand-waved. Today-state callouts honest (NOT YET SHIPPED, PARTIAL, DOES NOT EXIST TODAY) per D-02 today-state-honesty discipline. |

### D-09 Brand Correction Verification

Critical decision per CONTEXT.md: speculative names "smeba-uk" / "smeba-ie" must NOT appear in any deliverable.

```
grep -rn "smeba-uk\|smeba-ie" docs/ .planning/PROJECT.md CLAUDE.md
→ zero hits
```

Today's 6 brands (`smeba`, `smeba-fire`, `firecontrol`, `sicli-noord`, `sicli-sud`, `berki`) appear consistently in README tenancy section + context-shape-contract.md `entity_brand` comment. UK/IE referenced only as "future brand additions, names TBD" per D-09. PASSED.

### Internal Consistency Spot-Checks

- 5-stage shape consistent across README headline diagram, all 5 stage docs (each one's "previous / next stage" cross-link forms a clean chain Stage 0 → 1 → 2 → 3 → 4), and override-model 4-axis table (axes 1–4 map to Stages 1–4 — Stage 0 has no override axis, called out explicitly in stage-0-safety.md line 56).
- `context_version: 1` consistent across context-shape-contract.md (TS interface + versioning section), override-model.md (every axis's forward-referenced `pipeline_events` row), and graduated-automation.md.
- Forward-references consistent: README's table (lines 127–141) lists every Phase 64+ forward-reference; spot-checked against each stage doc — no stage doc forward-references a phase not in the README table.
- Anthropic citation discipline per D-02: paraphrased once per relevant doc, single URL `https://www.anthropic.com/engineering/building-effective-agents`, no quote-bombing.

### Human Verification Required

None. All locked decisions D-01..D-13 are checkable from text + filesystem; the brand-correction (D-09) is checkable by grep; the supersession banner / CLAUDE.md update are filesystem-checkable. There are no UI / runtime / external-service / visual-quality questions in this phase.

### Gaps Summary

No gaps. All 5 roadmap success criteria verified, all 11 expected artifacts exist and are substantive, all key links wired, no anti-patterns found, D-09 brand correction clean, internal consistency verified. The RFC is self-contained per D-02, today-state-honest, faithful to all locked decisions, and CLAUDE.md correctly promotes it to canonical with the prior debtor-email doc demoted to swarm-specific implementation map.

The single ambiguity worth recording (not a gap): the roadmap's SC-1 names the deliverable as a single file `docs/agentic-pipeline-architecture.md`; D-01 in CONTEXT.md explicitly upgraded the structure to a directory under `docs/agentic-pipeline/` with `README.md` as entry point. This is a deliberate locked-decision deviation from the roadmap text, recorded in CONTEXT.md, and CLAUDE.md points at the new path. The intent of SC-1 (single canonical RFC, linked from CLAUDE.md, defines all 5 stages) is satisfied — only the path differs.

---

_Verified: 2026-04-30_
_Verifier: Claude (gsd-verifier)_
