---
phase: 41-prompt-optimization-cross-framework-comparison
plan: 02
subsystem: skills
tags: [skst, evaluatorq, cross-framework, langgraph, crewai, openai-agents-sdk, vercel-ai-sdk, experiment, fairness]

requires:
  - phase: 34-skst-discipline
    provides: 9-section SKST layout + lint-skills.sh enforcement
  - phase: 35-snapshot-pinning
    provides: MSEL-02 snapshot-pin rule for model ids
  - phase: 36-protected-pipelines
    provides: SHA-256 integrity for orq-agent/prompt/architect skills
provides:
  - orq-agent/commands/compare-frameworks.md skill (XFRM-01..03)
  - 5-framework verbatim anchor set (orq.ai, LangGraph, CrewAI, OpenAI Agents SDK, Vercel AI SDK)
  - --lang python|ts and --isolate-model flag grammar
  - Fairness check + smoke-invocation precheck pattern for cross-framework experiments
  - evaluatorq TypeScript + Python scaffold references (script-templates.md forward-ref)
affects: [41-03, 41-04, 41-05, analytics, traces, trace-failure-analysis]

tech-stack:
  added: ["@orq-ai/evaluatorq (TS) / evaluatorq (Python) SDK references in emitted scripts"]
  patterns:
    - "Fairness check before live invocation (dataset/evaluators/model/snapshot-pinning)"
    - "Smoke-invocation precheck per adapter before full experiment run"
    - "Shared experiment_id drives side-by-side UI column layout"

key-files:
  created:
    - orq-agent/commands/compare-frameworks.md
  modified: []

key-decisions:
  - "Fairness checks fail-fast with specific remediation messages rather than best-effort degradation"
  - "Smoke-invocation precheck is mandatory (one call per adapter) — silent bad adapters pollute entire experiment"
  - "Shared experiment_id required — five separate experiments break the side-by-side UI column layout"
  - "--isolate-model is opt-in only; requires --models list of length 5 to prevent accidental model drift"
  - "Emit model snapshots inside code fences only (no top-level `model:` YAML) to satisfy lint rule snapshot-pinned-models"

patterns-established:
  - "Cross-framework skill pattern: collect adapters via AskUserQuestion → fairness check → smoke precheck → emit script → run → link"
  - "Stable framework keys: orq-ai, langgraph, crewai, openai-agents-sdk, vercel-ai-sdk"

requirements-completed: [XFRM-01, XFRM-02, XFRM-03]

duration: 6min
completed: 2026-04-20
---

# Phase 41 Plan 02: Compare-Frameworks Skill Summary

**Cross-framework comparison skill emitting a snapshot-pinned evaluatorq script (Python or TypeScript) across orq.ai, LangGraph, CrewAI, OpenAI Agents SDK, and Vercel AI SDK with fairness checks and mandatory smoke-invocation precheck.**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-04-20
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `orq-agent/commands/compare-frameworks.md` (295 lines) with full 9-section SKST layout.
- All 5 framework names present verbatim (orq.ai, LangGraph, CrewAI, OpenAI Agents SDK, Vercel AI SDK).
- `--lang python|ts`, `--isolate-model`, and `evaluatorq` anchors present for lint/grep verification.
- Fairness checks enumerate dataset / evaluators / model / snapshot-pinning with specific remediation messages.
- Smoke-invocation precheck documented as mandatory stop-the-world gate before full experiment.
- Shared `experiment_id` contract documented in Steps 6 and 7 with Experiment UI deep link.
- TypeScript + Python scaffolds referenced inline (resources file to be authored in plan 41-03).

## Task Commits

1. **Task 1: Create compare-frameworks.md with 9 SKST sections + XFRM-01..03 body** — `53b6c0a` (feat)

## Files Created/Modified

- `orq-agent/commands/compare-frameworks.md` — new skill, 295 lines, banner `ORQ ► COMPARE FRAMEWORKS`, 9 SKST sections, 7 numbered steps, 7-row Anti-Patterns table.

## Decisions Made

- Kept model snapshots inside code fences (not top-level YAML) so the `snapshot-pinned-models` lint rule never fires on legitimate template content.
- Fairness check emits the exact remediation string — fail-fast with a remediation is more useful than best-effort with a warning.
- Stable framework keys chosen to match evaluatorq `jobs[].key` convention (`orq-ai`, `langgraph`, `crewai`, `openai-agents-sdk`, `vercel-ai-sdk`).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required at this plan level. The skill itself requires `ORQ_API_KEY` + deploy+ tier at runtime, which is covered by the global install flow.

## Next Phase Readiness

- Plan 41-03 will author `orq-agent/commands/compare-frameworks/resources/evaluatorq-script-templates.md` (Python + TypeScript scaffolds) referenced from Step 5.
- Plan 41-04/41-05 will wire help.md + SKILL.md entries and cross-reference from `/orq-agent:prompt-optimization` and `/orq-agent:analytics`.

---

## Verification

- `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/compare-frameworks.md` → exit 0.
- `bash orq-agent/scripts/check-protected-pipelines.sh` → 3/3 SHA-256 intact.
- 5 framework names present verbatim (grep confirmed).
- `--isolate-model`, `--lang python|ts`, `evaluatorq` anchors present.
- Smoke-invocation precheck language present in Step 4.
- Shared `experiment_id` language present in Step 7.

## Self-Check: PASSED

- FOUND: orq-agent/commands/compare-frameworks.md
- FOUND: 53b6c0a (feat(41-02): add compare-frameworks skill)

---
*Phase: 41-prompt-optimization-cross-framework-comparison*
*Completed: 2026-04-20*
