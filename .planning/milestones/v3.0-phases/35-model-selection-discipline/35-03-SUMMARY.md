---
phase: 35-model-selection-discipline
plan: 03
subsystem: agents
tags: [spec-generator, msel-02, msel-03, snapshot-pinning, cascade, skst, lint]

# Dependency graph
requires:
  - phase: 35-model-selection-discipline
    provides: Plan 01 snapshot-pinned-models lint rule (regex + CLI contract) that Plan 03 mirrors at emission time inside spec-generator.md
  - phase: 34-skill-structure-format-foundation
    provides: 9-section SKST structure + lint-skills.sh harness + protected-pipelines guard
provides:
  - "spec-generator.md #### Snapshot Pinning Rule (MSEL-02) subsection with embedded `(-latest|:latest|-beta)$` self-check regex (identical to lint-skills.sh rule)"
  - "spec-generator.md #### Cascade Block Emission (MSEL-03) subsection consuming `cascade-candidate: true` from research brief, rendering quality_equivalence_experiment template inline"
  - "Embedding/speech alias exception documented with exact comment shape `# alias-only -- pinning unavailable <YYYY-MM-DD>`"
  - "Pre-Output Validation checklist gains per-line snapshot-pin self-check bullet"
  - "Dated-snapshot illustrative examples replace floating-alias examples in ### Model section"
