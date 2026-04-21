---
phase: 38-trace-failure-analysis-skill
plan: 01
subsystem: observability
tags: [trace-failure-analysis, grounded-theory, mcp, skst, failure-taxonomy, error-analysis]

# Dependency graph
requires:
  - phase: 37-observability-setup-skill
    provides: Instrumented + identity-tagged traces (OBSV-01..07) consumed as the sampling surface
  - phase: 36-lifecycle-slash-commands
    provides: /orq-agent:traces + /orq-agent:analytics query surface; MCP-first with REST fallback pattern + errors-first sort discipline
  - phase: 34-skill-structure-format-foundation
    provides: 9 SKST mandatory H2 sections + lint-skills.sh rule set
  - phase: 35-model-selection-discipline
    provides: MSEL-02 snapshot-pinned-models lint rule (no floating-alias model: lines emitted)
provides:
  - Single-file skill orq-agent/commands/trace-failure-analysis.md invocable as /orq-agent:trace-failure-analysis
  - TFAIL-01 50/30/20 mixed sampling strategy (random + failure-driven + outlier)
  - TFAIL-02 grounded-theory open + axial coding yielding 4-8 non-overlapping modes
  - TFAIL-03 first-upstream-failure labeling with cascade-of downstream annotation
  - TFAIL-04 transition failure matrix (last success × first failure) for multi-step pipelines
  - TFAIL-05 4-category mode classification (specification / gen-code-checkable / gen-subjective / trivial-bug)
  - TFAIL-06 error-analysis-YYYYMMDD-HHMM.md report with taxonomy + rates + example trace IDs + recommended handoff
  - Companion-skill handoff graph: ← observability/traces, → harden/prompt/iterate/(none)
