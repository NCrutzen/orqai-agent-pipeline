---
phase: 38-trace-failure-analysis-skill
verified: 2026-04-20T00:00:00Z
status: human_needed
score: 6/6 mechanical must-haves verified; 4 manual smokes deferred
human_verification:
  - test: "End-to-end run on a live workspace produces 4-8 modes via grounded-theory coding"
    expected: "Skill consumes ≥50 real traces and yields a non-overlapping 4-8 mode taxonomy approved by human annotator"
    why_human: "Requires ≥50 real traces + human in the annotation loop; distributional judgement cannot be grepped"
  - test: "Transition failure matrix correctness on a multi-step pipeline"
    expected: "Rows = last success span, columns = first failure mode; hotspots narrative highlights top 3 cells"
    why_human: "Needs real multi-span traces with heterogeneous first-failure span types"
  - test: "Handoff recommendation is sensible per classification"
    expected: "specification → /orq-agent:prompt; generalization-code-checkable → /orq-agent:harden; generalization-subjective → /orq-agent:harden + human; trivial-bug → developer fix"
    why_human: "Classification judgement is subjective; sensibility of mapping must be reviewed on a real taxonomy"
  - test: "MCP list_traces round-trip with --identity filter (OBSV-07 carryover)"
    expected: "Identity-tagged traces filter correctly via mcp__orqai-mcp__list_traces with identity arg"
    why_human: "Requires live workspace with identity-tagged traces from Phase 37"
---

# Phase 38: Trace Failure Analysis Skill — Verification Report

**Phase Goal:** Users can turn a pile of production traces into a 4-8 mode failure taxonomy with rates, examples, and a recommended next-skill handoff using grounded-theory methodology.
**Verified:** 2026-04-20
**Status:** human_needed (all mechanical gates green; 4 manual smokes deferred)
**Re-verification:** Yes — prior `38-04-VERIFICATION.md` closed as `mechanically-complete`; this report is the phase-level verification that rolls up the plan-level report and records the deferred manual smokes at phase scope.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Skill file exists and is SKST/lint-clean | ✓ VERIFIED | `orq-agent/commands/trace-failure-analysis.md` (287 lines); `lint-skills.sh` exit 0 |
| 2 | Mixed 50/30/20 sampling is encoded + enforced (TFAIL-01) | ✓ VERIFIED | Step 1 per-bucket MCP calls (50 random + 30 error + 20 latency_desc); sampling-plan table with trace IDs |
| 3 | Open + axial coding yield 4-8 non-overlapping modes (TFAIL-02) | ✓ VERIFIED | Steps 2-3 + `resources/grounded-theory-methodology.md`; ENFORCE clause "final mode count MUST be between 4 and 8 inclusive"; NEVER-OVERLAP rule |
| 4 | First-upstream-failure rule with cascade annotation (TFAIL-03) | ✓ VERIFIED | Step 4 topological walk + `cascade-of: <parent_mode>`; anti-pattern callout |
| 5 | Transition failure matrix for multi-step pipelines (TFAIL-04) | ✓ VERIFIED | Step 5 with max_depth gate; rows=last_success, cols=first_failure; hotspots paragraph |
| 6 | 4-category classification (spec / gen-code-checkable / gen-subjective / trivial-bug) (TFAIL-05) | ✓ VERIFIED | Step 6 + `resources/failure-mode-classification.md`; mutually-exclusive enforcement |
| 7 | Error-analysis report with taxonomy + rates + examples + handoff (TFAIL-06) | ✓ VERIFIED | Step 7 emits `error-analysis-YYYYMMDD-HHMM.md` with 6 sections incl. handoff matrix |
| 8 | Skill discoverable via SKILL.md + help.md + traces.md | ✓ VERIFIED | grep counts: SKILL.md=2, help.md=1, traces.md=1 references |
| 9 | End-to-end live workflow produces a sensible taxonomy | ? UNCERTAIN | Requires real workspace + human annotator; deferred to manual smoke |

