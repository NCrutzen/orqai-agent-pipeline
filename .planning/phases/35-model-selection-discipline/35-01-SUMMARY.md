---
phase: 35-model-selection-discipline
plan: 01
subsystem: testing
tags: [bash, grep, lint, skill-structure, model-selection, msel]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: orq-agent/scripts/lint-skills.sh (extensible rule framework with 4 rules and case-dispatched --rule flag)
provides:
  - New lint rule `snapshot-pinned-models` enforcing dated-snapshot model IDs across 33 default-set skill files
  - Regex-based grep check that rejects `-latest`, `:latest`, `-beta` suffixes on any `model:` line
  - Two out-of-band fixtures (`tests/fixtures/35-bad-pin.md`, `tests/fixtures/35-good-pin.md`) proving both exit paths
  - Inline documentation of the embedding/speech alias exception and MSEL-02 traceability tag
affects: [35-02 researcher policy, 35-03 spec-generator policy, 35-04 catalog update, 35-05 full-suite verification, 36+ all future skill edits that emit model: lines]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extensible rule framework — add a rule by editing 5 coordinated points (usage, function, run_rule_on_file, run_rule_on_default_set, lint_file_all_rules)"
    - "Out-of-band fixtures under tests/fixtures/ stay outside default_file_set() so full-suite runs remain green"
    - "Requirement-ID traceability inline — grep `MSEL-02` in the script to locate the rule"

key-files:
  created:
    - tests/fixtures/35-bad-pin.md
    - tests/fixtures/35-good-pin.md
  modified:
    - orq-agent/scripts/lint-skills.sh

key-decisions:
  - "Extend existing lint-skills.sh with a fifth rule rather than creating a separate lint-model-pins.sh script — simpler, keeps one CI entry point, matches 35-CONTEXT.md §decisions 'whichever is simpler'"
  - "Fixtures live under tests/fixtures/ outside the default file set to prove both exit paths without contaminating the full-suite green baseline"
  - "YAGNI on allow-list for embedding/speech alias exception — no such model currently appears in any skill file; documented inline as a bash comment so audit trail stays clean when one surfaces"
  - "Regex anchors to end-of-line with optional trailing whitespace so YAML list entries (`- model: foo-latest`) and plain mappings both match"

patterns-established:
  - "Lateral lint enforcement — per-file lint invocation after each plan commit is the feedback-sampling contract for all V3.0 phases (established in 34-05 VERIFICATION.md, now tooled for MSEL-02 here)"
  - "Task-level TDD for lint rules — RED = confirm 'Unknown rule' exit before editing, GREEN = wire + run fixture roundtrip, no REFACTOR needed for a regex"

requirements-completed: [MSEL-02]

# Metrics
duration: 2min
completed: 2026-04-20
---

# Phase 35 Plan 01: Linter — Snapshot-pinned Model Rule Summary

**New `snapshot-pinned-models` lint rule in `orq-agent/scripts/lint-skills.sh` (regex `model:[[:space:]]*[^[:space:]]+(-latest|:latest|-beta)[[:space:]]*$`) that mechanically enforces MSEL-02 dated-snapshot pinning across 33 skill files, with out-of-band fixtures proving both exit paths.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-20T15:13:45Z
- **Completed:** 2026-04-20T15:15:53Z
- **Tasks:** 2 (2 atomic commits)
- **Files modified:** 3 (1 script + 2 new fixtures)

## Accomplishments

- Extended `orq-agent/scripts/lint-skills.sh` with a fifth rule `snapshot-pinned-models` wired into all 5 rule-registration points (usage heredoc, check function, `run_rule_on_file`, `run_rule_on_default_set`, `lint_file_all_rules`).
- Regex rejects `-latest`, `:latest`, `-beta` suffixes on any `model:` line (anchored, whitespace-tolerant, handles both YAML mapping and list-item shapes).
- Created two minimal fixture files under `tests/fixtures/` that drive rule-level contract tests: negative (`openai/gpt-4o-latest` → exit 1) and positive (`anthropic/claude-sonnet-4-5-20250929` → exit 0).
- Documented the embedding/speech alias exception inline as a bash comment referencing the `# alias-only -- pinning unavailable <date>` convention spec-generator will use in Plan 03.
- Full-suite lint stays green on 33 files, protected pipelines stay byte-identical, all 4 pre-existing rules unaffected.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Wave 0 fixtures for snapshot-pinning rule** — `c9a6bbf` (test)
2. **Task 2: Extend lint-skills.sh with snapshot-pinned-models rule** — `71e1877` (feat)

**Plan metadata:** pending (final commit after this SUMMARY)

## Files Created/Modified

- `tests/fixtures/35-bad-pin.md` — Negative fixture: minimal frontmatter with `model: openai/gpt-4o-latest` (lives outside default_file_set)
- `tests/fixtures/35-good-pin.md` — Positive fixture: minimal frontmatter with `model: anthropic/claude-sonnet-4-5-20250929`
- `orq-agent/scripts/lint-skills.sh` — Added `check_snapshot_pinned_models` function, registered rule in 5 integration points, documented MSEL-02 traceability and alias exception inline

## Exact Regex Embedded

```
^[[:space:]]*-?[[:space:]]*model:[[:space:]]*[^[:space:]]+(-latest|:latest|-beta)[[:space:]]*$
```

