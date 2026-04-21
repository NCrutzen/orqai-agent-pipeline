---
phase: 38-trace-failure-analysis-skill
plan: 03
subsystem: skill-suite-index-wiring
tags: [index-wiring, skill-discovery, trace-failure-analysis, TFAIL, pipeline-order]
one-liner: "Wired Phase 38 trace-failure-analysis skill into the suite's discovery surfaces (SKILL.md + help.md + traces.md) with additive edits; protected pipelines untouched"
dependency-graph:
  requires:
    - 38-01 (skill body at commands/trace-failure-analysis.md)
    - 38-02 (resources/ subdir: grounded-theory-methodology / failure-mode-classification / handoff-matrix)
  provides:
    - Phase 38 H3 in SKILL.md Commands block
    - TFAIL-01..06 coverage bullet block under SKILL.md
    - resources/ directory listing in SKILL.md Directory Structure
    - /orq-agent:trace-failure-analysis entry in help.md Commands block (pipeline-order)
    - Live forward-handoff from /orq-agent:traces → /orq-agent:trace-failure-analysis
    - Resources Policy migration-status update (2nd live per-skill resources/ dir)
  affects:
    - orq-agent/SKILL.md
    - orq-agent/commands/help.md
    - orq-agent/commands/traces.md
tech-stack:
  added: []
  patterns:
    - "Index-wiring recipe (from Phase 36/37): touch exactly SKILL.md + help.md; never orq-agent.md/prompt.md/architect.md"
    - "Pipeline-order in help.md: diagnose-before-fix (observability → trace-failure-analysis → automations)"
    - "Forward-handoff resolution: TODO(TFAIL) placeholder → live /orq-agent:trace-failure-analysis link"
key-files:
  created: []
  modified:
    - orq-agent/SKILL.md
    - orq-agent/commands/help.md
    - orq-agent/commands/traces.md
decisions:
  - "Slot /orq-agent:trace-failure-analysis in help.md between /orq-agent:observability and /orq-agent:automations — diagnose-before-fix ordering (instrument → analyze → automate)"
  - "Resources Policy migration-status paragraph appended (not rewritten) — preserves Phase 37 precedent reference and extends the pattern to a 2nd live per-skill resources/ dir"
  - "TODO(TFAIL) eradication scoped to traces.md only in this plan; other TODO(TFAIL) markers (observability.md) remain for their owning phase to resolve — prevents cross-phase scope creep"
metrics:
  duration: ~3 min
  tasks_completed: 1
  files_modified: 3
  commit_hash: 5bcf181
  completed_date: 2026-04-21
---

# Phase 38 Plan 03: Skill Suite Index-Wiring Summary

## One-liner

Phase 38 skill is now discoverable: SKILL.md indexes it with Phase 38 H3 + coverage block + resources/ dir listing; help.md lists it in pipeline-order between observability and automations; traces.md has a live forward-handoff replacing the `TODO(TFAIL)` placeholder. Three files edited additively; protected pipelines untouched (3/3 SHA-256 matches).

## Files Modified

1. **`orq-agent/SKILL.md`** (3 additive edits):
   - Directory Structure block: added `trace-failure-analysis.md` + `trace-failure-analysis/resources/` with 3 resource files under `commands/` (right after `observability/resources/generic-otel.md`).
   - New `### Phase 38 (Trace Failure Analysis)` H3 inserted directly after the Phase 37 observability coverage block — includes command table row (tier: deploy+) + 6-bullet TFAIL-01..06 requirement coverage block + single-consumer resources pointer.
   - Resources Policy migration-status paragraph extended: "Phase 38 adds a second at `orq-agent/commands/trace-failure-analysis/resources/` (3 files ... consumed only by `trace-failure-analysis.md`)". Phase 37 wording preserved verbatim.

2. **`orq-agent/commands/help.md`** (1 line inserted):
   - New line `  /orq-agent:trace-failure-analysis  Grounded-theory failure taxonomy from ~100 traces (deploy+ tier)` placed between `/orq-agent:observability` and `/orq-agent:automations`. Pipeline-order invariant confirmed via awk line-number check (obs=88 < tfa=89 < aut=90).

3. **`orq-agent/commands/traces.md`** (1 line replaced):
   - Companion Skills forward-handoff line updated from `Phase 38 trace-failure analysis skill (forward link TODO(TFAIL))` placeholder → live `/orq-agent:trace-failure-analysis` link with grounded-theory handoff description.

## Acceptance Criteria — all PASS

```
=== SKILL.md anchors ===
OK: trace-failure-analysis.md
OK: Phase 38 H3
OK: command ref
OK: TFAIL-01
OK: TFAIL-06
OK: grounded-theory
OK: failure-mode
OK: handoff-matrix
=== help.md pipeline-order ===
OK: help.md line
OK: order obs<tfa<aut (88<89<90)
=== traces.md ===
OK: traces.md fwd link
OK: TODO(TFAIL) removed
=== protected pipelines ===
OK: orq-agent.sha256 matches
OK: prompt.sha256 matches
OK: architect.sha256 matches
=== lint ===
(silent-on-success)
=== ALL CHECKS PASSED ===
```

## Pipeline-order Position Confirmed

help.md Commands block order (relevant excerpt):
```
/orq-agent:observability           (line 88)
/orq-agent:trace-failure-analysis  (line 89)  ← new
/orq-agent:automations             (line 90)
```

Mental model: **instrument (observability) → analyze (trace-failure-analysis) → automate (automations)**. Diagnose-before-fix.

## Protected Pipelines — 3/3 intact

- `orq-agent/commands/orq-agent.md` — NOT touched; SHA-256 matches baseline.
- `orq-agent/commands/prompt.md` — NOT touched; SHA-256 matches baseline.
- `orq-agent/commands/architect.md` — NOT touched; SHA-256 matches baseline.

`bash orq-agent/scripts/check-protected-pipelines.sh` exits 0.

## Lint — full-suite green

`bash orq-agent/scripts/lint-skills.sh` exits 0 (silent-on-success). No new skill files added (only edits to existing index + discovery surfaces); no new resources (all 3 resources/ files were shipped in Plan 02).

## Deferred Items

- **`TODO(TFAIL)` in `commands/observability.md`** — NOT resolved in this plan. That marker (Companion Skills forward handoff) is scoped to Phase 37 observability surface; resolving it here would violate phase-scope boundaries. It will be resolved when Phase 37's follow-up maintenance or a later sweep phase chooses to wire observability → trace-failure-analysis directly. Confirmed via `grep -rn "TODO(TFAIL)" orq-agent/` — only the observability.md reference remains; traces.md is clean.

## Deviations from Plan

None — plan executed exactly as written. All 3 edits applied verbatim per plan spec; all acceptance-criteria grep/awk/lint/protected-hash checks pass.

## Commits

- `5bcf181` — chore(38-03): index-wire trace-failure-analysis skill into SKILL.md + help.md + traces.md

## Self-Check: PASSED

Verified:
- `.planning/phases/38-trace-failure-analysis-skill/38-03-SUMMARY.md` exists (this file)
- Commit `5bcf181` exists in git log
- All 3 modified files contain expected anchors
- Protected pipeline 3/3 SHA-256 matches
- Full-suite lint exits 0
