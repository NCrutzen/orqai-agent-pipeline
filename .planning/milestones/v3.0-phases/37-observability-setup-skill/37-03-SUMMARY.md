---
phase: 37-observability-setup-skill
plan: 03
subsystem: orq-agent/commands
tags: [observability, OBSV-07, traces, identity, MCP, skill-format]
requires: [37-01, 37-02]
provides: "Live --identity <id> filter on /orq-agent:traces (MCP pass-through + client-side fallback)"
affects: [orq-agent/commands/traces.md]
tech-stack:
  added: []
  patterns:
    - "MCP-first pass-through with client-side fallback for partial API support"
    - "Bidirectional Companion Skills back-reference (← observability producer ↔ → traces consumer)"
key-files:
  created: []
  modified:
    - orq-agent/commands/traces.md
decisions:
  - "Identity filter is MCP pass-through first, client-side fallback over trace.metadata.identity / trace.attributes.identity / trace.customer_id — Orq.ai API surface for identity is still partially in flight, so skill must handle both (2026-04-20)"
  - "Zero-match emits helpful hint pointing user back to /orq-agent:observability Step 7 — closes the producer/consumer loop for OBSV-07 (2026-04-20)"
metrics:
  duration: "2 min"
  tasks: 1
  files: 1
  completed: "2026-04-20"
---

# Phase 37 Plan 03: Wire --identity live in traces.md Summary

**One-liner:** Replaced the Phase 36 `TODO(OBSV-07)` parse-only stub in `orq-agent/commands/traces.md` with a live `--identity <id>` MCP pass-through filter + client-side fallback, closing the OBSV-07 retrieval surface.

## What Changed

8 edit locations applied to `orq-agent/commands/traces.md` (single file, 1 commit):

1. Step 1 argument table row for `--identity` — STUB wording → live MCP pass-through description.
2. Step 1 parse rule paragraph — removed `TODO(OBSV-07)` warning block, added MCP pass-through + client-side fallback + zero-match hint.
3. Step 2 MCP `list_traces` tool call — added `identity: $IDENTITY` parameter.
4. Step 2 REST fallback curl — added `&identity=${IDENTITY}` query param.
5. Step 2 stub-disclaimer paragraph — replaced "Never apply the filter" with server-side/client-side decision rule.
6. Done When checklist — replaced stub-bullet with live-behavior bullet.
7. Anti-Patterns row — replaced "treating --identity as implemented" with "silently dropping --identity when MCP does not expose it natively".
8. Companion Skills — added `← /orq-agent:observability` back-reference (producer of identity-tagged traces).

## Verification Results

| Check | Before | After |
|---|---|---|
| `grep -c 'TODO(OBSV-07)' orq-agent/commands/traces.md` | 3 | 0 |
| `grep -c 'identity' orq-agent/commands/traces.md` | 7 | 9 |
| `grep -q 'observability'` | absent | present |
| `grep -q 'per-tenant\|per-customer'` | absent | present |
| `grep -q 'errors-first'` (LCMD-02 anchor) | present | present |
| `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/traces.md` | exit 0 | exit 0 |
| `bash orq-agent/scripts/lint-skills.sh` (full suite) | exit 0 | exit 0 |
| `bash orq-agent/scripts/check-protected-pipelines.sh` | 3/3 SHA-256 | 3/3 SHA-256 |

traces.md is NOT a protected pipeline (protected = orq-agent.md / prompt.md / architect.md). All 9 SKST sections remain intact.

## Deviations from Plan

None — plan executed exactly as written across all 8 edit locations.

## Commits

- `6a61bb8` feat(37-03): wire --identity live in traces.md, remove TODO(OBSV-07)

## Self-Check: PASSED

- FOUND: orq-agent/commands/traces.md (modified, TODO removed, identity live)
- FOUND: commit 6a61bb8 in git log
- FOUND: all acceptance criteria satisfied (lint green, protected pipelines 3/3, grep anchors all pass)
