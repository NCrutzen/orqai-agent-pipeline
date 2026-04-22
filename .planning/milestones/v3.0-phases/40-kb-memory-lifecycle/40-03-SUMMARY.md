---
phase: 40-kb-memory-lifecycle
plan: 03
subsystem: orq-agent/agents
tags: [subagent, memory-store, KBM-05, SKST, round-trip-test]
requires:
  - Phase 34 SKST subagent pattern (tools: + model: inherit)
  - Phase 36 MCP-first-with-REST-fallback pattern
  - Phase 40 KBM-04 KB-vs-Memory decision rule (lint-anchored verbatim)
provides:
  - orq-agent/agents/memory-store-generator.md subagent (creates memory stores, wires agents, runs read/write/recall round-trip test)
affects:
  - orq-agent/commands/kb.md (--mode memory dispatches here; link target in Phase 40 plan 02)
tech-stack:
  added: []
  patterns:
    - "Embedded KB-vs-Memory Decision Rule (lint anchor, verbatim across kb.md / kb-generator.md / memory-store-generator.md)"
    - "Read/write/recall round-trip test with mandatory test-value cleanup"
    - "Descriptive keys naming convention (session_history / user_preferences / conversation_context, reject generic keys)"
key-files:
  created:
    - orq-agent/agents/memory-store-generator.md
  modified: []
decisions:
  - "Used `tools:` (not `allowed-tools:`) and `model: inherit` per Phase 34 subagent schema"
  - "Embedded KB-vs-Memory Decision Rule verbatim (Phase 40 KBM-04 lint anchor) rather than cross-referencing"
  - "Round-trip test runs against the first descriptive key (typically session_history); single-key coverage accepted as the contract per plan scope"
  - "Cleanup via delete_memory (primary) or set_memory(empty string) fallback — both paths surfaced in the flow for when the MCP delete op is unavailable"
metrics:
  duration: "single-task execution"
  completed: "2026-04-21"
  tasks: 1
  files: 1
---

# Phase 40 Plan 03: memory-store-generator Subagent Summary

New subagent `orq-agent/agents/memory-store-generator.md` created — creates Orq.ai memory stores, wires consuming agent specs (`settings.memory_stores` + system-prompt instruction), runs a mandatory read/write/recall round-trip test with `test_write_<uuid>` cleanup, and embeds the KB-vs-Memory decision rule verbatim as a lint anchor. Satisfies KBM-05 and provides the dispatch target for `/orq-agent:kb --mode memory` (Phase 40 plan 02).

## What Was Built

- **New subagent file** (`orq-agent/agents/memory-store-generator.md`, 267 lines) with full 9 SKST sections: Constraints, When to use, When NOT to use, Companion Skills, Done When, Destructive Actions, Anti-Patterns, Open in orq.ai, Documentation & Resolution.
- **Frontmatter** conforms to Phase 34 subagent schema: `tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion`, `model: inherit`, `name: orq-memory-store-generator`.
- **6-step flow** (Collect context → Ask user → Create store → Wire agent → Round-trip test → Summary).
- **Round-trip test** with three phases (Write / Read / Recall) plus mandatory Cleanup; summary table columns enforce non-optional Cleanup status.
- **Descriptive-keys naming convention** with inline rejection of generic keys (`data`, `state`, `x`, `tmp`, `foo`).
- **Embedded KB-vs-Memory Decision Rule** (verbatim, lint-anchored): KB = static reference data, Memory Store = dynamic user context, Block = docs in memory / conversation context in KB.
- **MCP-first with REST fallback** for `create_memory_store`, `set_memory`, `get_memory`, `delete_memory`.
- **Destructive-action gates** via AskUserQuestion: pre-existing store name, pre-existing `settings.memory_stores` entry on agent spec.

## Verification

- Lint: `bash orq-agent/scripts/lint-skills.sh --file orq-agent/agents/memory-store-generator.md` → exit 0.
- Protected pipelines: `bash orq-agent/scripts/check-protected-pipelines.sh` → 3/3 match (orq-agent, prompt, architect).
- Grep anchors (all exceed minimum counts required by the plan):
  - `read/write/recall` → 5 occurrences (min 3)
  - `descriptive keys` → 8 occurrences (min 2)
  - `session_history` → 7 occurrences (min 2)
  - `user_preferences` → 6 occurrences (min 2)
  - `KB-vs-Memory` → 4 occurrences (min 2)
  - `test_write` → 7 occurrences (min 2)

## Deviations from Plan

None — plan executed exactly as written. No auto-fixes (Rules 1-3) needed, no architectural checkpoints (Rule 4), no authentication gates.

## Commits

- `32e0380` — feat(40-03): add memory-store-generator subagent

## Self-Check: PASSED

- Created file: `orq-agent/agents/memory-store-generator.md` — FOUND
- Commit `32e0380` — FOUND in git log
- Lint exit 0 — PASS
- Protected pipelines 3/3 — PASS
- All 6 grep anchors exceed minimum counts — PASS
