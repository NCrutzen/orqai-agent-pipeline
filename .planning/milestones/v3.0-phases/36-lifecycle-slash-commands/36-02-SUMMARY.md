---
phase: 36-lifecycle-slash-commands
plan: 02
subsystem: commands
tags: [lcmd, mcp, traces, slash-command, skst, observability]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: "SKST 9-section template + allowed-tools frontmatter + orq-agent/scripts/lint-skills.sh lint surface"
  - phase: 35-model-selection-discipline
    provides: "Snapshot-pinning rule — example model IDs in prose must use dated snapshots (claude-sonnet-4-5-20250929)"
provides:
  - "/orq-agent:traces slash command (LCMD-02) — thin MCP-backed read-only trace query surface"
  - "Errors-first stable-sort pattern with full trace IDs for copy-paste debugging"
  - "--identity stub with TODO(OBSV-07) forward link for Phase 37 per-tenant filtering"
affects: [37-observability-setup, 38-trace-failure-analysis, 43-distribution-ci]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LCMD thin-command template: ORQ ► {VERB} banner + 9 SKST sections + MCP-first fallback REST + Open-in-orq.ai footer"
    - "Parse-only flag stub pattern: --identity emits TODO(OBSV-07) warning and proceeds without filtering; wiring deferred to downstream phase"
    - "Errors-first stable sort contract for trace lists (primary key status [error before ok], secondary started_at desc)"

key-files:
  created:
    - "orq-agent/commands/traces.md"
  modified: []

key-decisions:
  - "Flag contract for /orq-agent:traces locked: --deployment, --status (ok|error), --last (5m|1h|24h|7d|30d, default 24h), --limit (default 20), --identity (stub)"
  - "Full trace ID rendering is non-negotiable — no truncation even on overflow; trace IDs are copy-paste targets for Studio/support per LCMD-02"
  - "--identity ships as parse-only stub with one-line TODO(OBSV-07) warning; filter wiring deferred to Phase 37 OBSV-07 (identity attribute attachment)"
  - "MCP-first with explicit REST fallback (GET /v2/traces + $ORQ_API_KEY); never fabricate trace rows on error — surface raw MCP error + fallback attempt inline"

patterns-established:
  - "LCMD command template carries forward from Plan 01 (workspace): banner + SKST-9 + MCP-first + REST fallback + Open-in-orq.ai + MCP tools used footer"
  - "Stub-flag convention: parse, emit TODO(<REQ-ID>) warning, proceed without applying — keeps forward-compatible surface while deferring wiring"

requirements-completed: [LCMD-02]

# Metrics
duration: 1 min
completed: 2026-04-20
---

# Phase 36 Plan 02: Traces Query Slash Command Summary

**`/orq-agent:traces` — MCP-backed read-only trace query with errors-first stable sort, full trace IDs, and a documented --identity stub forward-linked to Phase 37 (OBSV-07).**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-20T15:57:32Z
- **Completed:** 2026-04-20T15:59:00Z
- **Tasks:** 1
- **Files created:** 1
- **Files modified:** 0

## Accomplishments

- `orq-agent/commands/traces.md` created (190 lines) satisfying LCMD-02 file-level requirement: banner, four documented filter flags, --identity stub, errors-first ordering, full trace IDs, MCP-tools footer, Open-in-orq.ai deep link.
- All 9 SKST required sections present and outside any XML block; `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/traces.md` exits 0.
- 12/12 grep acceptance anchors hit (allowed-tools, banner, 5 flags, TODO(OBSV-07), errors-first phrase, MCP footer, Open-in link).
- Protected pipelines unchanged — `bash orq-agent/scripts/check-protected-pipelines.sh` exits 0 (3/3 SHA-256 matches on orq-agent.md, prompt.md, architect.md).
- Establishes the reusable LCMD thin-command template (banner + SKST-9 + MCP-first + REST fallback + Open-in-orq.ai footer) that plans 03–06 inherit.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author orq-agent/commands/traces.md** — `8f17270` (feat)

_No plan-metadata commit yet — deferred to post-summary git_commit_metadata step._

## Files Created/Modified

- `orq-agent/commands/traces.md` (created, 190 lines) — LCMD-02 slash command: parses five flags, queries MCP `list_traces` (REST `/v2/traces` fallback), stable-sorts errors-first, renders full trace IDs in pipe-table, prints Open-in-orq.ai + `MCP tools used: list_traces` footer; `--identity` parse-only stub emits one-line `TODO(OBSV-07)` warning and proceeds without filtering.

## Decisions Made

1. **Flag contract matches 36-CONTEXT.md lock-in** — long-form only, `--last 24h` default, `--limit 20` default, explicit validation of `--status ∈ {ok,error}` and `--last ∈ {5m,1h,24h,7d,30d}`. STOP-on-invalid (no silent defaulting) so user typos surface.
2. **Full trace IDs, never truncated** — called out as a NEVER constraint AND reinforced as an Anti-Pattern row. Terminal scroll is free; debugging context is not.
3. **--identity is a stub, not a TODO shelf** — parse + one-line `TODO(OBSV-07)` warning + proceed without filtering. Keeps the surface forward-compatible with Phase 37 (OBSV-07) without pretending the filter exists today.
4. **MCP-first, REST fallback, never-fabricate** — on MCP error, surface raw error inline and attempt `curl -H "Authorization: Bearer $ORQ_API_KEY" https://api.orq.ai/v2/traces?...`. If REST also fails, STOP and print the error. No synthesized trace rows under any failure mode.
5. **Errors-first stable sort is a non-negotiable contract** — primary key `status` (error before ok), secondary `started_at` descending. Repeated in Constraints, Step 3, Anti-Patterns, and Done When.

## Deviations from Plan

None — plan executed exactly as written. All 15 body outline items (frontmatter + 14 sections/steps/tables) present verbatim; all 5 flag strings, `TODO(OBSV-07)`, `errors first`, `MCP tools used`, and `my.orq.ai/traces` appear literally as required by the acceptance anchors.

## Issues Encountered

None. Lint and protected-pipeline checks passed first try.

## Observations

- During this plan's execution, an untracked `orq-agent/commands/workspace.md` appeared in the working tree — likely from a parallel executor running Plan 01. Intentionally untouched here (outside this plan's scope per `files_modified: [orq-agent/commands/traces.md]` in the frontmatter and per `<parallel_safety>` directive). Plan 01's executor will commit it.

## User Setup Required

None — no external service configuration required. This plan only creates a static markdown command file.

## Next Phase Readiness

- LCMD-02 file-level coverage complete. Manual MCP smoke (live `/orq-agent:traces` invocation against an authenticated workspace) is intentionally deferred to `/gsd:verify-work 36` per `36-VALIDATION.md` Manual-Only Verifications table.
- Template established for plans 03–06: same banner pattern, same SKST-9, same MCP-first-REST-fallback idiom, same Open-in + MCP footer shape. Plans 03 (analytics), 04 (models), 05 (quickstart), 06 (automations) can clone this shape.
- Forward links into Phase 37 (OBSV-07) and Phase 38 (trace-failure analysis) are in place as `TODO(OBSV-07)` and `TODO(TFAIL)` tokens that downstream phases can grep for.

Ready for Plan 03 (`/orq-agent:analytics`, LCMD-03).

---
*Phase: 36-lifecycle-slash-commands*
*Completed: 2026-04-20*

## Self-Check: PASSED

- FOUND: `orq-agent/commands/traces.md` on disk
- FOUND: `.planning/phases/36-lifecycle-slash-commands/36-02-SUMMARY.md` on disk
- FOUND: task commit `8f17270` in git log
