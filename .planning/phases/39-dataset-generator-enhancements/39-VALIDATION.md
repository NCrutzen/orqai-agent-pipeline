---
phase: 39
slug: dataset-generator-enhancements
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 39 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | bash + grep (Phase 34 scripts) |
| Quick | `bash orq-agent/scripts/lint-skills.sh --file <path>` |
| Full | `bash orq-agent/scripts/lint-skills.sh && bash orq-agent/scripts/check-protected-pipelines.sh` |
| Runtime | ~3s |

## Per-Task Verification Map

| Task | Plan | Wave | Req | Automated Command |
|------|------|------|-----|-------------------|
| 39-01-01 | 01 | 1 | DSET-01..08 subagent | lint + grep anchors: `two-step`, `adversarial`, `coverage`, `curation`, `promote-trace`, `multi-turn`, `rag`, all 8 vector names |
| 39-02-01 | 02 | 1 | DSET-01..08 command | lint + grep: `--mode two-step`, `--mode curation`, `--mode promote-trace`, `--trace-id`, `--shape multi-turn`, `--shape rag` |
| 39-03-01 | 03 | 1 | resources | `test -d orq-agent/agents/dataset-generator/resources && ls | wc -l >= 3`; each file has vector/coverage/shape anchors |
| 39-04-01 | 04 | 2 | index wiring | SKILL.md references resources subdir; help.md flags updated |
| 39-05-01 | 05 | 3 | verify | Full suite + protected pipelines + DSET-01..08 anchors |

## Wave 0

- [ ] None — reuse Phase 34 scripts.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual |
|----------|-------------|------------|
| Generator emits correct shape on real use-case | DSET-01, 05-07 | LLM output verification |
| Coverage rule blocks bad uploads | DSET-03 | Runtime execution needed |
| Curation round-trip preserves good datapoints | DSET-04 | LLM judgement |
| Promote-trace preserves metadata | DSET-08 | Live Orq.ai trace needed |

**Approval:** pending
