---
phase: 40-kb-memory-lifecycle
plan: 02
subsystem: kb
tags: [orq-ai, kb, chunking, manifest, subagent, skst]

# Dependency graph
requires:
  - phase: 34-skill-baseline
    provides: 9-section SKST structure preserved in kb-generator
  - phase: 36-protected-pipelines
    provides: protected-pipeline hash registry that must stay green
provides:
  - Chunking Strategy Policy (KBM-03) embedded in orq-kb-generator subagent
  - Per-file manifest.json emission contract (chunking_strategy, chunk_size, overlap, reason)
  - Retrieval-quality invariant (KBM-01) reinforced as downstream gate
affects: [40-03, 40-04, 40-05, 40-06, kb-command-enhancements]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Subagent output contract = user-facing table + machine-readable manifest.json"
    - "Chunking strategy decided at content-generation time, consumed downstream"

key-files:
  created: []
  modified:
    - orq-agent/agents/kb-generator.md

key-decisions:
  - "Heuristic uses H2/H3 density per 1000 lines (threshold 5) to classify prose vs structured"
  - "Manifest.json emitted alongside generated files (not inline frontmatter) so KB command can parse without LLM"
  - "Subagent documents KBM-01 as invariant but does NOT execute the retrieval test itself (separation of concerns)"

patterns-established:
  - "Metadata manifest pattern: per-file JSON describing downstream-consumable decisions"
  - "Policy-as-section: embed Phase-scoped policy blocks (e.g. 'Chunking Strategy Policy (KBM-03)') inside subagents"

requirements-completed: [KBM-01, KBM-02, KBM-03]

# Metrics
duration: 2min
completed: 2026-04-21
---

# Phase 40 Plan 02: KB Chunking Policy + Manifest Emission Summary

**orq-kb-generator now embeds the content-type-driven chunking policy (sentence vs recursive) and emits a per-file manifest.json carrying chunking_strategy, chunk_size, overlap, and reason for downstream KBM-01 retrieval-quality testing.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-21T05:06:52Z
- **Completed:** 2026-04-21T05:08:09Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- New "Chunking Strategy Policy (KBM-03)" section added after Output Format with prose/structured classification, H2/H3 density heuristic, and output-structuring guidance.
- Output Format extended: KB Content Generated table now has a Chunking column, and a per-file manifest.json schema is documented (kb_name, files[{path, lines, content_type, chunking_strategy, chunk_size, overlap, reason}]).
- Constraints gained one new ALWAYS bullet requiring manifest.json emission to support KBM-01 baselines.
- Done When gained two new checklist items (manifest.json written; KBM-01 retrieval-quality invariant acknowledged).
- Anti-Patterns gained one row blocking KB content emission without manifest.json.
- Retrieval-quality invariant (KBM-01) explicitly framed: this subagent does NOT run the test, `/orq-agent:kb` Step 7.6 does; the manifest is the baseline.

## Task Commits

1. **Task 1: Embed chunking policy + metadata emission in kb-generator.md** - `61497d4` (feat)

## Files Created/Modified
- `orq-agent/agents/kb-generator.md` - Added Chunking Strategy Policy section, manifest.json schema + Chunking column in Output Format, one Constraints bullet, two Done When items, one Anti-Pattern row.

## Decisions Made
- Placed the new "Chunking Strategy Policy (KBM-03)" section immediately after Output Format (not before Constraints as literally written in the plan) because the manifest schema must be defined first so the policy can reference "see Output Format above". Semantically equivalent, reading order improved.
- Kept `tools: Read, Write, Bash, Glob, Grep` frontmatter untouched (no Agent dispatch, per plan constraint).
- Did not change any Approach A/B content.

## Deviations from Plan

None - plan executed exactly as written (modulo the section-ordering clarification noted under Decisions Made, which is consistent with the plan's intent that the policy reference the Output Format manifest).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Verification

All automated checks pass:

- `bash orq-agent/scripts/lint-skills.sh --file orq-agent/agents/kb-generator.md` → exit 0
- `bash orq-agent/scripts/check-protected-pipelines.sh` → 3/3 OK (orq-agent, prompt, architect)
- Anchor counts (all exceed plan thresholds):
  - `chunking_strategy`: 4 (≥3)
  - `sentence`: 7 (≥2)
  - `recursive`: 5 (≥2)
  - `retrieval quality`: 6 (≥2)
  - `manifest.json`: 5 (≥2)

## Next Phase Readiness
- kb-generator now emits the metadata contract required by Plan 40-03 (kb.md Step 7.1.5 chunking picker) and 40-04 (Step 7.6 retrieval-quality test).
- No blockers for subsequent 40-xx plans.

## Self-Check: PASSED

- Verified `orq-agent/agents/kb-generator.md` exists and contains all required anchors.
- Verified commit `61497d4` exists in `git log`.

---
*Phase: 40-kb-memory-lifecycle*
*Completed: 2026-04-21*
