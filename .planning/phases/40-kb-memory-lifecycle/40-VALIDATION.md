---
phase: 40
slug: kb-memory-lifecycle
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 40 — Validation Strategy

| Property | Value |
|----------|-------|
| Framework | bash + grep |
| Quick | `bash orq-agent/scripts/lint-skills.sh --file <path>` |
| Full | `bash orq-agent/scripts/lint-skills.sh && bash orq-agent/scripts/check-protected-pipelines.sh` |

## Per-Task Verification Map

| Task | Plan | Wave | Req | Command |
|------|------|------|-----|---------|
| 40-01-01 | 01 | 1 | KBM-01,02,03,04 | lint kb.md; grep for "retrieval quality", "embedding model", "chunking strategy", "KB-vs-Memory" |
| 40-02-01 | 02 | 1 | KBM-01,02,03 | lint kb-generator.md; grep for chunking_strategy, sentence, recursive |
| 40-03-01 | 03 | 1 | KBM-05 | lint memory-store-generator.md; grep for "read/write/recall", "descriptive keys" |
| 40-04-01 | 04 | 1 | KBM-01,03,04 | 3 resources files exist; anchors for chunking/kb-vs-memory/retrieval |
| 40-05-01 | 05 | 2 | wire index | SKILL.md + help.md updated |
| 40-06-01 | 06 | 3 | verify | Full suite + all KBM anchors |

## Wave 0

- [ ] None — reuse Phase 34 scripts.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual |
|----------|-------------|------------|
| Retrieval test blocks bad chunking | KBM-01 | Needs real KB + live MCP |
| Embedding activation check catches disabled | KBM-02 | Live workspace |
| Round-trip memory test passes | KBM-05 | Live agent invocation |

**Approval:** pending
