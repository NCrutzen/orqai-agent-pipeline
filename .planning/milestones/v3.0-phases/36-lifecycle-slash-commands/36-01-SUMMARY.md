---
phase: 36-lifecycle-slash-commands
plan: 01
subsystem: cli
tags: [slash-command, mcp, workspace-overview, skst, lcmd-01]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: SKST lint + 9 required H2 sections + allowed-tools frontmatter rule (lint-skills.sh)
  - phase: 35-model-selection-discipline
    provides: snapshot-pinning lint rule (does not apply here — no model: lines emitted)
provides:
  - "/orq-agent:workspace slash command (LCMD-01) — single-screen workspace overview"
  - "Template for subsequent Phase 36 read-only MCP commands (traces, analytics, models, quickstart, automations)"
  - "MCP tool invocation pattern: mcp__orqai-mcp__search_entities + search_directories + get_analytics_overview + REST fallback"
affects: [36-07-skill-index-wiring, 36-08-phase-close-verify, 37-observability-setup, 43-dist-ci]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MCP-first with $ORQ_API_KEY REST fallback pattern for read-only workspace commands"
    - "Pipe-separated Markdown table per H3 entity subsection (columns at Claude's discretion)"
    - "Analytics summary line format: Requests: {N} | Cost: {USD} | Tokens: {N} | Error rate: {N}% (last 24h)"
    - "MCP tools used: footer with optional `, REST fallback` suffix when any curl fallback fires"

key-files:
  created:
    - orq-agent/commands/workspace.md
  modified: []

key-decisions:
  - "Analytics window fixed at 24h for /orq-agent:workspace — drill-down deferred to /orq-agent:analytics --last"
  - "Zero entities in a section renders an H3 with (0) and a single-row em-dash table, so empty differs visibly from filter-omitted"
  - "Open-in-orq.ai footer line uses https://my.orq.ai/agents as the single primary link; fuller per-entity deep-link table is documentation-only (not printed as command output)"
  - "No subagent delegation — command runs inline in main context per the help.md pattern (MCP tool calls + table rendering, no multi-step reasoning)"

patterns-established:
  - "Phase 36 workspace-command shape: frontmatter + banner + 9 SKST sections + 5 numbered Steps (Parse Argument / Fetch / Render Banner+Sections / Render Analytics / Print Footer)"
  - "Error handling: transient MCP errors retried once, non-transient errors attempt REST fallback, REST failure renders section H3 with inline ERROR — no fabrication"

requirements-completed: [LCMD-01]

# Metrics
duration: 3 min
completed: 2026-04-20
---

# Phase 36 Plan 01: Workspace Slash Command Summary

**Single-screen `/orq-agent:workspace [section]` command printing all 8 Orq.ai entity subsections (agents, deployments, prompts, datasets, experiments, projects, KBs, evaluators) + 24h analytics summary via MCP-first tool calls with REST fallback.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-20T15:57:13Z
- **Completed:** 2026-04-20T16:00:17Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments

- Created `orq-agent/commands/workspace.md` — thin MCP-backed, read-only command implementing LCMD-01 file-level coverage.
- Authored all 9 required SKST H2 sections plus frontmatter (`description:`, `allowed-tools:`, `argument-hint:`) in the exact shape copied from `help.md` and `systems.md` templates.
- Encoded 5 numbered Steps: Parse Argument → Fetch Workspace Data (MCP tool per section, REST fallback) → Render Banner + H3 Sections → Render Analytics Summary Line → Print Open-in-orq.ai + MCP Footer.
- Established the Phase 36 read-only MCP-command template that plans 36-02 through 36-06 can mirror.
- Zero touch to protected entry points (`orq-agent.md`, `prompt.md`, `architect.md`) — protected-pipeline SHA-256 check still exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author orq-agent/commands/workspace.md** — `a56e698` (feat — see note below)

**Note on commit hash:** Due to parallel Phase 36 plan executors running concurrently, a shell staging race caused my `workspace.md` staged file to be included in the 36-06 plan executor's commit (`a56e698 feat(36-06): add /orq-agent:automations slash command`) rather than landing under its own `feat(36-01): ...` commit. The file content is byte-identical to what this plan authored (verified with `git show a56e698:orq-agent/commands/workspace.md` — 191 lines, frontmatter + 9 SKST sections + 5 Steps); the task's acceptance criteria are met in full; only the commit-message attribution is off. No rework needed — rewriting history to split the commit would touch work owned by plan 36-06.

**Plan metadata:** (this SUMMARY.md + STATE.md + ROADMAP.md) — landed in the metadata commit at plan close.