**Score:** 8/8 mechanical truths verified; 1 truth deferred to human verification.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `orq-agent/commands/trace-failure-analysis.md` | SKST-compliant single-file skill with 7 numbered Steps covering TFAIL-01..06 | ✓ VERIFIED | 287 lines; full lint exit 0; all 6 TFAIL anchor families present (51 total anchor matches) |
| `orq-agent/commands/trace-failure-analysis/resources/grounded-theory-methodology.md` | Open + axial coding rules, saturation, first-upstream decision | ✓ VERIFIED | Exists; referenced from Steps 2, 3, 4 |
| `orq-agent/commands/trace-failure-analysis/resources/failure-mode-classification.md` | 4-category decision rules + tie-breakers | ✓ VERIFIED | Exists; referenced from Step 6 |
| `orq-agent/commands/trace-failure-analysis/resources/handoff-matrix.md` | Classification → next-skill mapping | ✓ VERIFIED | Exists; referenced from Step 7 |
| `orq-agent/SKILL.md` | Lists new skill in directory + coverage block | ✓ VERIFIED | 2 references for `trace-failure-analysis` |
| `orq-agent/commands/help.md` | New skill in help index | ✓ VERIFIED | 1 reference between observability and automations |
| `orq-agent/commands/traces.md` | Forward handoff to new skill; TODO(TFAIL) eradicated | ✓ VERIFIED | 1 reference; `grep -c "TODO(TFAIL)"` = 0 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `trace-failure-analysis.md` Step 2 | `resources/grounded-theory-methodology.md` | explicit path reference | ✓ WIRED | Referenced by relative path in Step 2 + Step 3 + Step 4 |
| `trace-failure-analysis.md` Step 6 | `resources/failure-mode-classification.md` | explicit path reference | ✓ WIRED | Referenced in classification step for decision rules |
| `trace-failure-analysis.md` Step 7 | `resources/handoff-matrix.md` | explicit path reference | ✓ WIRED | Report composition step pulls mapping from resource |
| `traces.md` | `/orq-agent:trace-failure-analysis` | live forward-handoff | ✓ WIRED | 1 match; prior `TODO(TFAIL)` placeholder removed |
| `help.md` | `/orq-agent:trace-failure-analysis` | index listing | ✓ WIRED | Placed between observability and automations (diagnose-before-fix order) |
| `SKILL.md` | `trace-failure-analysis` skill dir + resources | index + coverage block | ✓ WIRED | 2 matches; directory structure + TFAIL coverage block present |

### Requirements Coverage

| Requirement | Source Plan | Description (abbrev) | Status | Evidence |
|-------------|-------------|----------------------|--------|----------|
| TFAIL-01 | 38-01..04 | Mixed 50/30/20 sampling, ~100 traces, sampling plan recorded | ✓ SATISFIED | Step 1 per-bucket calls + sampling-plan table |
| TFAIL-02 | 38-01..04 | Open + axial coding → 4-8 non-overlapping modes | ✓ SATISFIED | Steps 2-3 + grounded-theory resource; enforcement clauses |
| TFAIL-03 | 38-01..04 | First upstream failure only; cascade-of annotation | ✓ SATISFIED | Step 4 + anti-pattern callout |
| TFAIL-04 | 38-01..04 | Transition matrix for multi-step pipelines | ✓ SATISFIED | Step 5 (rows/cols/cells + hotspots) |
| TFAIL-05 | 38-01..04 | 4-category mutually-exclusive classification | ✓ SATISFIED | Step 6 + failure-mode-classification resource |
| TFAIL-06 | 38-01..04 | Error-analysis report with taxonomy, rates, examples, handoff | ✓ SATISFIED | Step 7 emits `error-analysis-YYYYMMDD-HHMM.md` |

No orphaned requirements — all 6 TFAIL IDs are claimed and satisfied at file-level.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TODO/FIXME/placeholder/empty-impl patterns detected in phase-modified files | ℹ️ Info | `TODO(TFAIL)` eradication gate green; no blocker anti-patterns |

### Mechanical Gate Summary

| Gate | Result |
|------|--------|
| Full lint (`lint-skills.sh`) | exit 0 |
| Protected pipelines SHA-256 (`check-protected-pipelines.sh`) | exit 0 — 3/3 matches (orq-agent, prompt, architect) |
| TFAIL anchor coverage | 51 matches across 12 anchor families |
| Resources directory file count | 3 (grounded-theory-methodology, failure-mode-classification, handoff-matrix) |
| Index references | SKILL.md=2, help.md=1, traces.md=1 — all ≥1 |

### Human Verification Required

1. **End-to-end live run yields 4-8 modes** — invoke `/orq-agent:trace-failure-analysis --last 7d` on a real workspace with ≥50 traces; confirm axial coding produces a 4-8 mode taxonomy the user accepts.
2. **Transition matrix correctness** — run against a multi-step pipeline and verify rows (last_success) / columns (first_failure) tally correctly and hotspots narrative is actionable.
3. **Handoff sensibility** — spot-check recommended next-skill mapping per classification against the real taxonomy.
4. **MCP `--identity` filter round-trip** — verify identity-tagged traces (from Phase 37 OBSV-07) are correctly filtered when `--identity <id>` is supplied.

### Gaps Summary

No mechanical gaps. All 6 TFAIL requirements are file-level satisfied, all 5 ROADMAP Phase 38 success criteria are file-level satisfied, all 3 protected pipelines remain byte-identical, lint is green, `TODO(TFAIL)` is eradicated from `traces.md`, and the resources directory carries the expected 3 companion files. Remaining verification is behavioral and requires a live workspace with human-in-the-loop annotation.

---

_Verified: 2026-04-20_
_Verifier: Claude (gsd-verifier)_
