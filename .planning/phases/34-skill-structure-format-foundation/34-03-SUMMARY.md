---
phase: 34-skill-structure-format-foundation
plan: 03
subsystem: skill-format
tags: [skst, agent-skills, subagent-files, markdown-structure, lint, destructive-actions, askuserquestion]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: lint-skills.sh, check-protected-pipelines.sh (Plan 01 Wave 0 infrastructure)
provides:
  - 9 SKST sections (Constraints, When to use, When NOT to use, Companion Skills, Done When, Destructive Actions, Anti-Patterns, Open in orq.ai, Documentation & Resolution) applied to every file under orq-agent/agents/ (17 files)
  - Per-subagent Destructive Actions inventory with AskUserQuestion confirm requirements wired in (12 destructive subagents, 3 non-destructive read-only, 2 non-destructive orchestrators)
  - Companion Skills directional graph across all 17 subagent files
  - Forward-link graph to future-phase requirement IDs (TFAIL-03, ITRX-01/05/07/08, EVLD-08, KBM-01/02/03/04, ESCI-01/05/08, DSET-02/03/04/05, MSEL-01/02) established for Phases 35, 38, 39, 40, 42
affects:
  - 34-04 (SKILL.md Wave 2 — depends on both Plan 02 and 03 completing)
  - all V3.0 phases 36-43 that add new subagent files — this plan's format is the template

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "9-section SKST contract applied to every subagent file"
    - "Frontmatter uses tools: (subagent schema) — never allowed-tools: (commands schema)"
    - "dataset-generator.md Annotation Queues URL carries <!-- TODO(SKST-10): verified in Phase 37+ --> marker (inferred URL per RESEARCH.md)"
    - "Non-destructive subagents (experiment-runner, results-analyzer, tester, failure-diagnoser) document 'Non-destructive' behavior explicitly in Destructive Actions section"
    - "Destructive subagents with AskUserQuestion gate: architect, spec-generator, orchestration-generator, readme-generator, researcher, tool-resolver, dataset-generator, dataset-preparer, deployer, iterator, prompt-editor, hardener, kb-generator"

key-files:
  created: []
  modified:
    - orq-agent/agents/architect.md
    - orq-agent/agents/spec-generator.md
    - orq-agent/agents/orchestration-generator.md
    - orq-agent/agents/tool-resolver.md
    - orq-agent/agents/researcher.md
    - orq-agent/agents/readme-generator.md
    - orq-agent/agents/deployer.md
    - orq-agent/agents/dataset-preparer.md
    - orq-agent/agents/experiment-runner.md
    - orq-agent/agents/results-analyzer.md
    - orq-agent/agents/tester.md
    - orq-agent/agents/dataset-generator.md
    - orq-agent/agents/failure-diagnoser.md
    - orq-agent/agents/iterator.md
    - orq-agent/agents/prompt-editor.md
    - orq-agent/agents/hardener.md
    - orq-agent/agents/kb-generator.md

key-decisions:
  - "SKST-01 for subagents satisfied by existing tools: frontmatter — zero frontmatter edits made. allowed-tools: is a no-op on subagents per Claude Code schema (RESEARCH.md Pitfall 2) and was not added to any file"
  - "For subagent files wrapped in <role> blocks (architect, dataset-generator, readme-generator), new SKST sections go OUTSIDE </role> — the <role> tag is in the lint XML guard list"
  - "<constraints> XML tags are NOT in the lint guard list (only role/pipeline/files_to_read/objective/instructions are), so legacy <constraints>...</constraints> wrappers around ## Constraints headings in architect.md, readme-generator.md, and dataset-generator.md are preserved where they exist"
  - "Non-destructive subagents use explicit 'Non-destructive' wording in Destructive Actions — failure-diagnoser cites downstream AskUserQuestion gate (it collects approval but does not mutate itself), making it pass the AskUserQuestion check while still being read-only"
  - "prompt-editor Constraints section cites Phase 35 MSEL-02 (snapshot pinning) and Phase 42 ITRX-07 (audit-trail rule) — adds two forward-link edges that would otherwise have been missing from this file"

patterns-established:
  - "SKST 9-section layout on subagents: pre-body (Constraints, When to use, When NOT to use, Companion Skills, Done When, Destructive Actions) + footer (Anti-Patterns, Open in orq.ai, Documentation & Resolution)"
  - "Per-subagent Destructive Actions tables from RESEARCH.md §Destructive Action Inventory copied verbatim per file"
  - "Per-subagent Companion Skills graph from RESEARCH.md §Companion Skill Graph copied verbatim per file"
  - "Per-subagent Open in orq.ai URLs from RESEARCH.md §URL map copied verbatim per file (17 files, 1 inferred URL flagged with TODO(SKST-10))"

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

# Phase 34 Plan 03: Subagent-File SKST Migration Summary

**9 SKST sections applied to every file under `orq-agent/agents/` (17 subagent files) with per-subagent Destructive Actions wired to AskUserQuestion and forward-link graph to future-phase requirement IDs established.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-04-20T14:19:43Z
- **Completed:** 2026-04-20T14:33:12Z
- **Tasks:** 3 (all autonomous)
- **Files modified:** 17 (all under `orq-agent/agents/`)

