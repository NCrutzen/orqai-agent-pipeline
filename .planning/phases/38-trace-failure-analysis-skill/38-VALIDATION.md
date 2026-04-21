---
phase: 38
slug: trace-failure-analysis-skill
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 38 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bash + grep (reuse Phase 34 scripts) |
| **Quick** | `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/trace-failure-analysis.md` |
| **Full** | `bash orq-agent/scripts/lint-skills.sh && bash orq-agent/scripts/check-protected-pipelines.sh` |
| **Runtime** | ~3s |

## Per-Task Verification Map

| Task | Plan | Wave | Req | Automated Command |
|------|------|------|-----|-------------------|
| 38-01-01 | 01 | 1 | TFAIL-01..06 | `test -f orq-agent/commands/trace-failure-analysis.md && bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/trace-failure-analysis.md`; `grep -q "open coding" && grep -q "axial coding" && grep -q "50/30/20" && grep -q "first upstream" && grep -q "transition.*matrix"` |
| 38-02-01 | 02 | 1 | TFAIL-05, TFAIL-06 | `test -d orq-agent/commands/trace-failure-analysis/resources && ls orq-agent/commands/trace-failure-analysis/resources | wc -l` ≥ 3 |
| 38-03-01 | 03 | 2 | index wiring | `grep -q "trace-failure-analysis" orq-agent/SKILL.md && grep -q "orq-agent:trace-failure-analysis" orq-agent/commands/help.md` |
| 38-04-01 | 04 | 3 | full-suite verify | Full lint + protected pipelines + all TFAIL anchors |

## Wave 0

- [ ] None — reuses Phase 34 scripts.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual |
|----------|-------------|------------|
| End-to-end workflow on real traces produces 4–8 modes | TFAIL-02 | Requires live workspace with ≥100 traces |
| Transition matrix correct on multi-step pipeline | TFAIL-04 | Needs real multi-span traces |
| Handoff recommendation is sensible for each class | TFAIL-05, TFAIL-06 | Judgment-based |

**Approval:** pending
