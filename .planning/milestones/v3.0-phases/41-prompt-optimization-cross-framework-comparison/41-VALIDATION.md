---
phase: 41
slug: prompt-optimization-cross-framework-comparison
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 41 — Validation Strategy

| Property | Value |
|----------|-------|
| Framework | bash + grep |
| Quick | `bash orq-agent/scripts/lint-skills.sh --file <path>` |
| Full | `bash orq-agent/scripts/lint-skills.sh && bash orq-agent/scripts/check-protected-pipelines.sh` |

## Per-Task Verification Map

| Task | Plan | Wave | Req | Command |
|------|------|------|-----|---------|
| 41-01-01 | 01 | 1 | POPT-01..04 | lint prompt-optimization.md; 11 guideline anchors + `{{variable}}` preservation + diff + AskUserQuestion |
| 41-02-01 | 02 | 1 | XFRM-01..03 | lint compare-frameworks.md; 5 framework names + evaluatorq + --isolate-model + fairness |
| 41-03-01 | 03 | 1 | POPT, XFRM | resources files exist |
| 41-04-01 | 04 | 2 | index | SKILL.md + help.md |
| 41-05-01 | 05 | 3 | verify | Full suite + anchors |

## Wave 0

- [ ] None — reuse Phase 34 scripts.

## Manual-Only Verifications

| Behavior | Req | Why Manual |
|----------|-----|------------|
| Optimization creates new version | POPT-04 | Live orq.ai POST |
| Comparison script runs end-to-end | XFRM-03 | 5 live framework invocations |

**Approval:** pending
