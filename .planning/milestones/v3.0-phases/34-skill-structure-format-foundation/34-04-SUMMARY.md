---
phase: 34-skill-structure-format-foundation
plan: 04
subsystem: skill-format
tags: [skst, agent-skills, skill-index, resources-policy, allowed-tools, markdown-structure]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: lint-skills.sh + check-protected-pipelines.sh (Plan 01 Wave 0 infrastructure)
  - phase: 34-skill-structure-format-foundation
    provides: 9 SKST sections applied across orq-agent/commands/ (Plan 02)
  - phase: 34-skill-structure-format-foundation
    provides: 9 SKST sections applied across orq-agent/agents/ (Plan 03)
provides:
  - 9 SKST sections applied to orq-agent/SKILL.md (suite-level index, meta-framed)
  - allowed-tools: frontmatter key on orq-agent/SKILL.md — completes SKST-01 coverage across the entire file set (SKILL.md + 15 commands + 17 subagents)
  - Resources Policy subsection in SKILL.md documenting the multi-consumer (`references/`) vs single-consumer (`<skill>/resources/`) invariant with explicit pointer to the references-multi-consumer lint rule
  - Suite-level Destructive Actions explicitly marked N/A — index file makes no mutations
affects:
  - 34-05 (final verification sweep — full suite lint + protected-pipeline check)
  - all V3.0 phases 36-43 that add new skills — the Resources Policy is now the canonical placement rule

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SKILL.md frontmatter uses allowed-tools: (commands/skill schema) — matches the union of tools needed across the 15 commands that load this file as context"
    - "Suite-level SKST sections meta-framed: When to use = 'Claude loads this as context'; Done When = 'commands/subagents match disk reality'; Destructive Actions = N/A (index file)"
    - "Resources Policy: orq-agent/references/ = shared (>=2 consumers); <skill>/resources/ = single-consumer; invariant enforced by references-multi-consumer lint rule"
    - "Additive-only edits: no existing body content (directory layout, command index, subagent index, profile docs) was modified"

key-files:
  created:
    - .planning/phases/34-skill-structure-format-foundation/34-04-SUMMARY.md
  modified:
    - orq-agent/SKILL.md

key-decisions:
  - "SKILL.md receives the FULL 9-section SKST superset with meta-framing per RESEARCH.md Open Question #2 resolution — the index is still a skill file and the uniform format pays dividends for tooling + future contributors"
  - "Destructive Actions at suite level = explicit 'N/A at the suite level' bullet — individual commands and subagents declare their own destructive actions; the index file itself makes no mutations"
  - "Resources Policy placed as a standalone H2 at end-of-body (before footer sections) rather than injected into the existing Directory Structure / References sections — keeps existing body verbatim (additive-only rule)"
  - "allowed-tools value = Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Task — the union of tools needed across all 15 commands (matches the orq-agent.md orchestrator's superset; no MCP tools declared at top-level since MCP availability is runtime-detected per skill)"

patterns-established:
  - "Skill-suite index file SKST layout: same 9 sections as commands/subagents, meta-framed for an index role"
  - "Resources Policy as an H2 subsection inside SKILL.md — single canonical location for the placement invariant (not scattered across consumer files)"
  - "SKST-02 invariant pinned to a lint rule (references-multi-consumer) rather than a migration action — zero files moved because zero files qualified"

requirements-completed:
  - SKST-01
  - SKST-02
  - SKST-03
  - SKST-04
  - SKST-05
  - SKST-06
  - SKST-07
  - SKST-08
  - SKST-09
  - SKST-10

# Metrics
duration: 2 min
completed: 2026-04-20
---

# Phase 34 Plan 04: SKILL.md SKST Format + allowed-tools + Resources Policy Summary

**9 SKST sections applied to `orq-agent/SKILL.md` with meta-framing for the index role, `allowed-tools:` added to the one file that lacked it, and a canonical Resources Policy subsection pinned to the `references-multi-consumer` lint rule.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-20T14:39:08Z
- **Completed:** 2026-04-20T14:40:31Z
- **Tasks:** 1 (autonomous)
- **Files modified:** 1 (`orq-agent/SKILL.md`)

## Accomplishments

- Added `allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Task` to the SKILL.md frontmatter — the single file in the scope that previously lacked this key per RESEARCH.md line 97. Value = union of tool needs across the 15 commands that load SKILL.md as context.
- Inserted 6 pre-body SKST sections immediately after the H1 title and the opening one-liner, in canonical order: Constraints, When to use, When NOT to use, Companion Skills, Done When, Destructive Actions.
- Meta-framed the sections for the skill-suite entry-point role: "When to use" = "Claude loads this as context for every `/orq-agent*` command"; "Done When" = "commands/subagents match disk reality + full lint passes"; "Destructive Actions" = `- **N/A at the suite level** — individual commands and subagents declare their own Destructive Actions sections. This index file makes no mutations; it is loaded as context only.`
- Appended a new `## Resources Policy` H2 subsection (placed before the footer sections) documenting the shared-vs-single-consumer invariant with explicit pointer to the `references-multi-consumer` lint rule. All 8 current reference files listed by name with verification date.
- Appended 3 footer sections at end of file in canonical order: Anti-Patterns (5-row table), Open in orq.ai (4 Studio URLs), Documentation & Resolution (4-step trust order).
- Zero modifications to existing body content — the pre-existing Directory Structure, Output Directory Convention, Commands, Subagents, References, Capability Tiers, V2.0 Runtime Dependencies, Templates, Distribution, Key Design Decisions, and User Configuration sections remain verbatim.

## Task Commits

1. **Task 1: SKILL.md frontmatter + 9 SKST sections + Resources Policy** — `41abd81` (feat)

