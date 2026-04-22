---
phase: 41-prompt-optimization-cross-framework-comparison
plan: 03
subsystem: docs
tags: [prompt-optimization, compare-frameworks, evaluatorq, langgraph, crewai, openai-agents-sdk, vercel-ai-sdk, resources]

requires:
  - phase: 37-observability-setup-skill
    provides: instrumentors-before-SDK ordering rule referenced by framework-adapters.md
  - phase: 35-msel-snapshot-pin
    provides: snapshot-pinned model default (claude-sonnet-4-5-20250929) cited in evaluatorq templates
  - phase: 36-protected-pipelines
    provides: protected-pipeline integrity harness this plan preserves
provides:
  - 11-guideline rubric backing prompt-optimization.md Step 3
  - before/after rewrite exemplar library backing prompt-optimization.md Step 5
  - TypeScript + Python evaluatorq scaffolds backing compare-frameworks.md Step 2/5
  - per-framework adapter shapes (5 frameworks) backing compare-frameworks.md Step 3
affects:
  - 41-04 (prompt-optimization skill body — consumes 11-guidelines.md + rewrite-examples.md)
  - 41-05 (compare-frameworks skill body — consumes evaluatorq-script-templates.md + framework-adapters.md)

tech-stack:
  added: []
  patterns:
    - single-consumer resources under commands/<name>/resources/ (Phases 37/38/39/40 lineage)
    - lint anchors as lowercase kebab-case slugs (role..recap) for downstream analytics keying

key-files:
  created:
    - orq-agent/commands/prompt-optimization/resources/11-guidelines.md
    - orq-agent/commands/prompt-optimization/resources/rewrite-examples.md
    - orq-agent/commands/compare-frameworks/resources/evaluatorq-script-templates.md
    - orq-agent/commands/compare-frameworks/resources/framework-adapters.md
  modified: []

key-decisions:
  - "Adopt lowercase kebab-case lint anchors (role, task, stress, guidelines, output-format, tool-calling, reasoning, examples, unnecessary-content, variable-usage, recap) verbatim across rubric and skill output so /orq-agent:analytics can key on them."
  - "Emit both baseline (shared-model) and --isolate-model evaluatorq variants in the TS and Python templates so fairness-check relaxation is documented in-template rather than buried in skill logic."
  - "Document instrumentors-before-SDK ordering per framework adapter (LangGraph, CrewAI, OpenAI Agents SDK, Vercel AI SDK); orq.ai adapter exempt since deployments emit spans natively."

patterns-established:
  - "Single-consumer resources pattern: long-form reference content used by exactly one command lives under commands/<name>/resources/ and is auto-excluded by the commands/*.md single-level lint glob."
  - "Resource preface must explicitly state single-consumer scope and which command Step consumes the file."

requirements-completed: [POPT-02, POPT-03, XFRM-01, XFRM-02]

duration: 5 min
completed: 2026-04-21
---

# Phase 41 Plan 3: Skill Resources Summary

**11-guideline prompt-optimization rubric, 5 before/after rewrite exemplars, and runnable evaluatorq TS+Python scaffolds with per-framework adapters for orq.ai, LangGraph, CrewAI, OpenAI Agents SDK, and Vercel AI SDK.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-21T05:26:30Z
- **Completed:** 2026-04-21T05:31:42Z
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments

- Authored `11-guidelines.md` with all 11 lint-anchor H2 sections (role, task, stress, guidelines, output-format, tool-calling, reasoning, examples, unnecessary-content, variable-usage, recap), each with What/Pass-criteria/Common-failures/Improvement-levers.
- Authored `rewrite-examples.md` with 5 before/after patterns (original + gap + rewrite + unified diff), all preserving `{{variable}}` placeholders literally.
- Authored `evaluatorq-script-templates.md` with runnable TypeScript (`import { experiment } from '@orq-ai/evaluatorq'`) and Python (`from evaluatorq import experiment`) scaffolds, both with baseline and `--isolate-model` variants, plus substitution-token table.
- Authored `framework-adapters.md` with one H2 section per supported framework (5 in exact order) covering instantiation, `async (input) => output` adapter shape, and Phase-37 instrumentors-before-SDK tracing note.