## Files Created/Modified

- `orq-agent/commands/workspace.md` (191 lines) — New slash command implementing LCMD-01. Frontmatter with `description`, `allowed-tools` (Bash, Read, 4 MCP tools), `argument-hint`. Body: ORQ ► WORKSPACE banner, 9 SKST H2 sections, 5 numbered Steps, pipe-separated entity tables, 24h analytics line, Open-in-orq.ai + MCP footer.

## Decisions Made

- **Analytics window fixed at 24h.** This command is a single-screen snapshot; drill-down (7d, 30d, group-by) is `/orq-agent:analytics`'s job. Keeps the workspace command scope tight and avoids flag duplication across LCMD commands.
- **Zero-entities render choice.** An empty section prints `### Agents (0)` with a single `| — | — | — | — |` row instead of collapsing the H3. This preserves the 8-subsection structure for visual scannability and distinguishes "nothing here" from "filter omitted this section."
- **Single Open-in-orq.ai deep-link in command output.** The command output's footer includes one link (`https://my.orq.ai/agents`); the full per-entity link table (`Agents`, `Deployments`, `Experiments`, `Traces`) lives in the `## Open in orq.ai` documentation section but is not printed — following the pattern from `help.md` which has N/A in its Open-in-orq.ai section but a documentation block.
- **No subagent delegation.** Read-only MCP calls + deterministic table rendering don't benefit from isolated subagent context; inline execution in main context matches the `help.md` pattern.

## Deviations from Plan

None - plan executed exactly as written. All 9 SKST sections present verbatim, all 8 entity tokens present (`agents`, `deployments`, `prompts`, `datasets`, `experiments`, `projects`, `knowledge bases`, `evaluators`), analytics summary present, `MCP tools used` footer present, `my.orq.ai` link present. Lint exits 0; protected pipelines still byte-identical.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** Clean execution. One environmental footnote (shared commit hash with plan 36-06 due to parallel git staging race) is documented above under "Task Commits" — file content is correct and verified.

## Issues Encountered

**Parallel commit race (non-blocking).** Phase 36 plans 04, 05, 06 were executing concurrently with 36-01 in separate shells. When my `git add orq-agent/commands/workspace.md && git commit -m ...` ran, plan 36-06's commit process had already concurrently staged its own files and the workspace.md file got swept into `a56e698` (the 36-06 commit). The file landed in git correctly with byte-identical content, all verification commands pass, and acceptance criteria are fully met — only the commit-message attribution is shared. Self-check below confirms file + commit both exist.

## User Setup Required

None - no external service configuration required. This command consumes existing MCP + REST credentials (`$ORQ_API_KEY` already configured per PROJECT.md Key Decisions).

## Next Phase Readiness

- **Ready for plan 36-02** (`/orq-agent:traces`) — workspace.md establishes the read-only MCP command template; 36-02 through 36-06 can mirror the frontmatter + banner + 5-Step + 9-SKST shape.
- **Ready for plan 36-07** (skill-index wiring) — workspace.md is in place for SKILL.md + help.md to reference.
- **Manual LLM smoke deferred** to `/gsd:verify-work 36` per 36-VALIDATION.md §Manual-Only Verifications: "Each command actually invokes the expected MCP tools and returns data" requires a live authenticated Orq.ai workspace and cannot be file-level tested.
- **No blockers.**

## Self-Check: PASSED

- [x] `orq-agent/commands/workspace.md` exists on disk (191 lines)
- [x] `.planning/phases/36-lifecycle-slash-commands/36-01-SUMMARY.md` exists on disk (this file)
- [x] Commit `a56e698` exists and contains workspace.md (verified with `git show a56e698:orq-agent/commands/workspace.md`)
- [x] `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/workspace.md` exits 0
- [x] `bash orq-agent/scripts/check-protected-pipelines.sh` exits 0 (3/3 SHA-256 matches)
- [x] All 9 SKST H2 sections present (`## Constraints`, `## When to use`, `## When NOT to use`, `## Companion Skills`, `## Done When`, `## Destructive Actions`, `## Anti-Patterns`, `## Open in orq.ai`, `## Documentation & Resolution`)
- [x] All 8 entity tokens present (agents, deployments, prompts, datasets, experiments, projects, knowledge bases, evaluators)
- [x] Banner token `ORQ ► WORKSPACE` present
- [x] `MCP tools used` footer phrase present
- [x] `my.orq.ai` Open-in link present

---
*Phase: 36-lifecycle-slash-commands*
*Completed: 2026-04-20*