affects: [35-04-model-catalog-capable-tier, 35-05-verification-sweep, 42-evaluator-validation (quality-equivalence experiment runtime)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Emission-time + review-time double-guard: same regex embedded in subagent self-check AND in lint-skills.sh rule → violations rare at emission, caught at review"
    - "Alias-only exception convention (`# alias-only -- pinning unavailable <YYYY-MM-DD>`) allows future opt-in for embedding/speech models without weakening the regex"
    - "Cascade block template with inline quality_equivalence_experiment keys — Phase 35 text policy, Phase 42 runtime execution"

key-files:
  created: []
  modified:
    - "orq-agent/agents/spec-generator.md (+58 lines / −2 lines; inserts two #### subsections inside ### Model, updates Constraints bullet, adds Pre-Output Validation checklist item, replaces example IDs with dated snapshots)"

key-decisions:
  - "Embed the lint regex verbatim in spec-generator.md rather than paraphrase it — same contract, same rejection shape, zero drift risk"
  - "Place Snapshot Pinning + Cascade Emission as H4 subsections under the existing ### Model H3 — keeps pinning next to format guidance so the LLM sees both together"
  - "Illustrative examples in ### Model updated to dated snapshots (`claude-sonnet-4-5-20250929`, `gpt-4o-2024-11-20`) — gemini-2.5-pro stays as-is (Google uses semver not dated snapshots, does not match the floating-suffix regex)"
  - "Cascade block uses YAML placeholder `provider/cheap-model-DATED-SNAPSHOT` — literal `DATED-SNAPSHOT` string is a generation-time marker that triggers the self-check, not a lint-time violation"

patterns-established:
  - "Forward-reference from Constraints bullet to in-body subsection (`See #### Snapshot Pinning Rule (MSEL-02) subsection in ### Model above`) — keeps Constraints scannable while letting full rule live at emission context"
  - "Pre-Output Validation checklist + in-body emission rule + lint rule = three-layer defense for any hard-to-catch emission policy"

requirements-completed: [MSEL-02]

# Metrics
duration: 2min
completed: 2026-04-20
---

# Phase 35 Plan 03: spec-generator.md Model Pinning + Cascade Emission Summary

**Spec-generator now enforces MSEL-02 snapshot-pinning (regex self-check identical to lint-skills.sh) and consumes MSEL-03 `cascade-candidate: true` tags by rendering a quality_equivalence_experiment cascade block inline**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-20T15:19:33Z
- **Completed:** 2026-04-20T15:21:08Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Inserted `#### Snapshot Pinning Rule (MSEL-02)` at line 325 of `orq-agent/agents/spec-generator.md` with the verbatim lint regex `model:[[:space:]]*[^[:space:]]+(-latest|:latest|-beta)[[:space:]]*$` in a bash fenced block, self-check procedure, and embedding/speech alias exception.
- Inserted `#### Cascade Block Emission (MSEL-03)` at line 355 with a YAML cascade template containing `primary_cheap`, `escalation_capable`, `trigger`, and `quality_equivalence_experiment` keys — consumes `cascade-candidate: true` from research-brief output.
- Replaced floating-alias illustrative examples on line 323 with dated-snapshot equivalents (`claude-sonnet-4-5-20250929`, `gpt-4o-2024-11-20`).
- Added Pre-Output Validation checklist bullet at line 657 enforcing per-line snapshot-pin self-check with the alias-only exception reminder.
- Updated Constraints bullet at line 955 with a forward-reference to the new Model subsection.
- All 9 SKST sections still intact; `tools: Read, Glob, Grep` frontmatter and `<files_to_read>` block unchanged (grep count = 1 each).

## Task Commits

Each task was committed atomically:

1. **Task 1: Insert Snapshot Pinning + Cascade Emission subsections** - `b1f7ba7` (feat)

**Plan metadata:** _(set in final commit after SUMMARY + STATE + ROADMAP updates)_

## Files Created/Modified

- `orq-agent/agents/spec-generator.md` — +58 / −2. Four discrete changes: (1) line 323 example IDs now dated; (2) new `#### Snapshot Pinning Rule (MSEL-02)` subsection lines 325-353; (3) new `#### Cascade Block Emission (MSEL-03)` subsection lines 355-378; (4) Pre-Output Validation bullet at line 657; (5) Constraints bullet forward-reference at line 955.

## Verification (captured exit codes)

| Check | Command | Exit |
|-------|---------|------|
| Phrase: snapshot-pinned | `grep -q "snapshot-pinned" orq-agent/agents/spec-generator.md` | 0 |
| Phrase: regex reject | `grep -q "regex reject" orq-agent/agents/spec-generator.md` | 0 |
| Phrase: alias-only -- pinning unavailable | `grep -q "alias-only -- pinning unavailable" orq-agent/agents/spec-generator.md` | 0 |
| Phrase: cascade-candidate | `grep -q "cascade-candidate" orq-agent/agents/spec-generator.md` | 0 |
| Section: `#### Snapshot Pinning Rule (MSEL-02)` | `grep -q "#### Snapshot Pinning Rule (MSEL-02)" …` | 0 |
| Section: `#### Cascade Block Emission (MSEL-03)` | `grep -q "#### Cascade Block Emission (MSEL-03)" …` | 0 |
| Requirement tags MSEL-02 + MSEL-03 present | `grep -q "MSEL-02/03"` | 0 |
| Embedded regex matches lint rule | `grep -q "(-latest\|:latest\|-beta)" …` | 0 |
| Dated-snapshot example present | `grep -q "claude-sonnet-4-5-20250929" …` | 0 |
| Cascade template has experiment key | `grep -q "quality_equivalence_experiment" …` | 0 |
| Frontmatter `tools:` untouched (count=1) | `grep -c "^tools: Read, Glob, Grep$" …` | returns `1` |
| `<files_to_read>` block untouched (count=1) | `grep -c "^<files_to_read>$" …` | returns `1` |
| SKST lint on file | `bash orq-agent/scripts/lint-skills.sh --file orq-agent/agents/spec-generator.md` | 0 |
| Snapshot-pin rule on file | `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models --file orq-agent/agents/spec-generator.md` | 0 |
| Full-suite lint | `bash orq-agent/scripts/lint-skills.sh` | 0 |
| Protected pipelines | `bash orq-agent/scripts/check-protected-pipelines.sh` | 0 (all 3 SHA matches green) |

## Embedded regex ↔ lint regex identity check

| Source | Regex |
|--------|-------|
| `orq-agent/scripts/lint-skills.sh` check_snapshot_pinned_models | `^[[:space:]]*-?[[:space:]]*model:[[:space:]]*[^[:space:]]+(-latest\|:latest\|-beta)[[:space:]]*$` |
| `orq-agent/agents/spec-generator.md` #### Snapshot Pinning Rule | `model:[[:space:]]*[^[:space:]]+(-latest\|:latest\|-beta)[[:space:]]*$` |

The floating-suffix alternation `(-latest\|:latest\|-beta)` is byte-identical across both locations. The lint regex is slightly more permissive on the leading whitespace (it tolerates an optional YAML-list dash prefix `-`) because lint reviews arbitrary file contents; the emission-time self-check runs against draft `model:` lines the LLM is about to emit, which will not have the list-prefix form inside the ### Model guidance itself. Both regexes reject the same three floating suffixes.

## Decisions Made

- **Embed the lint regex verbatim in the subagent prompt** rather than paraphrase — keeping the string byte-comparable with `orq-agent/scripts/lint-skills.sh` is the whole point of the double-guard pattern.
- **Place both H4 subsections inside ### Model** (not as new H3 sections and not in Constraints) — positions pinning + cascade adjacent to the `provider/model-name` format guidance so the LLM reads them as extensions of the Model rule rather than as distant policy footnotes.
- **Use `DATED-SNAPSHOT` as a literal placeholder in the cascade template** — the generator is instructed to substitute real dated snapshots at emission time; the placeholder string itself does NOT match the floating-alias regex (no `-latest`/`:latest`/`-beta` suffix), so it stays lint-clean.
- **Keep `google-ai/gemini-2.5-pro` in the examples list** — Google uses a semver-like (`-2.5-pro`) scheme rather than dated snapshots, and it does not carry any of the three rejected suffixes, so it remains the canonical Google example without violating MSEL-02.

## Deviations from Plan

None — plan executed exactly as written. All four Changes landed verbatim (Change 1 example swap, Change 2 dual-subsection insert, Change 3 Constraints forward-reference, Change 4 Pre-Output checklist bullet). All 14 acceptance-criteria greps and all 4 verification commands exit 0 on the first try. No auto-fixes needed. No architectural decisions surfaced.

## Issues Encountered

- `git status` showed an unrelated pending modification to `orq-agent/agents/researcher.md` (Plan 02 territory, running in parallel wave). Scope boundary honored: staged `orq-agent/agents/spec-generator.md` explicitly via `git add <path>` rather than `git add .` so Plan 03's commit touched only its declared file.

## User Setup Required

None — this plan is pure subagent-prompt documentation; no external services, env vars, or dashboards involved.

## Self-Check: PASSED

Verified post-SUMMARY:
- File `orq-agent/agents/spec-generator.md` exists and contains all four required phrases at the expected line numbers (323, 325, 332, 347, 350, 355, 357, 363, 369, 378, 657, 955 confirmed).
- Commit `b1f7ba7` exists on `main` via `git log --oneline`.
- SUMMARY file will exist at `.planning/phases/35-model-selection-discipline/35-03-SUMMARY.md` after this write completes.

## Next Phase Readiness

- Wave 2 remaining: Plan 04 (Capable Tier table in `orq-agent/references/orqai-model-catalog.md`). Plan 03 + Plan 02 together cover the researcher → spec-generator text-policy chain; Plan 04 seeds the lookup table researcher will reference.
- Plan 05 runs phase-close verification sweep and writes `35-VERIFICATION.md`.
- Downstream handoff: **Plan 04 (catalog Capable Tier table) finishes Wave 2; Plan 05 runs full verification + writes VERIFICATION.md.**

---
*Phase: 35-model-selection-discipline*
*Completed: 2026-04-20*
