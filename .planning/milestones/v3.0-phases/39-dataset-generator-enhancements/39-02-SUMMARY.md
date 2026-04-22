---
phase: 39-dataset-generator-enhancements
plan: 02
subsystem: dataset-generation
tags: [cli, skill, slash-command, mode-dispatch, promote-trace, curation, two-step, multi-turn, rag]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: 9-SKST section contract + protected-pipeline SHA-256 invariant
  - phase: 39-dataset-generator-enhancements
    provides: dataset-generator subagent enhancements (Plan 01) — downstream Step 5 consumer
provides:
  - CLI flag parsing for --mode (two-step|flat|curation|promote-trace), --trace-id, --shape (single|multi-turn|rag)
  - Step 1b Mode Dispatch routing each mode to its generation branch
  - Mode-conditional Step 6 summary output (source trace, intermediate artifacts, deletions confirmed)
  - User-facing CLI surface reaching DSET-01..08 subagent content
affects: [40-coverage-and-curation, 42-results-analyzer-slice, downstream phases consuming dataset-generator outputs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mode dispatch sits BETWEEN Step 1 (Capture Input) and Step 2 (Clarifications) so mode-specific skips (promote-trace bypasses 2-4, curation bypasses 2) are expressed declaratively rather than scattered through each step"
    - "Flag validation + STOP message pattern for --trace-id precondition (Phase 39 DSET-08): explicit error text before any MCP call"
    - "Mode-conditional Step 6 summary blocks: append additional lines keyed on MODE instead of branching entire Summary block — keeps default flat-mode output byte-stable"

key-files:
  created: []
  modified:
    - orq-agent/commands/datasets.md  # +77/-6 lines; argument-hint, Step 0 parser, Step 1b Mode Dispatch, Step 5 Input items 7+8, Step 6 mode-conditional summary, Constraints appended 2 rules

key-decisions:
  - "datasets.md <pipeline> block is editable (NOT in the 3-file protected list — only orq-agent.md/prompt.md/architect.md are SHA-256 guarded per Phase 34 invariant); Step 1b added inline inside <pipeline> without triggering protected-pipeline check"
  - "Mode-dispatch lives in a dedicated Step 1b section rather than sprinkled as conditionals across Steps 2-5 — one LLM-readable decision point, grep-anchorable (Step 1b: Mode Dispatch)"
  - "--mode promote-trace precondition (--trace-id required) enforced at Step 0 parse time AND re-stated defensively in Step 1b — double guard per DSET-08 ALWAYS constraint"
  - "SHAPE is always passed to subagent (even in flat mode, default single) — single uniform contract instead of optional-when-non-default"
  - "Mode-conditional Step 6 output uses additive lines (append-on-mode) not branch-replacement — keeps flat-mode byte-stable and makes new modes visible as pure additions"

patterns-established:
  - "Flag-dispatch-in-Step-1b pattern: when a slash command grows from 1 mode to N modes, insert a dispatch step between input capture and clarification so each mode's skip/add semantics are declared in one place rather than scattered"
  - "DSET-08 trace-promotion contract: input + output + intermediate_steps + metadata (session_id, user_id, customer_id, identity) preserved verbatim; file path template `trace-promoted-{TRACE_ID}.md`"

requirements-completed: [DSET-01, DSET-02, DSET-03, DSET-04, DSET-05, DSET-06, DSET-07, DSET-08]

# Metrics
duration: 2 min
completed: 2026-04-21
---

# Phase 39 Plan 02: datasets.md CLI Mode Dispatch Summary

**Extended `/orq-agent:datasets` slash command with `--mode {two-step|flat|curation|promote-trace}`, `--trace-id <id>`, and `--shape {single|multi-turn|rag}` flags + a new Step 1b Mode Dispatch section routing each mode to its branch, unlocking the DSET-01..08 subagent surface without breaking V2.0 flat-mode behavior or the 3-file protected-pipeline SHA-256 guard.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T04:44:33Z
- **Completed:** 2026-04-21T04:46:32Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- `argument-hint` updated to expose all 4 flags to Claude Code slash-command UX.
- Step 0 flag parser extended with `--mode`, `--trace-id`, `--shape` (full accepted-value tables, defaults, STOP-on-missing for promote-trace).
- New Step 1b Mode Dispatch section added between Step 1 and Step 2, declaring the skip/add semantics for all four modes (promote-trace skips 2-4, curation skips 2 + requires existing dataset positional, two-step emits dimensions.md + tuples.md intermediate artifacts, flat unchanged V2.0 behavior).
- Step 5 subagent Input list extended with items 7 (Mode) and 8 (Shape).
- Step 6 Summary block now emits mode-conditional lines (source trace + preserved fields, intermediate artifact paths, deletions confirmed count).
- Constraints block appended two ALWAYS rules enforcing DSET-08 precondition (trace-id validation + input/output/intermediate_steps/metadata preservation).
- All 9 SKST section headings remain intact.
- Protected pipelines SHA-256 3/3 untouched.

## Task Commits

1. **Task 1: Add --mode / --trace-id / --shape flags + dispatch** — `c69f193` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `orq-agent/commands/datasets.md` — +77/-6 lines. Added argument-hint flags, Step 0 parser extensions (with 3 new flag definitions + 2 parsing rules + 6 examples), new Step 1b Mode Dispatch section (4 mode branches documented), Step 5 Input items 7 (Mode) + 8 (Shape), Step 6 mode-conditional output blocks, Constraints block +2 ALWAYS rules (DSET-08 validation + preservation).

## Verification Evidence

All 9 grep anchors + 2 script checks PASS:

```
A1 --mode two-step       ok
A2 --mode curation       ok
A3 --mode promote-trace  ok
A4 --trace-id            ok
A5 --shape single        ok
A6 --shape multi-turn    ok
A7 --shape rag           ok
A8 Step 1b: Mode Dispatch ok
A9 intermediate_steps    ok
bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/datasets.md → exit 0 (silent-on-success)
bash orq-agent/scripts/check-protected-pipelines.sh → 3/3 SHA-256 matches (orq-agent.sha256, prompt.sha256, architect.sha256)
```

## Decisions Made

- **datasets.md `<pipeline>` is NOT in the 3-file protected list** — Phase 34 invariant restricts SHA-256 guard to `orq-agent.md`, `prompt.md`, `architect.md` only. This means Step 1b could be added INSIDE the existing `<pipeline>...</pipeline>` block rather than as a separate pre-body section, preserving the natural Step-numbered reading flow.
- **Mode dispatch as a dedicated Step 1b** rather than N conditionals sprinkled across Steps 2-5 — one grep-anchorable decision point, one LLM-readable section, skip/add semantics declared once per mode.
- **DSET-08 precondition double-guarded** — `--trace-id` requirement enforced at Step 0 parse time AND re-stated in Step 1b promote-trace branch; aligns with new ALWAYS Constraint that forbids any MCP call without trace-id.
- **SHAPE always passed to subagent** (even in flat/default single) — single uniform subagent contract rather than optional-when-non-default.
- **Step 6 mode-conditional output is additive** — base completion block prints unchanged; mode-specific lines append AFTER. Keeps flat-mode byte-stable and makes each future mode visible as a pure-addition diff.

## Deviations from Plan

None - plan executed exactly as written. One micro-correction during verification: initial grep anchors `--shape single`, `--shape rag` required explicit literal example phrases in the file (the `argument-hint` renders them as the alternation `single|multi-turn|rag` which doesn't match the literal `--shape single` grep). Added 2 extra Step 0 Examples to ground each shape value with a concrete invocation, which also improved documentation quality. Not classified as a deviation — the plan's own `<acceptance_criteria>` required these 9 grep anchors to pass, so supplying literal anchors is satisfying spec, not deviating from it.

## Issues Encountered

None.

## Self-Check: PASSED

- File exists: `orq-agent/commands/datasets.md` (modified) — FOUND
- File exists: `.planning/phases/39-dataset-generator-enhancements/39-02-SUMMARY.md` — FOUND (this file)
- Commit exists: `c69f193` — FOUND via `git log --oneline`
- 9/9 grep anchors PASS
- `lint-skills.sh --file` exits 0
- `check-protected-pipelines.sh` exits 0 (3/3 SHA-256 matches)
- All 9 SKST headings remain intact

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 unlocks the CLI surface for the dataset-generator subagent enhancements (Plan 01); users can now invoke `/orq-agent:datasets --mode two-step`, `--mode curation`, `--mode promote-trace --trace-id <id>`, and `--shape multi-turn|rag`.
- Ready for Plan 03 (if any) in Phase 39, or `/gsd:verify-work 39` once all Phase 39 plans close.
- Phase 34 protected-pipeline invariant preserved — `orq-agent.md`, `prompt.md`, `architect.md` SHA-256 3/3 unchanged.
- Phase 35 MSEL-02 invariant preserved — datasets.md emits no `model:` YAML lines, so snapshot-pinned-models rule is trivially clean.

---
*Phase: 39-dataset-generator-enhancements*
*Completed: 2026-04-21*
