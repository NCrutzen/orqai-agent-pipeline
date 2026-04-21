---
phase: 41-prompt-optimization-cross-framework-comparison
plan: 01
subsystem: skills
tags: [prompt-engineering, orq-ai, skst, mcp, rest, versioning, 11-guidelines]

requires:
  - phase: 34-skill-structure-format-foundation
    provides: 9-section SKST canonical layout + lint-skills.sh enforcement
  - phase: 35-model-selection-discipline
    provides: MSEL-02 snapshot-pin lint (no floating aliases)
  - phase: 36-lifecycle-slash-commands
    provides: MCP-first + REST fallback discipline; never-fabricate invariant
  - phase: 38-trace-failure-analysis-skill
    provides: specification-mode handoff target (prompt fix ← failure taxonomy)
provides:
  - orq-agent/commands/prompt-optimization.md (SKST-compliant skill for POPT-01..04)
  - 11 guideline anchors (role/task/stress/guidelines/output-format/tool-calling/reasoning/examples/unnecessary-content/variable-usage/recap) as canonical prompt-engineering grammar
  - {{variable}} preservation contract (literal-token invariant across rewrites)
  - 5-suggestion hard cap pattern (cognitive-load ceiling)
  - AskUserQuestion approval gate pattern for rollback-safe destructive actions
  - MCP create_prompt_version with REST POST /v2/prompts/{key}/versions fallback
affects: [41-02 (resources/11-guidelines.md), 41-03 (resources/rewrite-examples.md), 41-04 (compare-frameworks.md cross-references), 41-05 (SKILL.md + help.md index wiring), Phase 42 evaluators]

tech-stack:
  added: []
  patterns:
    - "11-anchor verbatim-name taxonomy for prompt-engineering suggestions"
    - "Variable-preservation regex scan (\\{\\{[^}]+\\}\\}) before rewrite emission"
    - "Hard-cap N with truncation-notice pattern for suggestion lists"
    - "Three-way approval gate (yes / no / edit-first) via AskUserQuestion"
    - "Parent-version-id linkage for orq.ai prompt version chains"

key-files:
  created:
    - orq-agent/commands/prompt-optimization.md
  modified: []

key-decisions:
  - "Banner verbatim: ORQ ► PROMPT OPTIMIZATION (matches Phase 34-40 convention)"
  - "Three-way approval (yes/no/edit-first) instead of binary — edit-first preserves user agency when the diff is close-but-not-quite"
  - "Inline (--prompt) path supported alongside --prompt-key; inline mode skips Step 7 new-version publish since there is no parent version to fork from"
  - "Hard cap 5 is clamp (not warning): --max-suggestions > 5 is silently clamped to 5"
  - "11-anchor names used verbatim in both Constraints and the Step 3 table — single source of truth for the lint-anchor grep in VALIDATION.md"
  - "Referenced resources (11-guidelines.md, rewrite-examples.md) are cited but NOT created in this plan — they belong to 41-02 / 41-03 (single-responsibility per plan)"

patterns-established:
  - "Rollback-safe destructive action: new orq.ai version + preserve original = rollback via platform UI; AskUserQuestion still gates because workspace artifacts materialize"
  - "Never-fabricate-version-id: if both MCP and REST fail, STOP with raw error — synthetic ids poison downstream /orq-agent:test A/B runs"
  - "Anchor-taxonomy discipline: if a proposed suggestion doesn't map to one of 11, DROP the suggestion (no 'other' escape hatch)"

requirements-completed: [POPT-01, POPT-02, POPT-03, POPT-04]

duration: 8 min
completed: 2026-04-20
---

# Phase 41 Plan 01: Prompt Optimization Skill Summary

**SKST-compliant `/orq-agent:prompt-optimization` skill implementing the 11-guideline prompt-engineering framework with 5-suggestion cap, AskUserQuestion-gated rewrite approval, and MCP-first new-version publishing (REST fallback) that preserves the original prompt for rollback.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-20
- **Completed:** 2026-04-20
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments

