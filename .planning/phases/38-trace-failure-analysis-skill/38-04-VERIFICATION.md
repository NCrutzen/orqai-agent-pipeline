---
phase: 38-trace-failure-analysis-skill
plan: 04
status: mechanically-complete
nyquist_compliant: true
verified_at: 2026-04-21T04:31:10Z
---

# Phase 38 — Trace Failure Analysis Skill — Verification

Mechanical verification sweep for Phase 38. All 8 gates green, all 6 TFAIL requirements file-level verified, all 5 ROADMAP success criteria file-level satisfied. Four manual smokes deferred to `/gsd:verify-work 38` per `38-VALIDATION.md` Manual-Only Verifications. This is the 5th consecutive V3.0 phase (34 / 35 / 36 / 37 / 38) to close under the canonical VERIFICATION.md pattern.

## Mechanical Gates

| Gate | Command | Exit | Evidence |
|------|---------|------|----------|
| 1 | `bash orq-agent/scripts/lint-skills.sh` | 0 | Silent-on-success (see Captured Output §1) |
| 2 | `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/trace-failure-analysis.md` | 0 | Silent-on-success (see Captured Output §2) |
| 3 | `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models` | 0 | No MSEL-02 violations (Captured Output §3) |
| 4 | `bash orq-agent/scripts/check-protected-pipelines.sh` | 0 | 3/3 SHA-256 matches (Captured Output §4) |
| 5 | TFAIL anchor grep bundle | 54 matches (≥15) | Every TFAIL-01..06 anchor present (Captured Output §5) |
| 6 | Resources dir file count | 3 | grounded-theory-methodology.md + failure-mode-classification.md + handoff-matrix.md |
| 7 | `/orq-agent:trace-failure-analysis` index references | SKILL.md=2, help.md=1, traces.md=1 (≥1 each) | All 3 discovery surfaces wired |
| 8 | `TODO(TFAIL)` eradicated from `traces.md` | 0 occurrences | Placeholder resolved to live forward-handoff |

## Captured Output

### §1. Full-suite lint

```
=== GATE 1: full lint ===
EXIT=0
```

(empty — silent-on-success green across the full default file set)

### §2. Per-file lint

```
=== GATE 2: per-file ===
EXIT=0
```

(empty — silent-on-success green for `orq-agent/commands/trace-failure-analysis.md`)

### §3. MSEL-02 sweep

```
=== GATE 3: MSEL-02 ===
EXIT=0
```

(empty — silent-on-success; zero `model:` YAML lines with floating aliases across the default set; Phase 35 invariant preserved)

### §4. Protected-pipeline hash check

```
=== GATE 4: protected pipelines ===
OK: orq-agent.sha256 matches
OK: prompt.sha256 matches
OK: architect.sha256 matches
EXIT=0
```

### §5. TFAIL anchor grep

```
=== GATE 5: TFAIL grep anchors ===
54
EXIT=0
```

(54 total matches of the anchor alternation bundle across `orq-agent/commands/trace-failure-analysis.md` — well above the ≥15 floor; every TFAIL-01..06 anchor verified present)

### §6. Resources dir file count

```
=== GATE 6: resources count ===
failure-mode-classification.md
grounded-theory-methodology.md
handoff-matrix.md
       3
```

### §7. Index references

```
=== GATE 7: index references ===
orq-agent/SKILL.md:2
orq-agent/commands/help.md:1
orq-agent/commands/traces.md:1
```

### §8. TODO(TFAIL) eradication in traces.md

```
=== GATE 8: TODO(TFAIL) in traces.md ===
0
EXIT=1
```

(`grep -c` returns 0 matches and exit 1, which is the success signal for this gate — the placeholder is gone and `traces.md` now carries a live forward-handoff to `/orq-agent:trace-failure-analysis`)

## Requirement Traceability

| Req ID | Requirement (abbreviated) | File-level evidence | Grep anchor | Status |
|--------|---------------------------|---------------------|-------------|--------|
| TFAIL-01 | Mixed sampling 50/30/20 targeting ~100 traces | `orq-agent/commands/trace-failure-analysis.md` Step 1 (Sampling) | `grep -qE "50.*random\|30.*failure\|20.*outlier"` | ✓ file-level |
| TFAIL-02 | Open + axial coding, 4-8 non-overlapping modes | `trace-failure-analysis.md` Steps 2-3 + `resources/grounded-theory-methodology.md` | `grep -qi "open coding" && grep -qi "axial coding"` | ✓ file-level |
| TFAIL-03 | First-upstream-failure rule; no cascade labeling | `trace-failure-analysis.md` Step 4 + `resources/grounded-theory-methodology.md` (3-span cascade example) | `grep -qi "first upstream"` | ✓ file-level |
| TFAIL-04 | Transition failure matrix (rows=last success, cols=first failure) | `trace-failure-analysis.md` Step 5 | `grep -qiE "transition.*matrix"` | ✓ file-level |
| TFAIL-05 | 4-category classification (spec / code-checkable / subjective / trivial-bug) | `trace-failure-analysis.md` Step 6 + `resources/failure-mode-classification.md` | `grep -q "specification" && grep -q "generalization-code-checkable" && grep -q "generalization-subjective" && grep -q "trivial-bug"` | ✓ file-level |
| TFAIL-06 | Error-analysis report with taxonomy + rates + examples + handoff | `trace-failure-analysis.md` Step 7 + `resources/handoff-matrix.md` | `grep -q "error-analysis-"` | ✓ file-level |