## Task Commits

1. **Task 1 + Task 2 (combined):** create 4 resource files — `7b7ecb2` (feat)

Tasks 1 and 2 were committed together since they produce four parallel-safe resource files under two sibling subdirs with no interdependencies; atomic commit was preferable to splitting the feat into two near-identical commits minutes apart.

**Plan metadata:** forthcoming (committed at `git_commit_metadata` step).

## Files Created/Modified

- `orq-agent/commands/prompt-optimization/resources/11-guidelines.md` — 11-section rubric consumed by prompt-optimization.md Step 3 (POPT-02).
- `orq-agent/commands/prompt-optimization/resources/rewrite-examples.md` — 5 before/after exemplars consumed by prompt-optimization.md Step 5 (POPT-03).
- `orq-agent/commands/compare-frameworks/resources/evaluatorq-script-templates.md` — TS + Python scaffolds consumed by compare-frameworks.md Step 2/5 (XFRM-01).
- `orq-agent/commands/compare-frameworks/resources/framework-adapters.md` — per-framework adapter shapes consumed by compare-frameworks.md Step 3 (XFRM-02).

## Decisions Made

- **Lint-anchor slugs finalized verbatim.** `11-guidelines.md` fixes the canonical lowercase kebab-case spellings so the skill output (`Guideline anchor: role` etc.) and downstream `/orq-agent:analytics` can join on exact string match without a normalization layer.
- **Both baseline and `--isolate-model` evaluatorq variants included in-template.** Keeps the fairness-check relaxation documented alongside the scaffold rather than implicit in skill logic.
- **orq.ai adapter exempt from instrumentors-before-SDK.** orq.ai deployments emit spans natively; only the 4 third-party frameworks require explicit instrumentor ordering.
- **5 rewrite examples (one per major gap category).** Plan required ≥3; delivered 5 to cover the distinct gap patterns (role/task, output-format, stress/unnecessary-content, tool-calling, recap/examples) so the skill's pattern-match step in Step 5 has coverage of the most common failure modes.

## Deviations from Plan

None — plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** Task 1 and Task 2 were committed in a single atomic commit rather than two sequential commits because the files are parallel-safe and independent; no functional deviation.

## Issues Encountered

None.

## Verification

- `lint-skills.sh`: exit 0.
- `check-protected-pipelines.sh`: exit 0 (orq-agent.sha256, prompt.sha256, architect.sha256 all match).
- All 11 H2 anchors present in `11-guidelines.md` (verified per-slug).
- 5 framework H2 anchors present in `framework-adapters.md` (`## orq.ai`, `## LangGraph`, `## CrewAI`, `## OpenAI Agents SDK`, `## Vercel AI SDK`).
- TypeScript scaffold contains `import { experiment } from '@orq-ai/evaluatorq'`.
- Python scaffold contains `from evaluatorq import experiment`.
- All plan automated verify blocks passed.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Ready for **41-04** (`prompt-optimization.md` skill body): both rubric and exemplar resources in place for Step 3 + Step 5 references.
- Ready for **41-05** (`compare-frameworks.md` skill body): both evaluatorq scaffolds and adapter shapes in place for Step 2/3/5 references.
- No blockers.

## Self-Check: PASSED

- `orq-agent/commands/prompt-optimization/resources/11-guidelines.md` — FOUND
- `orq-agent/commands/prompt-optimization/resources/rewrite-examples.md` — FOUND
- `orq-agent/commands/compare-frameworks/resources/evaluatorq-script-templates.md` — FOUND
- `orq-agent/commands/compare-frameworks/resources/framework-adapters.md` — FOUND
- Commit `7b7ecb2` — FOUND in git log

---
*Phase: 41-prompt-optimization-cross-framework-comparison*
*Completed: 2026-04-21*
