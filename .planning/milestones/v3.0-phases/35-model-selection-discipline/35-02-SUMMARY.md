---
phase: 35-model-selection-discipline
plan: 02
subsystem: skill-policy
tags: [model-selection, msel-01, msel-03, capable-first, cascade, quality-equivalence, researcher, skst]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: 9 SKST sections + lint-skills.sh enforcement — every skill edit in V3.0 must preserve these
  - phase: 35-model-selection-discipline
    provides: Plan 01 — snapshot-pinned-models lint rule (MSEL-02 mechanical enforcement)
provides:
  - Researcher subagent enforces capable-first recommendation ordering (MSEL-01)
  - Budget alternatives are labeled `after quality baseline run` (MSEL-01)
  - Researcher emits `cascade-candidate: true/false` tag for spec-generator to act on (MSEL-03)
  - Every cascade proposal includes a `quality-equivalence experiment` step and ships as `approved: false`
  - Capable Tier Lookup forward-reference to `orq-agent/references/orqai-model-catalog.md §Capable Tier Lookup` (table arrives in Plan 04)
affects:
  - 35-03 spec-generator snapshot pinning — reads the `cascade-candidate` tag and emits cascade block accordingly
  - 35-04 orqai-model-catalog.md — delivers the Capable Tier Lookup table this section forward-references
  - 35-05 verification sweep — captures full-suite evidence for the researcher policy
  - Phase 42 EVLD — runtime evaluator wiring flips `approved: false` → `true` after the quality-equivalence experiment

# Tech tracking
tech-stack:
  added: []
  patterns:
    - capable-first recommendation ordering as a text rule inside the researcher subagent (no runtime code change)
    - cascade-candidate tag as the researcher→spec-generator handoff contract (MSEL-03)
    - quality-equivalence experiment documented inline in the researcher output (Phase 42 wires the runtime)
    - grep-verifiable verbatim phrases serving as lint anchors for policy drift detection

key-files:
  created: []
  modified:
    - orq-agent/agents/researcher.md

key-decisions:
  - "Model Selection Policy H2 placed after Knowledge Base Design Training Knowledge and before Output Format — policy precedes the output shape so the generated recommendation structure reflects the policy"
  - "Budget alternatives carry the verbatim string `after quality baseline run` as the MSEL-01 tag — grep-verifiable anchor for lint/QA drift detection"
  - "Cascade default state is `approved: false` until Phase 42 runtime completes the quality-equivalence experiment — prevents untested cascades from shipping as approved"
  - "Quality-equivalence experiment default tolerance is 5 percentage points Pass-rate delta (user-overridable) — concrete number avoids ambiguity in downstream spec-generator instructions"
  - "Constraints bullet reinforced with inline pointers to cascade-candidate + after-quality-baseline-run + quality-equivalence experiment — SKST section stays intact while the top-level Policy section holds the full protocol"

patterns-established:
  - "Grep-anchored verbatim phrases: `capable-first`, `after quality baseline run`, `cascade-candidate`, `quality-equivalence experiment` — any future edit that removes one breaks lint-style verification"
  - "Forward-reference to later-plan-delivered catalog tables (Plan 04 Capable Tier Lookup) — acceptable within a single phase wave"
  - "Researcher subagent owns recommendation ORDERING + CASCADE DISCIPLINE; spec-generator owns PINNING — clean separation of concerns across MSEL-01/02/03"

requirements-completed: [MSEL-01, MSEL-03]

# Metrics
duration: 2 min
completed: 2026-04-20
---

# Phase 35 Plan 02: Researcher Capable-First Policy Summary

**Researcher subagent now enforces capable-first recommendation ordering (MSEL-01) and cascade-aware emission with a mandatory quality-equivalence experiment gate (MSEL-03), with all 9 SKST sections intact and zero floating-alias model IDs introduced.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-20T15:19:24Z
- **Completed:** 2026-04-20T15:21:21Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Inserted a new `## Model Selection Policy` H2 section into `orq-agent/agents/researcher.md` between `## Knowledge Base Design Training Knowledge` and `## Output Format` — policy precedes the output shape so the generated recommendation structure reflects the policy from first principles.
- Policy Rules numbered list codifies MSEL-01 (capable-first ordering + `after quality baseline run` alternative tag) and MSEL-03 (`cascade-candidate` flag + mandatory `quality-equivalence experiment` step with `approved: false` default).
- Capable Tier Lookup subsection forward-references `orq-agent/references/orqai-model-catalog.md §Capable Tier Lookup` (table arrives in Plan 04) and mandates live validation via the MCP `models-list` tool.
- Cascade Pattern subsection documents both the cascade-candidate emission shape (cheap primary + capable escalation + trigger + quality-equivalence experiment block) and the non-cascade shape (single capable-tier Primary + alternatives tagged `after quality baseline run`).
- Reinforced the existing Constraints bullet with inline pointers to `cascade-candidate`, `after quality baseline run`, and `quality-equivalence experiment` — the SKST Constraints section points into the new Model Selection Policy section for the full protocol without breaking SKST invariants.
- All four required verbatim phrases grep-verifiable and every phrase anchored in at least 3 distinct locations in the file (first-mention, inline-in-policy, emission-template, Constraints cross-reference).

## Task Commits

Each task was committed atomically:

1. **Task 1: Insert Model Selection Policy section into researcher.md (MSEL-01 + MSEL-03)** — `1539abf` (feat)

## Files Created/Modified