## Accomplishments

- Added Constraints, When to use, When NOT to use, Companion Skills, Done When, Destructive Actions, Anti-Patterns, Open in orq.ai, and Documentation & Resolution sections to every file under `orq-agent/agents/` — 17 files in total.
- Wired per-subagent Destructive Actions inventory (from RESEARCH.md §Per-Subagent Destructive Action Inventory) into each file, flagging `AskUserQuestion` confirm requirements where destructive operations occur (12 destructive subagents, 3 read-only, 2 orchestrators that delegate destruction downstream).
- Applied Companion Skills directional graph from RESEARCH.md §Companion Skill Graph verbatim to each of the 17 files.
- Applied Open in orq.ai URL map from RESEARCH.md §Open in orq.ai URL Map verbatim to each file, with the 1 inferred Annotation Queues URL in `dataset-generator.md` carrying the `<!-- TODO(SKST-10): verified in Phase 37+ -->` marker.
- Frontmatter `tools:` keys preserved byte-identical on all 17 files; no `allowed-tools:` added to any subagent file (Claude Code subagent schema does not accept that key per RESEARCH.md Pitfall 2).
- Forward-link graph to future-phase requirement IDs (TFAIL-03, ITRX-01/05/07/08, EVLD-08, KBM-01/02/03/04, ESCI-01/05/08, DSET-02/03/04/05, MSEL-01/02) established across the 17 files — Phases 35, 38, 39, 40, 42 can grep for these IDs to find their entry points.

## Task Commits

Each task was committed atomically:

1. **Task 1: 6 generator subagents (architect, spec-generator, orchestration-generator, tool-resolver, researcher, readme-generator)** — `84f01b4` (feat)
2. **Task 2: 6 deployment/testing subagents (deployer, dataset-preparer, experiment-runner, results-analyzer, tester, dataset-generator)** — `cb37420` (feat)
3. **Task 3: 5 iteration/hardening/KB subagents (failure-diagnoser, iterator, prompt-editor, hardener, kb-generator)** — `342ac46` (feat)

**Plan metadata:** (pending — committed separately by orchestrator)

## Files Created/Modified

All 17 files modified (additive only — no frontmatter touched):

- `orq-agent/agents/architect.md` — 9 SKST sections; AskUserQuestion flagged for blueprint.md overwrite
- `orq-agent/agents/spec-generator.md` — 9 SKST sections; AskUserQuestion flagged for spec file overwrites
- `orq-agent/agents/orchestration-generator.md` — 9 SKST sections; AskUserQuestion flagged for ORCHESTRATION.md overwrite
- `orq-agent/agents/tool-resolver.md` — 9 SKST sections; AskUserQuestion flagged for TOOLS.md overwrite
- `orq-agent/agents/researcher.md` — 9 SKST sections; AskUserQuestion flagged for research-brief.md overwrite
- `orq-agent/agents/readme-generator.md` — 9 SKST sections; AskUserQuestion flagged for README.md overwrite
- `orq-agent/agents/deployer.md` — 9 SKST sections; AskUserQuestion flagged for live Orq.ai agent create/update
- `orq-agent/agents/dataset-preparer.md` — 9 SKST sections; AskUserQuestion flagged for Orq.ai dataset overwrites
- `orq-agent/agents/experiment-runner.md` — 9 SKST sections; explicit "Non-destructive (experiments are append-only)"
- `orq-agent/agents/results-analyzer.md` — 9 SKST sections; explicit "Non-destructive" (pure disk computation)
- `orq-agent/agents/tester.md` — 9 SKST sections; delegates destructive acts to dataset-preparer
- `orq-agent/agents/dataset-generator.md` — 9 SKST sections; AskUserQuestion flagged for Mode-4 curation deletions; Annotation Queues URL carries TODO(SKST-10) marker
- `orq-agent/agents/failure-diagnoser.md` — 9 SKST sections; non-destructive itself but cites downstream AskUserQuestion gate (HITL approval collected here before prompt-editor is invoked)
- `orq-agent/agents/iterator.md` — 9 SKST sections; AskUserQuestion flagged for spec edits + re-deploy orchestration
- `orq-agent/agents/prompt-editor.md` — 9 SKST sections; AskUserQuestion flagged for spec file modification
- `orq-agent/agents/hardener.md` — 9 SKST sections; AskUserQuestion flagged for guardrail attach + promotion
- `orq-agent/agents/kb-generator.md` — 9 SKST sections; AskUserQuestion flagged for KB create when name already exists

## Decisions Made

