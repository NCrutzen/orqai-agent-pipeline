---
phase: 35-model-selection-discipline
plan: 04
subsystem: model-selection
tags: [model-catalog, capable-tier, snapshot-pinning, MSEL-01, MSEL-02, reference-docs]

# Dependency graph
requires:
  - phase: 35-model-selection-discipline
    provides: Plan 01 delivered snapshot-pinned-models lint rule; this plan seeds the capable-tier table whose dated IDs MUST satisfy that rule in downstream files
provides:
  - "orq-agent/references/orqai-model-catalog.md §Capable Tier Lookup — prescriptive 4-row table (chat-heavy, tool-calling, code/RAG, fast-triage) mapped to dated-snapshot model IDs"
  - "Forward-reference target for researcher.md (Plan 02) §Model Selection Policy"
  - "Alternative Primary column = first-fallback-model source for spec-generator output (Plan 03)"
affects: [35-05-verification, 42-evaluator-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static seed table + live MCP validation — docs-as-policy pattern with guardrail WARNING preserved at top of file"
    - "Inline HTML-comment audit trail (MSEL-01 / MSEL-02) — requirement IDs embedded in source of truth for grep-based traceability"

key-files:
  created: []
  modified:
    - "orq-agent/references/orqai-model-catalog.md — +33 lines, new ## Capable Tier Lookup H2 at lines 83-115"

key-decisions:
  - "Capable Tier table placed between ## Recommended Models by Use Case and ## How to Choose — categories first, prescriptive lookup next, heuristics last"
  - "Fast triage row explicitly labelled 'NOT a default — only cascade cheap tier' to prevent silent downgrade in researcher output"
  - "Alternative Primary column seeded with same-tier cross-provider IDs (openai/gpt-4o-2024-11-20, google-ai/gemini-2-5-flash) so Plan 03 spec-generator can reuse them as first fallback_models entries"
  - "Existing FORMAT REFERENCE ONLY NOTE + WARNING preserved verbatim — MCP models-list remains the authoritative live-selection path"

patterns-established:
  - "Docs-as-policy with live-validation escape hatch: static seed + MCP models-list gate before deploy"
  - "Requirement-ID breadcrumbs in reference files (MSEL-01, MSEL-02) for lint-free cross-phase traceability"

requirements-completed: [MSEL-01]

# Metrics
duration: 1 min
completed: 2026-04-20
---

# Phase 35 Plan 04: Capable Tier Lookup Seed Summary

**Prescriptive 4-row capable-first model table (chat-heavy, tool-calling, code/RAG, fast-triage) inserted into `orqai-model-catalog.md` with dated-snapshot IDs, MSEL-01/02 audit breadcrumbs, and the existing live-selection WARNING preserved.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-20T15:20:42Z
- **Completed:** 2026-04-20T15:21:53Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- New `## Capable Tier Lookup` H2 section at lines 83-115 of `orq-agent/references/orqai-model-catalog.md`
- 4 task-category rows (Chat-heavy, Tool-calling, Code/RAG, Fast-triage) mapped to dated-snapshot Primary + Alternative Primary columns
- MSEL-01 + MSEL-02 requirement IDs embedded as HTML-comment audit trail (grep-verifiable)
- Closes Plan 02 forward reference from `researcher.md §Model Selection Policy` to `orqai-model-catalog.md §Capable Tier Lookup`
- Existing `FORMAT REFERENCE ONLY` NOTE (line 5) and `WARNING: models-list returns ALL models` (line 9) preserved byte-for-byte

## Task Commits

Each task was committed atomically:

1. **Task 1: Add `## Capable Tier Lookup` section to model catalog reference** - `3840cef` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `orq-agent/references/orqai-model-catalog.md` — Added H2 `## Capable Tier Lookup` between existing `### Vision and Multimodal` (end of `## Recommended Models by Use Case`, line 81) and `## How to Choose` (line 116). +33 lines. Table schema: `Task category | Capable-tier Primary | Alternative Primary`. Includes 3-paragraph "How to use the table" procedure and cross-section relationship map (pointing to `## Recommended Models by Use Case`, `## Fallback Model Strategy`).

## Dated-Snapshot IDs Seeded

| Row | Capable-tier Primary | Alternative Primary |
|---|---|---|
| Chat-heavy / conversational | `anthropic/claude-sonnet-4-5-20250929` | `openai/gpt-4o-2024-11-20` |
| Tool-calling / agentic | `anthropic/claude-sonnet-4-5-20250929` | `openai/gpt-4o-2024-11-20` |
| Code / RAG synthesis | `anthropic/claude-opus-4-20250514` | `openai/gpt-4o-2024-11-20` |
| Fast triage (cascade cheap tier only) | `anthropic/claude-haiku-4-5-20251001` | `google-ai/gemini-2-5-flash` |

All IDs are dated snapshots — no `-latest`, `:latest`, or `-beta` suffixes. Floating aliases elsewhere in the file (Provider Format table examples) are preserved because they are format-pattern illustrations, not recommendations, and the `snapshot-pinned-models` lint rule does not scan this file by default.

## Decisions Made

- Placement: new section sits between `## Recommended Models by Use Case` and `## How to Choose` — rationale: categories first (broad options) → prescriptive lookup (MSEL-01 capable-first) → choice heuristics (general guidance). This ordering matches how researcher reads the file during recommendation authoring.
- Fast-triage row labelled inline as `(NOT a default — only cascade cheap tier)` — prevents downstream consumers (researcher, spec-generator) from treating haiku/gemini-flash as a silent downgrade path when `budget_profile=cost-first` is set. Explicit cascade proposal is the only legitimate trigger (MSEL-03, owned by Plan 02).
- Alternative Primary column harmonised across Chat/Tool/Code rows to `openai/gpt-4o-2024-11-20` — reduces provider-spread complexity for spec-generator Plan 03 which will use this column as the first `fallback_models` entry.
- MSEL-01 + MSEL-02 IDs embedded as HTML comments at section top — satisfies requirement traceability without polluting rendered markdown.

## Verification

All 7 verification gates from the plan executed and passed:

| # | Check | Result |
|---|---|---|
| 1 | `grep -q "## Capable Tier Lookup"` | exit 0 |
| 2 | All 4 category labels (Chat-heavy, Tool-calling, Code/RAG, Fast triage) | 4/4 exit 0 |
| 3 | All 4 dated snapshots (sonnet-4-5-20250929, opus-4-20250514, haiku-4-5-20251001, gpt-4o-2024-11-20) | 4/4 exit 0 |
| 4 | WARNING block preserved (`grep -q "WARNING:"` + `grep -q "FORMAT REFERENCE ONLY"`) | exit 0 |
| 5 | `bash orq-agent/scripts/lint-skills.sh --rule references-multi-consumer` | exit 0 |
| 6 | `bash orq-agent/scripts/lint-skills.sh` (full suite) | exit 0 |
| 7 | `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models` | exit 0 |
| 8 | `bash orq-agent/scripts/check-protected-pipelines.sh` (3/3 SHA-256 match) | exit 0 |
| 9 | Row count in new section (`awk` + `grep -c "^|"` >= 6) | ok (rows=6) |
| 10 | `grep -q "MSEL-01"` + `grep -q "MSEL-02"` + `grep -q "validate via MCP"` | 3/3 exit 0 |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 (this plan) closes the forward reference that Plan 02 (researcher.md) and Plan 03 (spec-generator.md) both target within Wave 2.
- Ready for Plan 05: runs full verification sweep and writes VERIFICATION.md with MSEL-01/02/03-to-check traceability.
- No blockers. Parallel plans 02 and 03 (modifying `agents/researcher.md` and `agents/spec-generator.md` respectively) are currently in progress in separate subagents — this plan touched ONLY `references/orqai-model-catalog.md`, so zero merge conflict risk.

## Self-Check: PASSED

- FOUND: `orq-agent/references/orqai-model-catalog.md` on disk
- FOUND: `.planning/phases/35-model-selection-discipline/35-04-SUMMARY.md` on disk
- FOUND: commit `3840cef` in `git log --oneline --all`

---
*Phase: 35-model-selection-discipline*
*Completed: 2026-04-20*
