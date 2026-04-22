---
phase: 34-skill-structure-format-foundation
plan: 02
subsystem: skill-format
tags: [skst, agent-skills, command-files, markdown-structure, lint, destructive-actions]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: lint-skills.sh, check-protected-pipelines.sh, golden/*.sha256 (Plan 01 Wave 0 infrastructure)
provides:
  - 9 SKST sections (Constraints, When to use, When NOT to use, Companion Skills, Done When, Destructive Actions, Anti-Patterns, Open in orq.ai, Documentation & Resolution) applied to every file under orq-agent/commands/ (15 files)
  - Verified byte-identical <pipeline> blocks for the 3 protected entry points (orq-agent, prompt, architect) via SHA-256 golden match
  - Per-command Destructive Actions inventory with AskUserQuestion confirm requirements wired in (10 commands destructive, help.md read-only, systems/set-profile/update using N/A URL pattern)
  - Companion Skills directional graph derived from RESEARCH.md across all 15 files
affects:
  - 34-03 (subagent SKST migration runs in same wave on orq-agent/agents/)
  - 34-04, 34-05 (downstream plans consume the command SKST contracts)
  - all V3.0 phases 36-43 that add new skills — this plan's format is now the template

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "9-section SKST contract above/below pipeline body"
    - "XML-tagged files: pre-body sections sit between </files_to_read> and <pipeline>; footer sections after </pipeline>"
    - "Pure Markdown files: pre-body sections after H1/intro; footer sections at EOF"
    - "Local-config commands use 'N/A — this skill manages local configuration only' for Open in orq.ai"
    - "Read-only commands use '- **None** — this command is read-only' for Destructive Actions"
    - "datasets.md Annotation Queues URL carries <!-- TODO(SKST-10): verified in Phase 37+ --> marker (inferred URL)"

key-files:
  created: []
  modified:
    - orq-agent/commands/orq-agent.md
    - orq-agent/commands/prompt.md
    - orq-agent/commands/architect.md
    - orq-agent/commands/deploy.md
    - orq-agent/commands/test.md
    - orq-agent/commands/iterate.md
    - orq-agent/commands/harden.md
    - orq-agent/commands/kb.md
    - orq-agent/commands/datasets.md
    - orq-agent/commands/research.md
    - orq-agent/commands/tools.md
    - orq-agent/commands/systems.md
    - orq-agent/commands/set-profile.md
    - orq-agent/commands/update.md
    - orq-agent/commands/help.md

key-decisions:
  - "Operationalized 'byte-identical' as '<pipeline> block SHA-256 unchanged' — new sections sit strictly OUTSIDE <pipeline> for the 3 protected files"
  - "For XML-tagged files with <files_to_read> + <pipeline>, pre-body sections inserted between </files_to_read> and <pipeline> (not inside either block)"
  - "Kept existing '## Step N' H2 headings inside <pipeline> as pipeline body — the lint's XML-guard is heading-specific, not H2-total, and existing step headings pre-date SKST"
  - "help.md Destructive Actions intentionally short: '- **None** — this command is read-only' — matches RESEARCH.md read-only pattern and passes the required-sections lint rule"
  - "datasets.md Annotation Queues URL marked with inline TODO(SKST-10) comment because RESEARCH.md flags it as inferred (to be verified Phase 37+)"

patterns-established:
  - "SKST 9-section layout: pre-body (Constraints, When to use, When NOT to use, Companion Skills, Done When, Destructive Actions) above body + footer (Anti-Patterns, Open in orq.ai, Documentation & Resolution) below body"
  - "Byte-identical protection via pipeline-block SHA-256 — operational interpretation of ROADMAP criterion #5"
  - "Destructive Actions use AskUserQuestion wording where destructive; 'None — read-only' where not"

requirements-completed:
  - SKST-01
  - SKST-03
  - SKST-04
  - SKST-05
  - SKST-06
  - SKST-07
  - SKST-08
  - SKST-09
  - SKST-10

# Metrics
duration: 13 min
completed: 2026-04-20
---

# Phase 34 Plan 02: Command-File SKST Migration Summary

**9 SKST sections applied to every file under `orq-agent/commands/` (15 files) with byte-identical pipeline preservation for the 3 protected entry points**

## Performance

- **Duration:** 13 min
- **Started:** 2026-04-20T14:02:18Z (Plan 01 completion timestamp from STATE.md)
- **Completed:** 2026-04-20T14:14:38Z
- **Tasks:** 3 (all autonomous)
- **Files modified:** 15 (all under `orq-agent/commands/`)

## Accomplishments

- Added Constraints, When to use, When NOT to use, Companion Skills, Done When, Destructive Actions, Anti-Patterns, Open in orq.ai, and Documentation & Resolution sections to every file under `orq-agent/commands/` — 15 files in total.
- Preserved byte-identical `<pipeline>` blocks for the 3 protected entry points (`orq-agent.md`, `prompt.md`, `architect.md`) — golden SHA-256 hashes captured in Plan 01 still match post-migration.
- Wired per-command Destructive Actions inventory (from RESEARCH.md §Per-command Destructive Action Inventory) into each file, flagging `AskUserQuestion` confirm requirements where destructive operations occur (10 commands destructive, `help.md` read-only, 3 local-config commands using N/A URL pattern).
- Companion Skills directional graph derived from RESEARCH.md §Companion Skill Graph applied verbatim to each of the 15 files.

## Task Commits

Each task was committed atomically:

1. **Task 1: 3 protected command files (orq-agent, prompt, architect)** — `944e058` (feat)
2. **Task 2: 6 mid-pipeline commands (deploy, test, iterate, harden, kb, datasets)** — `213871c` (feat)
3. **Task 3: 6 remaining commands (research, tools, systems, set-profile, update, help)** — `997c770` (feat)

**Plan metadata:** (pending — committed separately by orchestrator)

## Files Created/Modified

All 15 files modified (additive only — no frontmatter, no pipeline, no role/files_to_read block touched):

- `orq-agent/commands/orq-agent.md` — 9 SKST sections around existing `<pipeline>` block
- `orq-agent/commands/prompt.md` — 9 SKST sections around existing `<pipeline>` block
- `orq-agent/commands/architect.md` — 9 SKST sections using RESEARCH.md §Example 1 verbatim for constraints + anti-patterns
- `orq-agent/commands/deploy.md` — 9 SKST sections (Markdown-only file); AskUserQuestion flagged for 3 destructive actions
- `orq-agent/commands/test.md` — 9 SKST sections; AskUserQuestion flagged for dataset/experiment operations
- `orq-agent/commands/iterate.md` — 9 SKST sections; AskUserQuestion flagged for spec edit + re-deploy
- `orq-agent/commands/harden.md` — 9 SKST sections; AskUserQuestion flagged for guardrail attach + promotion
- `orq-agent/commands/kb.md` — 9 SKST sections; AskUserQuestion flagged for KB create/upload
- `orq-agent/commands/datasets.md` — 9 SKST sections around existing `<pipeline>` block; AskUserQuestion flagged for overwrites; Annotation Queues URL carries TODO(SKST-10) marker
- `orq-agent/commands/research.md` — 9 SKST sections around existing `<pipeline>` block; AskUserQuestion flagged for research-brief overwrite
- `orq-agent/commands/tools.md` — 9 SKST sections around existing `<pipeline>` block; AskUserQuestion flagged for TOOLS.md overwrite
- `orq-agent/commands/systems.md` — 9 SKST sections; N/A Open in orq.ai; AskUserQuestion flagged for systems.md edits
- `orq-agent/commands/set-profile.md` — 9 SKST sections; N/A Open in orq.ai; AskUserQuestion flagged for config.json overwrite
- `orq-agent/commands/update.md` — 9 SKST sections; N/A Open in orq.ai; AskUserQuestion flagged for local skill overwrites
- `orq-agent/commands/help.md` — 9 SKST sections; N/A Open in orq.ai; Destructive Actions is `- **None** — this command is read-only`

## Decisions Made

- **Operationalized "byte-identical" as pipeline-block SHA-256 match.** Three protected entry points (`orq-agent.md`, `prompt.md`, `architect.md`) gain new sections without perturbing the `<pipeline>` XML body. `check-protected-pipelines.sh` confirms match after each edit.
- **Positioning for XML-tagged files:** Pre-body sections go between the closing `</files_to_read>` (or `</role>`) tag and the opening `<pipeline>` tag. Footer sections go after the closing `</pipeline>` tag. Never inside any XML block.
- **Kept existing `## Step N` H2 headings inside `<pipeline>`.** The lint's XML-guard checks the 9 required SKST headings by exact name; existing step headings (e.g., `## Step 3: Run Architect`) pre-date SKST and are part of the pipeline body — they are not in the required-sections set.
- **`help.md` Destructive Actions uses `- **None** — this command is read-only`** per RESEARCH.md Destructive Action Inventory row for `help.md`. Lint accepts this shape.
- **Local-config commands use `- **N/A** — this skill manages local configuration only (no Orq.ai entities involved)`** for Open in orq.ai. Lint accepts `N/A` per RESEARCH.md line 409.
- **Inferred URLs carry inline TODO anchor.** `datasets.md` Annotation Queues link gets `<!-- TODO(SKST-10): verified in Phase 37+ -->` — matches RESEARCH.md line 395 guidance.

## Deviations from Plan

None - plan executed exactly as written.

All 15 files received the 9-section template; per-file content tables (Destructive Actions, Companion Skills, Open in orq.ai) came verbatim from the `<interfaces>` block in the plan. No auto-fixes were needed (no bugs, no blocking issues, no missing critical functionality discovered during migration).

## Authentication Gates

None — this plan is a pure file-edit migration with no external service calls.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

All 6 plan-level verification checks pass:

1. `bash orq-agent/scripts/lint-skills.sh --files orq-agent/commands` → exit 0 (all 15 commands pass all 9-section + allowed-tools rules).
2. `bash orq-agent/scripts/check-protected-pipelines.sh` → exit 0 (orq-agent, prompt, architect `<pipeline>` SHA-256 match goldens).
3. Every required H2 heading present in every command file (grep -qF for each of the 9 sections in all 15 files succeeded).
4. `grep -rc '^allowed-tools:' orq-agent/commands/*.md` returns exactly 1 per file (frontmatter untouched).
5. No files under `orq-agent/agents/` or `orq-agent/SKILL.md` modified by this plan (git diff HEAD~3..HEAD confirms 15 files changed, all under `orq-agent/commands/`).
6. New SKST sections verified OUTSIDE `<pipeline>` for the 4 XML-tagged command files (orq-agent, prompt, architect, datasets, research, tools): `awk '/^<pipeline>$/,/^<\/pipeline>$/ {print}'` extract contains zero occurrences of the 9 required SKST heading strings.

## Next Phase Readiness

- **Plan 03 (subagent SKST migration)** runs in the same wave and can proceed independently. Plan 02 touched only `orq-agent/commands/` (15 files); Plan 03 touches only `orq-agent/agents/` (17 files). No shared files. The parallel safety note in the Plan 02 prompt is now empirically confirmed: zero overlap.
- **Plan 04 (SKILL.md + references)** depends on Plans 02 and 03 completing. Plan 02's half is done.
- Downstream V3.0 phases (35-43) can use any of the 15 command files as a template for their own new skill files.

---
*Phase: 34-skill-structure-format-foundation*
*Completed: 2026-04-20*

## Self-Check: PASSED

Verified:
- 15 listed modified files all exist on disk (`ls orq-agent/commands/*.md | wc -l` = 15).
- 3 task commits present in git log (`944e058`, `213871c`, `997c770`).
- Full directory lint exits 0; protected pipeline check exits 0.
- SUMMARY.md file exists at `.planning/phases/34-skill-structure-format-foundation/34-02-SUMMARY.md`.