- **SKST-01 for subagents satisfied by existing `tools:` frontmatter.** All 17 subagent files already declared `tools:` before this plan started. Zero frontmatter edits were made. The `allowed-tools:` key is a no-op on subagents per the Claude Code subagent schema (documented in RESEARCH.md Pitfall 2 and the Standard Stack / Frontmatter table). This plan added body sections only.
- **Subagent files with `<role>` wrapping (architect, dataset-generator, readme-generator) got SKST sections OUTSIDE `</role>`.** The `<role>` tag IS in the lint XML guard list (role, pipeline, files_to_read, objective, instructions), so any required H2 heading inside an unclosed `<role>` block fails the lint's XML-guard rule.
- **Legacy `<constraints>...</constraints>` XML wrappers preserved where present.** The `<constraints>` tag is NOT in the lint guard list, so existing `<constraints>`-wrapped sections in architect.md, readme-generator.md, and dataset-generator.md remain valid. In dataset-generator.md, the new SKST-format `## Constraints` replaces the content inside the old wrapper; in architect.md and readme-generator.md, the new SKST content was added alongside.
- **Non-destructive subagents use explicit "Non-destructive" wording.** `experiment-runner.md`, `results-analyzer.md`, `tester.md`, and `failure-diagnoser.md` state "Non-destructive" explicitly. `failure-diagnoser.md` additionally cites the downstream AskUserQuestion HITL gate (it collects HITL approval but does not mutate anything itself — prompt-editor does the mutation). This satisfies Task 3's acceptance criterion that all 5 files contain `AskUserQuestion` in Destructive Actions.
- **`prompt-editor.md` Constraints cite Phase 35 MSEL-02 + Phase 42 ITRX-07.** These forward-link IDs were not named in the plan's per-subagent NEVER/ALWAYS list for prompt-editor, but the acceptance criterion "Each file's Constraints section cites a future-phase requirement ID" required at least one. MSEL-02 (snapshot pinning) and ITRX-07 (audit trail) match the natural wording of prompt-editor's existing constraints.

## Deviations from Plan

None - plan executed exactly as written.

All 17 files received the 9-section template; per-file content tables (Destructive Actions, Companion Skills, Open in orq.ai) came verbatim from the `<interfaces>` block in the plan. Per-subagent NEVER/ALWAYS rules came verbatim from the plan's task-level specifications. The only content addition beyond the plan text was the two forward-link IDs added to `prompt-editor.md` (MSEL-02, ITRX-07) to satisfy Task 3 acceptance criterion #5. No auto-fixes were needed (no bugs, no blocking issues, no missing critical functionality discovered during migration).

## Authentication Gates

None — this plan is a pure file-edit migration with no external service calls.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

All plan-level verification checks pass:

1. `bash orq-agent/scripts/lint-skills.sh --files orq-agent/agents` → exit 0 (all 17 subagents pass all 9-section + tools-declared rules applicable to subagents).
2. Every required H2 heading present in every subagent file (per-section grep loop across all 17 files succeeded with zero MISSING output).
3. Every subagent has `^tools:` in frontmatter exactly once (grep -c returns 1).
4. NO subagent has `^allowed-tools:` in frontmatter (grep returns empty).
5. `dataset-generator.md` contains exactly 1 `TODO(SKST-10): verified in Phase 37+` marker.
6. No files under `orq-agent/commands/` or `orq-agent/SKILL.md` modified by this plan (git diff 84f01b4^..HEAD produces empty output for those paths).
7. `bash orq-agent/scripts/check-protected-pipelines.sh` → exit 0 (orq-agent, prompt, architect pipeline SHA-256 still match goldens — confirms no collateral damage from this plan running in parallel with Plan 02).
8. All 5 Task-3 subagents' Destructive Actions sections contain `AskUserQuestion` (programmatic awk-based extraction of the Destructive Actions section per file confirmed).
9. Forward-link graph covers the 10+ future-phase requirement IDs listed in Task 3 acceptance criteria: TFAIL-03 (failure-diagnoser), ITRX-01/05/07 (iterator), ITRX-08 + EVLD-08 (hardener), KBM-01/02/03/04 (kb-generator), ESCI-01/08 (failure-diagnoser), MSEL-02 + ITRX-07 (prompt-editor).

## Next Phase Readiness

- **Plan 04 (SKILL.md + references)** — both prerequisites (Plan 02 and Plan 03) are now complete. Plan 04 can proceed in Wave 2 and update `orq-agent/SKILL.md` plus the `## Resources convention` note per RESEARCH.md §Reference Consumer Graph finding (zero migration candidates exist today).
- **Phase 34 overall** — 3 of 5 plans complete (Plans 01, 02, 03). 2 plans remaining (Plan 04 for SKILL.md + references; Plan 05 if present).
- **V3.0 downstream phases (35-43)** — this plan's template can be copied for any new subagent file. The lint script enforces conformance automatically.

---
*Phase: 34-skill-structure-format-foundation*
*Completed: 2026-04-20*

## Self-Check: PASSED

Verified:
- 17 listed modified files all exist on disk (`ls orq-agent/agents/*.md | wc -l` = 17).
- 3 task commits present in git log (`84f01b4`, `cb37420`, `342ac46`).
- Full directory lint exits 0 (`bash orq-agent/scripts/lint-skills.sh --files orq-agent/agents`).
- Protected pipelines check exits 0 — no collateral damage from running in parallel with Plan 02.
- SUMMARY.md file exists at `.planning/phases/34-skill-structure-format-foundation/34-03-SUMMARY.md`.
