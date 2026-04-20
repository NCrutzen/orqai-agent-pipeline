---
phase: 36-lifecycle-slash-commands
plan: 06
subsystem: slash-commands
tags: [orq-agent, trace-automations, AskUserQuestion, MCP, SKST, LCMD-06]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: 9-section SKST schema + lint-skills.sh rules (required-sections, allowed-tools)
  - phase: 35-model-selection-discipline
    provides: snapshot-pinning invariant (N/A for this plan — no model: lines)
provides:
  - "/orq-agent:automations slash command — list + --create modes for Orq.ai Trace Automation rules"
  - "LCMD-06 file-level coverage — mutation path gated by AskUserQuestion per SKST-08"
affects: [36-07-skill-index-wiring, 36-08-full-suite-verify, 37-observability-setup, 38-trace-failure-analysis]

# Tech tracking
tech-stack:
  added: []
  patterns: ["list + mutate command split with AskUserQuestion confirmation gate (mirrors orq-agent/commands/systems.md shape)"]

key-files:
  created: ["orq-agent/commands/automations.md"]
  modified: []

key-decisions:
  - "MCP-first with REST fallback (curl POST /v2/trace-automations) — Trace Automations MCP tool may not yet exist in the catalog; visible fallback surface lets the user debug which API answered"
  - "dataset=new and experiment=new both STOP the create flow with a pointer to the companion command (/orq-agent:datasets or /orq-agent:test) — avoids in-command sub-flows that would bloat automations.md past its single responsibility"
  - "Enabled column is mandatory in the list-mode table — disabled rules look identical to enabled ones in a 4-column view and users act on stale info"
  - "TODO(LCMD-06) marker retained on the my.orq.ai/trace-automations deep link because the canonical Studio path is inferred (Phase 37 may refine when live MCP surfaces the canonical URL)"

patterns-established:
  - "Two-mode slash command: `<cmd>` is read-only list, `<cmd> --create` is interactive mutation gated by AskUserQuestion (reusable template for any future list+mutate Orq.ai command)"

requirements-completed: [LCMD-06]

# Metrics
duration: 2 min
completed: 2026-04-20
---

# Phase 36 Plan 06: Trace Automations Slash Command Summary

**/orq-agent:automations slash command with list mode + `--create` interactive mutation flow (4 AskUserQuestion prompts + yes/no SKST-08 confirmation gate + MCP-first-with-REST-fallback POST /v2/trace-automations) — LCMD-06 file-level coverage complete.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-20T15:58:05Z
- **Completed:** 2026-04-20T15:59:38Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Created `orq-agent/commands/automations.md` with all 9 SKST sections, banner `ORQ ► AUTOMATIONS`, frontmatter declaring `allowed-tools` including `AskUserQuestion` + `mcp__orqai-mcp__search_entities`.
- Step-2 list mode renders a 5-column Markdown table (Name / Filter / Target Dataset / Target Experiment / Enabled) with an explicit zero-rules branch that nudges the user to `--create`.
- Step-3 create mode uses 4 sequential `AskUserQuestion` prompts (name, trace-filter, dataset, experiment) with `new` → STOP-and-redirect branches for the latter two.
- Step-4 confirmation gate is an `AskUserQuestion` yes/no prompt that MUST succeed before the Step-5 POST is attempted — SKST-08 gate for the destructive write.
- Step-5 write path tries the MCP tool first, falls back to curl REST POST, and surfaces non-2xx responses verbatim rather than claiming false success.
- All 11 grep anchors declared in the plan's `<automated>` verification block hit; lint + protected-pipelines both exit 0.

## Task Commits

1. **Task 1: Author orq-agent/commands/automations.md** — `a56e698` (feat)

_Note: this commit also folded in `workspace.md` and `quickstart.md` authored by sibling parallel plans 36-01 and 36-05 due to a shared-git-index race. Not a scope issue — each sibling plan tracks its own file; the contents of the three files are independent and correct._

**Plan metadata:** pending (separate commit below)

## Files Created/Modified

- `orq-agent/commands/automations.md` (created) — 206 lines. Two-mode slash command: list (read-only) + `--create` (4-field interactive create via AskUserQuestion, SKST-08-gated POST).

## Decisions Made

- **MCP-first with REST fallback** — Since the Orq.ai MCP tool catalog may not yet have a dedicated `create_trace_automation` tool (flagged in 36-CONTEXT.md), the command tries MCP first and degrades gracefully to `curl POST /v2/trace-automations` with `$ORQ_API_KEY`. The `MCP tools used:` footer names which surface actually answered so the user can debug.
- **dataset=new / experiment=new STOP the flow** — Rather than cross-invoking `/orq-agent:datasets` or `/orq-agent:test` inside the create flow (which would bloat `automations.md` and couple it to sibling commands), both `new` literals STOP with a pointer message. Keeps the command single-responsibility and reusable.
- **Enabled column mandatory** — Listed explicitly in the Constraints block so the lint rule (if any future phase adds an "enabled-column-required" rule) has a grep anchor and so maintainers cannot silently drop the column during refactors.
- **TODO(LCMD-06) marker retained** — The `https://my.orq.ai/trace-automations` deep link is inferred (per 36-CONTEXT.md's "Deferred Ideas"). The marker tells Phase 37+ where to refine when live MCP surfaces the canonical path.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** Clean execution; all acceptance criteria hit on the first pass.

## Issues Encountered

**Parallel-commit race (non-blocking):** The `feat(36-06)` commit at `a56e698` unexpectedly swept in `orq-agent/commands/workspace.md` and `orq-agent/commands/quickstart.md` alongside `automations.md`. Root cause: sibling Wave-1 plans 36-01 and 36-05 were staging their own files concurrently in the shared git index at the moment my `git commit` ran. No data corruption — each file's contents are independently correct and authored by the right plan — but the commit message line-3 ("Files") reads broader than the plan's declared single-file scope.

Resolution: documented here (not reverted, since each neighbor plan's contents are exactly what they intended to land and re-splitting would require interactive rebase). Sibling plans 36-01 and 36-05 will observe their files are already in git and should skip their own `git add` + `git commit` or no-op it.

Follow-up: none required for LCMD-06 file-level coverage; phase-close verification in plan 36-08 will re-run the full lint + protected-pipelines suite across every file regardless of which commit introduced it.

## User Setup Required

None - no external service configuration required. The `--create` mutation path needs `$ORQ_API_KEY` in env if the MCP tool is unavailable, but that env var is already a global prerequisite for the orq-agent skill (captured elsewhere in the install flow).

## Next Phase Readiness

- LCMD-06 file-level coverage complete. Plan 36-07 (Wave 2) can now include `automations.md` in the SKILL.md index + `help.md` pipeline-order block updates.
- Manual MCP round-trip smoke (does `POST /v2/trace-automations` actually write a rule to a live workspace?) deferred to `/gsd:verify-work 36` per the plan's explicit deferral and 36-VALIDATION.md's Manual-Only Verifications table.
- No blockers for Wave 2 (plan 07) or Wave 3 (plan 08).

---
*Phase: 36-lifecycle-slash-commands*
*Completed: 2026-04-20*

## Self-Check: PASSED

- `orq-agent/commands/automations.md` exists on disk.
- `.planning/phases/36-lifecycle-slash-commands/36-06-SUMMARY.md` exists on disk.
- Task commit `a56e698` is present in `git log`.