Invoked via `grep -nE` so the FAIL message includes the offending line number (e.g., `tests/fixtures/35-bad-pin.md:5`). The leading `-?` tolerates YAML-list notation (`- model: foo-latest`) though the default set uses plain mappings today.

## Captured Exit Codes

Full Wave 1 verification sweep (all 6 commands executed post-Task-2):

| # | Command | Expected | Actual |
|---|---------|----------|--------|
| 1 | `bash orq-agent/scripts/lint-skills.sh` | 0 | **0** |
| 2 | `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models` | 0 | **0** |
| 3 | `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models --file tests/fixtures/35-good-pin.md` | 0 | **0** |
| 4 | `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models --file tests/fixtures/35-bad-pin.md` | 1 | **1** (intentional FAIL, emitted `FAIL: tests/fixtures/35-bad-pin.md:5 — floating-alias model ID ... [MSEL-02]`) |
| 5 | `bash orq-agent/scripts/check-protected-pipelines.sh` | 0 | **0** (orq-agent + prompt + architect SHA-256 matches) |
| 6 | 4 pre-existing per-rule invocations (`allowed-tools`, `tools-declared`, `required-sections`, `references-multi-consumer`) | all 0 | **all 0** |

## Pre-edit Baseline

```
grep -rnE '^[[:space:]]*-?[[:space:]]*model:[[:space:]]*[^[:space:]]+(-latest|:latest|-beta)[[:space:]]*$' \
  orq-agent/SKILL.md orq-agent/commands orq-agent/agents
# → clean (0 hits)
```

Zero existing floating aliases in the 33-file default set. The rule was introduced into a clean baseline, so the `--rule snapshot-pinned-models` default-set run is green immediately and will stay green throughout Plans 02/03/04 as long as the policy text in `researcher.md` and `spec-generator.md` respects the pinning contract.

## Decisions Made

- **Single script, not a new one.** 35-CONTEXT.md §decisions gave Claude discretion between "extend `lint-skills.sh`" and "new `lint-model-pins.sh`". Extending the existing script keeps one CI entry point and matches the extensible-rule pattern that Plan 34-01 established.
- **Fixtures stay out of `default_file_set()`.** Putting them under `tests/fixtures/` instead of `orq-agent/**/tests/fixtures/` means they cannot be accidentally picked up by the default scanner (which only looks at `SKILL.md`, `commands/*.md`, `agents/*.md`), so the full-suite green baseline stays stable.
- **No allow-list for embedding/speech aliases today.** 35-CONTEXT.md §decisions explicitly said "for Phase 35 we do NOT implement an allow-list". Inline comment + `# alias-only -- pinning unavailable <date>` convention is sufficient audit trail; a future iteration wires a grep-exclude when a concrete alias-only model surfaces in the skill set.
- **Regex supports YAML-list form.** Added optional leading `-?` (YAML list-item dash) in the anchor so the rule remains correct even if a future skill file uses list-of-agents notation. Does not change the current behavior since all existing `model:` lines are plain mappings.

## Deviations from Plan

None — plan executed exactly as written. All 2 tasks completed in the specified order, all 5 edits to `lint-skills.sh` applied verbatim from the plan's action block, all 6 Wave 1 verifications returned expected exit codes on the first run. No auto-fixes triggered (Rules 1-3 did not fire), no architectural escalation needed (Rule 4 did not fire), no auth gates.

## Issues Encountered

None.

## Downstream Handoff

- **Plans 02, 03, 04** can now run `bash orq-agent/scripts/lint-skills.sh --file <edited-file>` after each commit to guarantee no floating alias slips into `researcher.md`, `spec-generator.md`, or the Capable Tier table in `orqai-model-catalog.md`.
- **Plan 05** captures the phase-close full-suite evidence in `35-05-VERIFICATION.md`, following the Phase 34 pattern.
- **Phase 43 DIST** owns the CI wiring; this plan does not touch CI configuration (bash + grep only, zero runtime deps, CI-ready by default).
- **Future phases (36+)** inherit the rule automatically: any new skill file added under `orq-agent/{commands,agents}/*.md` or `orq-agent/SKILL.md` is linted on every run without additional wiring.

## User Setup Required

None — bash + grep only, no runtime dependencies, no external services.

## Next Phase Readiness

- Mechanical enforcement layer for MSEL-02 is live and green.
- Plan 02 (researcher capable-first policy) and Plan 03 (spec-generator snapshot-pinning clause) can proceed immediately; any accidental floating-alias introduction will be caught by `--file` linting after each commit.
- No blockers.

## Self-Check: PASSED

Verified 2026-04-20:

- `tests/fixtures/35-bad-pin.md` — FOUND (20-byte-plus file with `model: openai/gpt-4o-latest`)
- `tests/fixtures/35-good-pin.md` — FOUND (20-byte-plus file with `model: anthropic/claude-sonnet-4-5-20250929`)
- `orq-agent/scripts/lint-skills.sh` — modified (27 insertions, rule wired into all 5 registration points, `snapshot-pinned-models` rule ID appears twice per grep as required)
- Commit `c9a6bbf` — FOUND in git log (test(35-01): add snapshot-pinned-models rule fixtures)
- Commit `71e1877` — FOUND in git log (feat(35-01): add snapshot-pinned-models lint rule (MSEL-02))
- Full-suite lint exit 0 — captured in evidence table
- Protected-pipelines check exit 0 — captured in evidence table

---
*Phase: 35-model-selection-discipline*
*Completed: 2026-04-20*