- Created `orq-agent/commands/prompt-optimization.md` — 278-line SKST-compliant skill.
- All 9 SKST H2 sections present (Constraints, When to use, When NOT to use, Companion Skills, Done When, Destructive Actions, Anti-Patterns, Open in orq.ai, Documentation & Resolution); lint exits 0.
- All 11 guideline anchors (`role`, `task`, `stress`, `guidelines`, `output-format`, `tool-calling`, `reasoning`, `examples`, `unnecessary-content`, `variable-usage`, `recap`) present verbatim in both the Constraints list and the Step 3 analysis table — canonical prompt-engineering grammar locked in as single source of truth.
- 8 numbered Steps covering fetch → variable scan → 11-anchor analysis → up-to-5 suggestions → rewrite + diff → approval gate → publish new version (MCP first, REST fallback) → recommend `/orq-agent:test`.
- `{{variable}}` preservation regex-scan and literal-token invariant documented in Step 2 + Step 5 re-draft guard.
- 5-suggestion hard cap with truncation-notice pattern for re-run flow.
- Three-way AskUserQuestion approval (yes / no / edit-first) rather than binary — preserves user agency on near-miss rewrites.
- `create_prompt_version` MCP + `POST /v2/prompts/{key}/versions` REST fallback, both present and grep-verifiable; never-fabricate-version-id discipline documented.
- Recommends `/orq-agent:test --prompt-key <key> --version <new_id>` for post-rewrite A/B validation; companion-skills section wires inbound link from `/orq-agent:trace-failure-analysis` (specification-mode handoff).

## Task Commits

1. **Task 1: Create prompt-optimization.md with 9 SKST sections + POPT-01..04 body** — `8247a10` (feat)

_(Plan metadata commit added at end of plan via gsd-tools commit step.)_

## Files Created/Modified

- `orq-agent/commands/prompt-optimization.md` — new skill file; banner `ORQ ► PROMPT OPTIMIZATION`; 8-step body; 6 anti-pattern rows; frontmatter pins tier (deploy+) and argument-hint.

## Decisions Made

- **Three-way approval gate (yes / no / edit-first).** Binary approval loses the near-miss path; `edit-first` lets the user paste back an edited rewrite via `--prompt` without re-running the full analysis.
- **Inline `--prompt` mode supported alongside `--prompt-key`.** Inline mode skips the Step 7 publish (no parent version to fork) and emits the rewrite to stdout instead — preserves the skill's value for users who haven't deployed the prompt to orq.ai yet.
- **Hard-cap 5 is a clamp, not a warning.** `--max-suggestions 10` is silently clamped to 5; the cognitive-load ceiling is not user-adjustable.
- **Referenced resources (`11-guidelines.md`, `rewrite-examples.md`) are cited-only, not created in this plan.** They are the deliverables of 41-02 and 41-03 respectively; this plan establishes the reference anchors so later plans slot in without edits to prompt-optimization.md.
- **All 11 anchor names appear verbatim in the file (not as placeholders).** The lint-anchor grep in VALIDATION.md depends on literal-string presence; no templating or indirection.

## Deviations from Plan

None — plan executed exactly as written. Every constraint, step, and verification anchor in 41-01-PLAN.md landed verbatim in the created file.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Ready for **41-02** — build `orq-agent/commands/prompt-optimization/resources/11-guidelines.md` (detailed rubric per anchor; referenced by Step 3 of the skill).
- Ready for **41-03** — build `orq-agent/commands/prompt-optimization/resources/rewrite-examples.md` (before/after patterns per anchor; referenced by Step 5 of the skill).
- Ready for **41-04** — build `orq-agent/commands/compare-frameworks.md` (XFRM-01..03) which will cross-reference prompt-optimization.md via Companion Skills.
- Ready for **41-05** — wire `/orq-agent:prompt-optimization` into SKILL.md index and help.md command list.
- No blockers; protected-pipeline SHA-256 3/3 intact (orq-agent.md, prompt.md, architect.md all untouched as planned).

## Self-Check: PASSED

- `orq-agent/commands/prompt-optimization.md` exists on disk (verified).
- Commit `8247a10` present in `git log --oneline` (verified).
- `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/prompt-optimization.md` exits 0 (verified).
- `bash orq-agent/scripts/check-protected-pipelines.sh` exits 0; 3/3 SHA-256 matches (verified).
- All 11 guideline anchor strings grep-present (counts: role=5, task=6, stress=5, guidelines=7, output-format=8, tool-calling=6, reasoning=6, examples=7, unnecessary-content=5, variable-usage=9, recap=6).
- `ORQ ► PROMPT OPTIMIZATION` banner grep-present (2 occurrences).
- `AskUserQuestion` grep-present (7 occurrences).
- `{{` grep-present (14 occurrences — variable-usage examples).
- `create_prompt_version|POST /v2/prompts` grep-present (5 occurrences).

---
*Phase: 41-prompt-optimization-cross-framework-comparison*
*Completed: 2026-04-20*