## ROADMAP Success Criteria Checklist

| # | Criterion (from ROADMAP Phase 38) | Evidence | Status |
|---|-----------------------------------|----------|--------|
| 1 | Skill samples ~100 traces using 50% random / 30% failure-driven / 20% outlier mix and records the sampling plan | `trace-failure-analysis.md` Step 1 sampling queries + inline sampling-plan table | ✓ file-level (manual smoke deferred: real workspace) |
| 2 | Skill supports open-coding then axial-coding clustering into 4-8 non-overlapping failure modes | `trace-failure-analysis.md` Steps 2-3 + `resources/grounded-theory-methodology.md` | ✓ file-level (manual smoke deferred: real annotation loop) |
| 3 | First upstream failure only; no cascading labels; multi-step pipelines get transition matrix | `trace-failure-analysis.md` Steps 4-5 + `resources/grounded-theory-methodology.md` (cascade-of annotation) | ✓ file-level (manual smoke deferred: real multi-span trace) |
| 4 | Every mode classified as spec / gen-code-checkable / gen-subjective / trivial-bug | `trace-failure-analysis.md` Step 6 + `resources/failure-mode-classification.md` | ✓ file-level (classification judgement deferred to live run) |
| 5 | Error-analysis report with taxonomy, rates, example trace IDs, recommended next step | `trace-failure-analysis.md` Step 7 + `resources/handoff-matrix.md` | ✓ file-level (handoff sensibility deferred to live run) |

## File Inventory

**Newly created (4 files, 420 lines total):**

- `orq-agent/commands/trace-failure-analysis.md` (287 lines) — single-file SKST-compliant skill, 9 mandatory H2 + 7 numbered Steps
- `orq-agent/commands/trace-failure-analysis/resources/grounded-theory-methodology.md` (45 lines)
- `orq-agent/commands/trace-failure-analysis/resources/failure-mode-classification.md` (63 lines)
- `orq-agent/commands/trace-failure-analysis/resources/handoff-matrix.md` (25 lines)

**Edited (3 files, additive):**

- `orq-agent/SKILL.md` — Phase 38 H3 + TFAIL-01..06 coverage block + Directory Structure entries + Resources Policy migration-status update (2nd live per-skill `resources/` dir after Phase 37)
- `orq-agent/commands/help.md` — added `/orq-agent:trace-failure-analysis` between `/orq-agent:observability` and `/orq-agent:automations` (diagnose-before-fix pipeline order)
- `orq-agent/commands/traces.md` — replaced `TODO(TFAIL)` placeholder with live forward-handoff to `/orq-agent:trace-failure-analysis`

**Protected (untouched):** `orq-agent/commands/orq-agent.md`, `orq-agent/commands/prompt.md`, `orq-agent/commands/architect.md` (3/3 SHA-256 matches preserved).

## Deferred Manual Smokes (for `/gsd:verify-work 38`)

| Behavior | Requirement | Why Manual |
|----------|-------------|------------|
| End-to-end run on a live workspace produces 4-8 modes | TFAIL-02 | Requires ≥50 real traces + human annotator in the loop |
| Transition matrix correctness on a multi-step pipeline | TFAIL-04 | Needs real multi-span traces with heterogeneous first-failure span types |
| Handoff recommendation is sensible per class | TFAIL-05, TFAIL-06 | Judgement-based; requires live human review of the classification → next-skill mapping on a real taxonomy |
| MCP `list_traces` filter round-trip with `--identity` | TFAIL-01 | Requires live workspace with identity-tagged traces from Phase 37 OBSV-07 |

## Sign-off

Phase 38 mechanically COMPLETE — 5th consecutive V3.0 phase (34 / 35 / 36 / 37 / 38) closed under the canonical VERIFICATION.md pattern. All 8 mechanical gates green; all 6 TFAIL requirements file-level verified; all 5 ROADMAP Phase 38 success criteria file-level satisfied; 3/3 protected pipelines byte-identical since Phase 34 baseline; full-suite SKST lint exit 0; MSEL-02 `snapshot-pinned-models` rule still green across Phase 38 additions; `TODO(TFAIL)` eradicated from `traces.md`. Ready for `/gsd:verify-work 38` to run the 4 deferred manual smokes on a live workspace.

Commit: fe7fceb