affects: [39-datasets, 40-evaluation-science, 42-iteration, 43-distribution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Mixed-method trace sampling (50 random / 30 failure-driven / 20 outlier) inlined in report for reproducibility
    - First-upstream-failure labeling with cascade-of annotation (prevents cascade inflation)
    - Transition failure matrix as pipeline-design diagnostic
    - 4-category mutually-exclusive classification mapping to next-skill handoff
    - AskUserQuestion-backed axial-coding approval loop (user owns final taxonomy)
    - Per-skill resources/ subdirectory pattern reused from Phase 37 (grounded-theory-methodology.md, failure-mode-classification.md, handoff-matrix.md — resources created in Plan 02)

key-files:
  created:
    - orq-agent/commands/trace-failure-analysis.md (287 lines, single-file skill)
  modified: []

key-decisions:
  - "Default batch size for open-coding AskUserQuestion loop = 10 traces per batch — manageable review scope; mentioned in Step 2"
  - "Saturation heuristic wording: 'stop when two consecutive batches produce no new annotation themes' — user-overridable via explicit AskUserQuestion prompt at trigger"
  - "Output filename pattern: error-analysis-YYYYMMDD-HHMM.md in cwd, with ./Agents/<swarm-name>/ preference if invoked from swarm directory"
  - "Overwrite conflict handling: AskUserQuestion with 3 choices (overwrite / rename with -v2 suffix / cancel) before writing over existing file"
  - "Resources (grounded-theory-methodology.md, failure-mode-classification.md, handoff-matrix.md) referenced by path only — actual creation deferred to Plan 02 per parallel_safety invariant"
  - "MSEL-02 clean by construction: zero 'model:' YAML lines emitted; only prose model-ID examples (claude-sonnet-4-5-20250929) appear in sample output tables"

patterns-established:
  - "Pattern: Mixed sampling plan rendered as inline table with actual trace IDs — makes the sampling bucket assignment auditable and reproducible"
  - "Pattern: cascade-of: <parent_mode> annotation — encodes first-upstream-failure discipline directly in the labeled output so downstream report consumers cannot accidentally double-count"
  - "Pattern: AskUserQuestion-backed axial-coding approval — taxonomy authority rests with the user; skill proposes, user disposes"

requirements-completed: [TFAIL-01, TFAIL-02, TFAIL-03, TFAIL-04, TFAIL-05, TFAIL-06]

# Metrics
duration: 2 min
completed: 2026-04-21
---

# Phase 38 Plan 01: Trace Failure Analysis Skill Authoring Summary

**Single-file SKST-compliant `/orq-agent:trace-failure-analysis` skill that walks users from ~100 production traces to a 4-8 mode failure taxonomy via grounded-theory coding, with first-upstream-failure labeling, transition matrix, 4-category classification, and a handoff-ready error-analysis report.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T04:22:11Z
- **Completed:** 2026-04-21T04:24:53Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments

- Created `orq-agent/commands/trace-failure-analysis.md` (287 lines) closing TFAIL-01..06 in one authoring pass.
- All 9 mandatory SKST H2 sections present and lint-green.
- 7 numbered `## Step N:` sections (Sampling → Open Coding → Axial Coding → First-Upstream Labeling → Transition Matrix → Mode Classification → Report Generation).
- Full acceptance-criteria grep suite passes (33/33 anchors).
- `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/trace-failure-analysis.md` exits 0.
- `bash orq-agent/scripts/check-protected-pipelines.sh` exits 0 (3/3 SHA-256 matches preserved).

## Task Commits

1. **Task 1: Author trace-failure-analysis.md with 9 SKST + 7 Steps covering TFAIL-01..06** — `92ae1fd` (feat)

_Plan metadata commit: to be appended after STATE + ROADMAP + REQUIREMENTS updates._

## Files Created/Modified

- `orq-agent/commands/trace-failure-analysis.md` (NEW, 287 lines) — single-file SKST-compliant skill; YAML frontmatter with `description` + `allowed-tools` + `argument-hint`; 9 SKST H2 sections + 7 numbered Step H2 sections; MCP-first with REST fallback; 7-row Anti-Patterns table; deploy+ tier gate with core-tier escape message.

## Decisions Made

Under "Claude's Discretion" header in 38-CONTEXT.md, three implementation details were concretized:

1. **Open-coding batch size = 10 traces per AskUserQuestion round** — matches CONTEXT.md proposal; keeps review scope manageable without fragmenting the saturation signal.
2. **Saturation heuristic wording = "stop when two consecutive batches produce no new annotation themes"** — verbatim from CONTEXT.md, with an explicit user-override prompt when the heuristic triggers (respects user authority over taxonomy completeness).
3. **Output filename pattern = `error-analysis-YYYYMMDD-HHMM.md`** in cwd, with `./Agents/<swarm-name>/` preference if invoked from a swarm directory — matches CONTEXT.md proposal.
4. **Overwrite-conflict UX = 3-choice AskUserQuestion** (overwrite / rename with -v2 suffix / cancel) — the skill never silently clobbers an existing report.
5. **Resources referenced by path only in Plan 01** — `grounded-theory-methodology.md`, `failure-mode-classification.md`, and `handoff-matrix.md` are referenced but not authored here; their creation is Plan 02's responsibility per the phase's parallel_safety invariant (Plan 01 modifies only trace-failure-analysis.md; Plan 02 only creates resources/*).
6. **MSEL-02 clean by construction** — the skill emits zero `model:` YAML lines (it operates on queried traces, not authored specs); only prose examples like `claude-sonnet-4-5-20250929` appear in sample output tables, which the MSEL-02 regex (`^\s*-?\s*model:\s*...`) does not match.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 38 Plan 01 complete (1/4 plans).
- **Ready for Plan 02:** author the three per-skill resource files (`grounded-theory-methodology.md`, `failure-mode-classification.md`, `handoff-matrix.md`) under `orq-agent/commands/trace-failure-analysis/resources/`. Plan 02 runs in wave-parallel with Plan 01 (different file scope) but mechanically downstream for the end-to-end reader-surface — a user running the skill without the resources sees broken `Read` calls in Steps 2, 3, 6, and 7.
- **Subsequent plans:** Plan 03 (SKILL.md + help.md index wiring + companion back-reference from traces.md), Plan 04 (phase-close VERIFICATION.md capturing TFAIL traceability, SKST lint green, protected-pipeline SHA-256 intact).

## Self-Check

Verified on disk after SUMMARY authoring:

- `[ -f orq-agent/commands/trace-failure-analysis.md ]` → FOUND (287 lines)
- `git log --oneline --all | grep 92ae1fd` → FOUND ("feat(38-01): author trace-failure-analysis skill with 9 SKST sections + 7 Steps")
- Lint exit 0 captured in execution log.
- Protected-pipelines 3/3 match captured in execution log.

## Self-Check: PASSED

---
*Phase: 38-trace-failure-analysis-skill*
*Completed: 2026-04-21*
