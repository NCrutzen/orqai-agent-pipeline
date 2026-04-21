---
phase: 40-kb-memory-lifecycle
plan: 01
subsystem: kb
tags: [kb, retrieval, embedding, chunking, memory-dispatch, orq-agent]

requires:
  - phase: 34-skst-restructure
    provides: 9-section SKST shape preserved in kb.md
  - phase: 36-mcp-integration
    provides: MCP-first-with-REST-fallback pattern for list_models and search_entities
provides:
  - Embedding-model activation gate (KBM-02) in kb.md Step 7.0
  - Content-type-driven chunking strategy picker (KBM-03) in Step 7.1.5
  - Retrieval quality test gate (KBM-01) in Step 7.6 refusing wire-up below threshold
  - KB-vs-Memory decision rule (KBM-04) with lint-anchored phrasing
  - --mode kb|memory dispatch and --retrieval-threshold flag on /orq-agent:kb
affects: [40-02-memory-store-generator, 40-03-kb-generator-update, 40-04-resources, 40-05-help-update, 40-06-validation]

tech-stack:
  added: []
  patterns:
    - "Mode-flag dispatch from a command to a subagent (--mode memory → memory-store-generator)"
    - "Retrieval-quality gate pattern before deployment wire-up"

key-files:
  created: []
  modified:
    - orq-agent/commands/kb.md

key-decisions:
  - "Single-command dispatch via --mode memory instead of a separate /orq-agent:memory command"
  - "Default retrieval threshold 70, overrideable via --retrieval-threshold <N>"
  - "Chunking detection uses file extension plus H2 density (>= 5 per 1000 lines) to pick sentence vs recursive"

patterns-established:
  - "KBM gate ordering: activation (7.0) → picker (7.1) → chunking (7.1.5) → plan (7.4) → execute (7.5) → retrieval test (7.6) before any deployment wire-up"
  - "KB-vs-Memory block phrasing is lint-anchored so future edits cannot silently weaken the rule"

requirements-completed: [KBM-01, KBM-02, KBM-03, KBM-04]

duration: 8 min
completed: 2026-04-21
---

# Phase 40 Plan 01: KB Command Lifecycle Gates Summary

**kb.md gains embedding-activation, content-type chunking, retrieval-quality, and KB-vs-Memory gates plus a --mode memory dispatch to the memory-store-generator subagent.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-21T05:00:00Z
- **Completed:** 2026-04-21T05:08:42Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added Step 1b mode dispatch so `--mode memory` routes to the memory-store-generator subagent without inlining memory logic in kb.md.
- Added Step 7.0 embedding-model activation check (KBM-02) using MCP `list_models --type embedding` with REST fallback; blocks KB creation for non-activated models with explicit remediation.
- Added Step 7.1.5 content-type chunking strategy picker (KBM-03) with bash detection rule (extension + H2 density) and KB metadata recording.
- Added Step 7.6 retrieval quality test (KBM-01) that generates 5-10 heading-derived sample queries, evaluates pass rate, and refuses deployment wire-up below the configurable threshold.
- Added KB-vs-Memory Decision Rule section (KBM-04) with the exact lint-anchored phrasing from 40-CONTEXT.md, before the Anti-Patterns table.
- Extended the Anti-Patterns table with four new rows covering KB/memory misuse, retrieval-test skipping, and activation-check skipping.
- Declared `--mode kb|memory` and `--retrieval-threshold <N>` flags in the command intro; added memory-store-generator to Companion Skills.

## Task Commits

1. **Task 1: Enhance kb.md with KBM-01..04 steps + --mode dispatch** — `c150f92` (feat)

## Files Created/Modified

- `orq-agent/commands/kb.md` — +111 insertions, -1 deletion; five new insertions (command intro flag line, Step 1b, Step 7.0, Step 7.1.5, Step 7.6), KB-vs-Memory decision block, four new anti-pattern rows, Companion Skills addition.

## Decisions Made

- **Single-command dispatch (`--mode memory`)**: Chose the single-command approach from 40-CONTEXT.md "Claude's Discretion" over a separate `/orq-agent:memory` command, matching Phase 39 dataset's flag-style mode switch.
- **Threshold default 70**: Matches KBM-01 spec; `--retrieval-threshold` lets users override per-run.
- **Detection rule (extension + H2 density)**: Uses `>= 5` H2 headings per 1000 lines as the structured/prose boundary, plus explicit structured extensions (html, json, py, ts, js).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (memory-store-generator subagent) can rely on `--mode memory` being routed from kb.md.
- Plan 03 (kb-generator updates) can rely on chunking-strategy metadata being required in KB creation payloads.
- Plan 04 (resources/kb/ directory) can add `chunking-strategies.md`, `kb-vs-memory.md`, and `retrieval-test-template.md` referenced implicitly by the new steps.

## Self-Check: PASSED

- `orq-agent/commands/kb.md` exists with all new sections (verified via grep: retrieval quality=4, embedding model=13, chunking strategy=4, KB-vs-Memory=2, sentence=5, recursive=4, --mode memory=6).
- `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/kb.md` → exit 0.
- `bash orq-agent/scripts/check-protected-pipelines.sh` → 3/3 SHA-256 matches.
- Task commit `c150f92` present in `git log`.

---
*Phase: 40-kb-memory-lifecycle*
*Completed: 2026-04-21*