**Plan metadata:** (pending — committed separately by orchestrator)

## Files Created/Modified

- `orq-agent/SKILL.md` — frontmatter updated with `allowed-tools:`; 6 pre-body sections inserted after H1; 1 Resources Policy subsection + 3 footer sections appended. File grew from 241 lines to 320 lines.
- `.planning/phases/34-skill-structure-format-foundation/34-04-SUMMARY.md` — this file.

## Decisions Made

- **SKILL.md gets the FULL 9-section SKST superset** (not a minimal subset). Per RESEARCH.md Open Question #2 resolution: the uniform structure pays off for future tooling and contributors, even though some sections (Done When, Destructive Actions) feel unusual for an index. Meta-framing keeps them substantive.
- **Destructive Actions = `N/A at the suite level`** with explicit rationale. The index file is context-only (loaded by every `/orq-agent*` command) and makes no Write/Edit/Bash mutations itself. Individual commands and subagents each carry their own Destructive Actions section per Plans 02 and 03.
- **Resources Policy as a standalone H2 subsection** placed immediately before the footer sections (rather than inlined into the existing Directory Structure / References sections). Rationale: the plan is strictly additive-only. Inlining would have modified existing body content. An H2 subsection is discoverable via `grep -qF "## Resources Policy"` and is the canonical location for the invariant text.
- **`allowed-tools:` value = union of tools needed across the 15 commands that load SKILL.md as context** (Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Task). Matches the superset declared in `orq-agent/commands/orq-agent.md` (the full-pipeline orchestrator). No MCP tools declared at top-level because MCP availability is runtime-detected per skill — listing them at the suite level would be misleading.

## Deviations from Plan

None - plan executed exactly as written.

The plan specified all content verbatim (frontmatter value, 6 pre-body sections, Resources Policy text, 3 footer sections). Every string in the acceptance criteria was satisfied on first run:

- `allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Task` present (grep match count = 1)
- `name: orq-agent` and `description: Generate complete, copy-paste-ready` preserved (both counts = 1)
- All 9 required H2 headings present
- `## Resources Policy` present
- `Single-consumer` present (from VALIDATION.md Task 34-04-02 spec)
- `references-multi-consumer` present (2 occurrences — in Resources Policy body and invariant paragraph)
- `N/A at the suite level` present in Destructive Actions
- File grew from 241 to 320 lines (target was >=150 — sanity check easily cleared)

No auto-fixes were needed (no bugs, no blocking issues, no missing critical functionality discovered during the edit).

## Authentication Gates

None — this plan is a pure file-edit migration with no external service calls.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

All verification checks from the plan pass:

1. `bash orq-agent/scripts/lint-skills.sh --file orq-agent/SKILL.md` → exit 0 (all 9 required sections + allowed-tools frontmatter + XML-guard checks pass).
2. `bash orq-agent/scripts/lint-skills.sh --rule allowed-tools` → exit 0 (SKILL.md + all 15 commands declare non-empty `allowed-tools:`).
3. `bash orq-agent/scripts/lint-skills.sh --rule references-multi-consumer` → exit 0 (all 8 reference files under `orq-agent/references/` still have >=2 consumers — no regression from Plans 02/03; SKILL.md still links to every reference by name).
4. `bash orq-agent/scripts/check-protected-pipelines.sh` → exit 0 (orq-agent, prompt, architect pipeline SHA-256 still match goldens — this plan did not touch `orq-agent/commands/`).
5. `grep -q "Single-consumer" orq-agent/SKILL.md` → exit 0.
6. `grep -q "^allowed-tools:" orq-agent/SKILL.md` → exit 0.
7. No files under `orq-agent/commands/`, `orq-agent/agents/`, or `orq-agent/scripts/` modified (`git show --stat HEAD` reports only `orq-agent/SKILL.md | 79 +++++++++++++++++++++`).
8. `wc -l orq-agent/SKILL.md` = 320 (was 241; >=150 target easily met).

## Next Phase Readiness

- **Plan 05 (final verification sweep)** — ready to proceed. Plans 01-04 complete: Wave 0 infrastructure (Plan 01), commands SKST migration (Plan 02), subagents SKST migration (Plan 03), SKILL.md SKST + allowed-tools + Resources Policy (this plan).
- **Phase 34 overall** — 4 of 5 plans complete. Plan 05 runs a full-suite lint + protected-pipeline verification + any follow-up polish the verifier flags.
- **V3.0 downstream phases (35-43)** — SKST-01 through SKST-10 are now enforced mechanically (per-file lint + references-multi-consumer + protected-pipelines). Any new skill file added in Phases 35-43 must pass `bash orq-agent/scripts/lint-skills.sh` before that phase can mark its plans complete.

---
*Phase: 34-skill-structure-format-foundation*
*Completed: 2026-04-20*

## Self-Check: PASSED

Verified:
- `orq-agent/SKILL.md` exists on disk (79 lines of additions; total 320 lines).
- `.planning/phases/34-skill-structure-format-foundation/34-04-SUMMARY.md` exists on disk.
- Task 1 commit `41abd81` present in git log.
- All 9 required SKST H2 headings present in SKILL.md (grep -qF for each succeeds).
- `allowed-tools:` frontmatter line present with exact expected value.
- `## Resources Policy` subsection present with `Single-consumer` and `references-multi-consumer` strings.
- `bash orq-agent/scripts/lint-skills.sh --file orq-agent/SKILL.md` → exit 0.
- `bash orq-agent/scripts/lint-skills.sh --rule references-multi-consumer` → exit 0.
- `bash orq-agent/scripts/check-protected-pipelines.sh` → exit 0.