- `orq-agent/agents/researcher.md` — added `## Model Selection Policy` H2 section (64 insertions, 1 replacement) covering Policy Rules, Capable Tier Lookup, Cascade Pattern (cascade + non-cascade templates), Why this policy; reinforced existing Constraints bullet with cross-reference to the new section.

## Verification Evidence

### Required Verbatim Phrases (grep-verified)

| Phrase | Exit code | First line |
|---|---|---|
| `capable-first` | 0 | L125 (HTML comment banner) |
| `after quality baseline run` | 0 | L136 (Policy Rule 2) |
| `cascade-candidate` | 0 | L125 (HTML comment banner) |
| `quality-equivalence experiment` | 0 | L140 (Policy Rule 4) |

### Additional Acceptance Criteria (grep-verified)

| Criterion | Exit code |
|---|---|
| `grep -q "## Model Selection Policy"` | 0 |
| `grep -q "MSEL-01"` | 0 |
| `grep -q "MSEL-03"` | 0 |
| `grep -q "Capable Tier Lookup"` | 0 |
| `grep -q "approved: false"` | 0 |
| `grep -c "^tools: Read, Glob, Grep, WebSearch, WebFetch$"` → 1 | 0 |
| `grep -c "^<files_to_read>$"` → 1 | 0 |

### Lint + Pipeline Checks

| Check | Command | Exit code |
|---|---|---|
| SKST (file-scoped) | `bash orq-agent/scripts/lint-skills.sh --file orq-agent/agents/researcher.md` | 0 |
| Snapshot pin rule (file-scoped) | `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models --file orq-agent/agents/researcher.md` | 0 |
| Full-suite lint | `bash orq-agent/scripts/lint-skills.sh` | 0 |
| Protected pipelines | `bash orq-agent/scripts/check-protected-pipelines.sh` | 0 (all 3 SHA-256 matches) |

### Frontmatter + `<files_to_read>` Invariants

- `tools: Read, Glob, Grep, WebSearch, WebFetch` — present exactly once, unchanged.
- `<files_to_read>` opening tag — present exactly once, unchanged.
- `name: orq-researcher`, `model: inherit` — untouched.

## Decisions Made

- **Policy Rules numbered list chosen over prose paragraphs** — numbered rules map cleanly to MSEL-01 (rules 1+2) and MSEL-03 (rules 3+4), and survive future partial edits better than flowing prose.
- **Cascade cheap/capable terminology used instead of primary/secondary** — matches existing agent-catalog vocabulary and reduces reader overhead when the cascade block renders in generated specs.
- **Default tolerance 5 percentage points Pass-rate delta** — concrete number prevents vague downstream instructions; user can override during discussion. Alternative considered: leave tolerance user-mandatory with no default, rejected because first-run users need a working baseline.
- **Constraints bullet reinforced by reference rather than expanded inline** — keeps the SKST Constraints section compact (Phase 34 invariant) while the Policy section owns the full protocol. Anti-duplication per SKST-07.

## Deviations from Plan

None — plan executed exactly as written. Every task step matched the plan's `<action>` block verbatim, including the precise insertion anchor (`between ### Embedding Model Constraint` and `## Output Format`), the Constraints bullet replacement text, and the four grep-anchored verbatim phrases.

## Issues Encountered

**Parallel-execution staging surprise (benign, resolved by design).** After completing the researcher.md edit and running lint/pipeline checks, `git status` showed `orq-agent/agents/spec-generator.md` as modified even though this plan does not touch that file. Investigation showed the Plan 03 executor (same Wave 2) was running concurrently and had already begun editing spec-generator.md. This is exactly the parallel_safety contract in action (disjoint file sets per plan). Resolution: used `git add orq-agent/agents/researcher.md` (single-file, as prescribed by the task commit protocol) instead of `git add -A`, so the task commit contains only this plan's file. Plan 03's in-flight edits to spec-generator.md remain in its own working tree for its own executor to commit. No cross-contamination.

## User Setup Required

None — this plan is a pure skill-policy edit inside `orq-agent/agents/researcher.md`. No external services, env vars, or manual dashboard steps.

## Next Phase Readiness

- **Plan 03 (spec-generator snapshot pinning)** can now run in parallel within Wave 2. It reads the `cascade-candidate` tag this plan introduced and emits the cascade block with snapshot-pinned `model:` lines (MSEL-02).
- **Plan 04 (capable-tier catalog table)** can now run in parallel within Wave 2. It delivers the `§Capable Tier Lookup` table this plan forward-references.
- **Plan 05 (verification sweep)** will capture the full-suite evidence (all 3 Wave 2 files, all 4 MSEL-01/02/03 requirements, full-suite lint + protected-pipelines + snapshot-pinned-models rule across the whole skill set).
- **Phase 42 (Evaluator Validation)** will wire the runtime that flips `approved: false` → `true` for cascade proposals after the quality-equivalence experiment produces a measurable Pass-rate delta.

## Self-Check: PASSED

- File `orq-agent/agents/researcher.md` exists on disk: FOUND
- Commit `1539abf` in git log: FOUND (`feat(35-02): add capable-first, cascade-aware Model Selection Policy to researcher.md`)
- All 4 required verbatim phrases grep-present: VERIFIED (see Verification Evidence table above)
- All 9 SKST sections intact: VERIFIED (`lint-skills.sh --file` exit 0)
- No floating-alias model IDs introduced: VERIFIED (`lint-skills.sh --rule snapshot-pinned-models --file` exit 0)
- Protected pipelines untouched: VERIFIED (`check-protected-pipelines.sh` exit 0, all 3 SHA-256 matches)

---
*Phase: 35-model-selection-discipline*
*Completed: 2026-04-20*
