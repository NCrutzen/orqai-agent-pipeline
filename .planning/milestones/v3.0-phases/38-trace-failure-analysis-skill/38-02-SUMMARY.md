---
phase: 38-trace-failure-analysis-skill
plan: 02
subsystem: skills
tags: [trace-analysis, grounded-theory, error-analysis, resources, tfail]

# Dependency graph
requires:
  - phase: 37-observability-setup-skill
    provides: per-skill resources/ subdirectory pattern (auto-excluded from commands/*.md single-level lint glob)
  - phase: 34-skill-structure-format-foundation
    provides: Resources Policy (single-consumer → per-skill resources dir)
provides:
  - Long-form grounded-theory methodology doc (open+axial coding, first-upstream-failure rule, saturation heuristic)
  - 4-category failure-mode classification decision rules with concrete examples
  - Classification → next-skill handoff matrix consumed by the Step 7 report generator
affects: [38-trace-failure-analysis Plan 03 (main skill body), 38-04 (index wiring), 38-05 (phase-close verification)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-skill resources/ subdirectory reuse (Phase 37 precedent) — single-consumer reference docs live under commands/<skill>/resources/, auto-excluded from default lint file set"

key-files:
  created:
    - orq-agent/commands/trace-failure-analysis/resources/grounded-theory-methodology.md
    - orq-agent/commands/trace-failure-analysis/resources/failure-mode-classification.md
    - orq-agent/commands/trace-failure-analysis/resources/handoff-matrix.md
  modified: []

key-decisions:
  - "Resources land under commands/trace-failure-analysis/resources/ (single-consumer) — NOT orq-agent/references/ (multi-consumer). Confirms Phase 34 Resources Policy."
  - "Content is freeform prose (no SKST frontmatter / no 9-section requirement) because lint default glob is commands/*.md single-level — resources/ is auto-excluded."
  - "First-upstream-failure rule made the load-bearing rule in grounded-theory doc with a concrete 3-span cascade example — frames the rate-inflation anti-pattern the skill is designed to prevent (TFAIL-03)."
  - "Classification mutual-exclusivity tiebreaker: prefer specification over generalization-* when both fit — fixing the prompt eliminates the downstream evaluator need (upstream-fix-first heuristic)."
  - "Multi-mode handoff ordering: trivial-bug → specification → code-checkable → subjective — ordered by cost-to-fix and dependency blocking."

patterns-established:
  - "Phase-37 resources/ pattern reuse: per-skill docs live under commands/<skill>/resources/ with no lint exposure and no SKST gating — pattern now proven reusable across Phase 37 + Phase 38"
  - "Forward-reference acknowledgement: handoff-matrix.md cites Phase 41 (optimize-prompt) and Phase 42 (EVLD-04..08) by requirement ID so downstream phases can grep-find entry points"

requirements-completed:
  - TFAIL-02
  - TFAIL-03
  - TFAIL-05
  - TFAIL-06

# Metrics
duration: 1 min
completed: 2026-04-21
---

# Phase 38 Plan 02: Trace Failure Analysis Resources Summary

**Grounded-theory methodology + 4-category classification decision rules + classification→next-skill handoff matrix shipped as 3 single-consumer resource files under orq-agent/commands/trace-failure-analysis/resources/ (reusing the Phase 37 per-skill resources pattern).**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-21T04:22:09Z
- **Completed:** 2026-04-21T04:23:48Z
- **Tasks:** 1
- **Files created:** 3

## Accomplishments

- Created `orq-agent/commands/trace-failure-analysis/resources/` subdirectory (first artifact in the Phase 38 skill scaffolding).
- Shipped `grounded-theory-methodology.md` (45 lines): explains open vs axial coding, 4-8 mode band rationale, first-upstream-failure rule with 3-span cascade example, saturation heuristic, non-overlap discipline.
- Shipped `failure-mode-classification.md` (63 lines): 4 mutually-exclusive categories (specification / generalization-code-checkable / generalization-subjective / trivial-bug) with decision rules, concrete examples, and explicit fix-path delegation to other skills.
- Shipped `handoff-matrix.md` (25 lines): classification → next-skill table + multi-mode priority ordering + no-handoff-applies escape hatch.
- Full-suite lint stays green; protected-pipelines SHA-256 check 3/3 green; resources/ remained outside the default commands/*.md glob as designed.

## Task Commits

1. **Task 1: Create the 3 resource files** — `29851b6` (feat)

_Plan metadata commit: follows this summary._

## Files Created/Modified

- `orq-agent/commands/trace-failure-analysis/resources/grounded-theory-methodology.md` — Open + axial coding walkthrough, first-upstream-failure rule (with multi-span cascade example), saturation heuristic, non-overlap discipline. Consumed by main skill Steps 2, 3, 4.
- `orq-agent/commands/trace-failure-analysis/resources/failure-mode-classification.md` — 4 mutually-exclusive failure categories with decision rules + examples + fix-path delegation. Consumed by main skill Step 6.
- `orq-agent/commands/trace-failure-analysis/resources/handoff-matrix.md` — Classification → next-skill table + multi-mode priority ordering. Consumed by main skill Step 7 report generator.

## Decisions Made

See frontmatter `key-decisions`. Load-bearing:

- **Resources location:** single-consumer → per-skill resources dir per Phase 34 Resources Policy; NOT orq-agent/references/.
- **Content shape:** freeform prose (no SKST gating) because resources/ is auto-excluded from lint default glob.
- **First-upstream-failure framing:** made the rule load-bearing with a concrete 3-span cascade so the rate-inflation anti-pattern is visceral.
- **Mutual-exclusivity tiebreaker:** upstream-fix-first (prefer specification over generalization-* when both fit).
- **Multi-mode handoff order:** trivial-bug → specification → code-checkable → subjective.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for Plan 03 (main skill body `orq-agent/commands/trace-failure-analysis.md`) — the 3 resource files exist at the paths the main skill's Steps 2/3/6/7 will Read + cite.
- Ready for Plan 04 (index wiring in SKILL.md + help.md) — Phase 37 index-wiring recipe applies unchanged.
- Ready for Plan 05 (phase-close VERIFICATION.md) — 4th consecutive reuse of the canonical phase-close pattern (34/35/36/37 precedent).

## Self-Check: PASSED

- `orq-agent/commands/trace-failure-analysis/resources/grounded-theory-methodology.md` → FOUND (45 lines)
- `orq-agent/commands/trace-failure-analysis/resources/failure-mode-classification.md` → FOUND (63 lines)
- `orq-agent/commands/trace-failure-analysis/resources/handoff-matrix.md` → FOUND (25 lines)
- Commit `29851b6` → FOUND in git log
- Full-suite lint → GREEN
- Protected pipelines → 3/3 GREEN
- All content anchors (open coding, axial coding, first upstream, saturation, 4 class names, /orq-agent:harden, /orq-agent:prompt) → PRESENT

---
*Phase: 38-trace-failure-analysis-skill*
*Completed: 2026-04-21*
