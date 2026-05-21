---
phase: 63
plan: 01
subsystem: docs/agentic-pipeline
tags: [rfc, docs-only, contract, override, graduated-automation]
requires: []
provides:
  - "Stage 2->3 context-shape contract (TS interface + prose) with context_version: 1"
  - "4-axis override model (one axis per stage 1-4) with today-state callouts"
  - "Graduated-automation hook taxonomy (principles only, no thresholds)"
affects:
  - "Wave 2 stage docs (63-02) which cross-reference all three files"
  - "Wave 3 README + CLAUDE.md update (63-03) which indexes them"
tech-stack:
  added: []
  patterns:
    - "ATX-headed markdown matching docs/debtor-email-pipeline-architecture.md style"
    - "Registry-driven brand identity (no TS literal-union enum) per D-06"
key-files:
  created:
    - docs/agentic-pipeline/context-shape-contract.md
    - docs/agentic-pipeline/override-model.md
    - docs/agentic-pipeline/graduated-automation.md
  modified: []
decisions:
  - "Cited agent_runs.corrected_category (line 85) instead of email_labels.corrected_category as the plan paraphrased -- the actual schema location verified via direct migration read"
  - "Cited 'rejected_*' family (rejected_wrong_intent, _reference, _attachment, _language, _tone, _other) plus 'edited_minor'/'edited_major' explicitly, since human_verdict has no bare 'rejected' value"
  - "Confirmed email_labels.corrected_customer_account_id IS the live column name (verified migration 20260430c line 16); Axis 2 cites it as real schema with the Bulk Review surface forward-referenced to Phase 71 -- replaces the plan's [ASSUMED] tag"
metrics:
  duration: "3m 25s"
  tasks_completed: 3
  files_created: 3
  files_modified: 0
  commits: 3
  completed: "2026-04-30"
---

# Phase 63 Plan 01: Foundation Contract Docs Summary

Three foundational scaffolding documents that all five Wave 2 per-stage docs will cross-reference: the Stage 2->3 context-shape contract (TS interface + prose with `context_version: 1` and a registry-driven brand list), the 4-axis override taxonomy (axes 1+4 cite real today-state columns, axes 2+3 forward-referenced to Phase 71), and the graduated-automation hook taxonomy (Wilson-CI named as precedent without pinning numbers).

## What Was Built

### `docs/agentic-pipeline/context-shape-contract.md` (RFC-02)

Canonical TypeScript interface `PipelineStageContext` with all 6 required fields verbatim per plan: `customer_id`, `customer_name`, `language`, `entity_brand`, `recent_documents[]`, `context_version: 1`. Sub-interface `DocumentRef`. Prose semantics table with columns `Field | Required | Nullable | Source backend (today) | Semantic notes`. Versioning policy: additive optional fields stay at major 1; rename / type change / removal bumps major. `entity_brand` documented as `string` with the registry as source of truth -- explicit `// NOT a TypeScript literal-union enum` comment in the canonical interface. Forward references: `web/lib/agentic-pipeline/types.ts` codification (Phase 64/70), `swarms.entity_brand` registry (Phase 68), `pipeline_events` persistence target (Phase 70). Sibling cross-link to `swarm-bridge-contract.md` declaring it a different concern.

### `docs/agentic-pipeline/override-model.md` (RFC-03)

Four H2 axis sections, each with H3 sub-structure (`Definition`, `Where captured today`, `Telemetry row produced`, `Graduated-automation hook`). Overview table at top with five columns including today-state. Axes 1 and 4 cite real columns with migration line numbers verified via direct file read; axes 2 and 3 honestly tagged as forward-referenced to Phase 71 (and Phase 65 for the ranked-intent precondition). D-11 independence statement implemented as its own H2: overriding axis N makes downstream stages' decisions non-applicable, not wrong; eval logic in Phase 71 must not double-count. Cross-links to `graduated-automation.md` per axis.

### `docs/agentic-pipeline/graduated-automation.md` (RFC-04)

Hook taxonomy table with four rows (one hook per stage 1-4); promotion direction stated as `LLM -> deterministic` on every row. Wilson-CI Phase 56 precedent named in prose (`web/lib/classifier/wilson.ts`) with explicit "this RFC deliberately does not pin numbers" framing. Anthropic URL `https://www.anthropic.com/engineering/building-effective-agents` cited once; evaluator-optimizer pattern paraphrased in our voice (operator overrides = evaluator; promotion recommender = optimizer; Learning Inbox keeps the loop bounded). Forward refs to Phase 71 (thresholds), Phase 72 (promotion recommender), Phase 70 (`pipeline_events`).

## Verification

All plan acceptance criteria passed:

- All 3 files exist under `docs/agentic-pipeline/`.
- `context_version: 1` present in context-shape-contract.md.
- `data-driven` phrasing present; no `type EntityBrand =` or `enum EntityBrand` anywhere.
- All 4 axes present with H3 sub-structure; `draft_quality` and `feedback_reason` cited; Phase 71 / Phase 65 forward-refs present; D-11 `non-applicable` / `independent` framing present.
- `Wilson` and `Phase 56` named in graduated-automation.md; zero numeric promotion thresholds (no `N=`, `CI-lo=`, `0.92`, `0.95`, `>= 30`, `>= 50`).
- Anthropic URL cited exactly once across the three files (in graduated-automation.md).
- Zero speculative brand names (`smeba-uk`, `smeba-ie`) anywhere in `docs/agentic-pipeline/`.
- Zero stack-violation strings (Netlify / Railway / Firebase / Neon / Puppeteer) anywhere in `docs/agentic-pipeline/`.

## Cross-References Wave 2 Stage Docs Will Rely On

- `stage-2-entity.md` produces `PipelineStageContext` -> link to `context-shape-contract.md` for the canonical shape.
- `stage-3-coordinator.md` consumes `PipelineStageContext` -> link to `context-shape-contract.md`.
- `stage-1-regex.md`, `stage-2-entity.md`, `stage-3-coordinator.md`, `stage-4-handler.md` each reference one axis in `override-model.md` (axes 1, 2, 3, 4 respectively) and the matching hook in `graduated-automation.md`.
- All five stage docs reference `pipeline_events` (Phase 70) as the persistence target; persistence row shapes are sketched in `override-model.md` per axis.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Accuracy] Migration source for axis 1 `corrected_category`**

- **Found during:** Task 2 verification.
- **Issue:** The plan paraphrased the axis-1 source as `debtor.email_labels.corrected_category`, but direct read of the migrations confirms `corrected_category` lives on `agent_runs` (verified `supabase/migrations/20260428_public_agent_runs.sql:85`). The `email_labels` migration only mentions it in a comment that traces flow-1 ("rule correctness") back to the `agent_runs` column.
- **Fix:** Cited the actual location (`agent_runs.corrected_category` at line 85 of `20260428_public_agent_runs.sql`) in the override-model.md axis-1 row and Definition section. Honors the plan's "verify column names at write-time" guidance.
- **Files modified:** `docs/agentic-pipeline/override-model.md`.
- **Commit:** `da6dd21`.

**2. [Rule 1 - Accuracy] `human_verdict` enum values for axis 4**

- **Found during:** Task 2 verification.
- **Issue:** The plan listed `agent_runs.human_verdict` as including `'edited_minor'` and `'rejected'`. Direct migration read shows the enum uses `'edited_minor'`, `'edited_major'`, and a `'rejected_*'` family (`rejected_wrong_intent`, `rejected_wrong_reference`, `rejected_wrong_attachment`, `rejected_wrong_language`, `rejected_wrong_tone`, `rejected_other`) -- no bare `'rejected'`.
- **Fix:** Cited the family explicitly (`'edited_minor'`, `'edited_major'`, and the `'rejected_*'` family) in both the overview table and the axis-4 capture section.
- **Files modified:** `docs/agentic-pipeline/override-model.md`.
- **Commit:** `da6dd21`.

**3. [Rule 1 - Accuracy] `corrected_customer_account_id` for axis 2 -- removed `[ASSUMED]` tag**

- **Found during:** Task 2 verification.
- **Issue:** The plan instructed treating the column name as `[ASSUMED -- verify at write-time]`. Direct migration read shows the column DOES exist exactly under that name (verified `supabase/migrations/20260430c_email_labels_feedback_and_invoice_copy.sql:16`).
- **Fix:** Cited the column as real schema with verified migration line; the forward-reference to Phase 71 narrows correctly to the **Bulk Review surface** that uses it (column exists today, consolidated 4-axis UI ships in Phase 71).
- **Files modified:** `docs/agentic-pipeline/override-model.md`.
- **Commit:** `da6dd21`.

These three are accuracy upgrades over the plan's paraphrase, all consistent with the plan's own "verify at write-time" guidance.

## Authentication Gates

None. Docs-only phase with no external services touched.

## Threat Flags

None. Docs-only phase introduces no new network endpoints, auth paths, file-access patterns, or schema changes. Phase scope explicitly precludes any executable surface (see plan `<threat_model>`).

## Self-Check: PASSED

- `docs/agentic-pipeline/context-shape-contract.md` exists.
- `docs/agentic-pipeline/override-model.md` exists.
- `docs/agentic-pipeline/graduated-automation.md` exists.
- Commit `24d8724` exists in `git log` (Task 1).
- Commit `da6dd21` exists in `git log` (Task 2).
- Commit `6b972d3` exists in `git log` (Task 3).
- Phase-wide grep checks pass: no `smeba-uk` / `smeba-ie`, no stack-violation strings.
