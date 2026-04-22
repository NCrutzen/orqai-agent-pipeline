---
phase: 37-observability-setup-skill
plan: 02
subsystem: orq-agent/commands/observability
tags: [observability, OBSV-03, resources, integration-snippets, skills-v3]
requirements-complete: [OBSV-03]
dependency-graph:
  requires: []
  provides:
    - "5 framework integration snippets under orq-agent/commands/observability/resources/"
    - "Per-skill resources directory (single-consumer pattern per Phase 34 SKST-02)"
    - "Instrumentor-before-SDK ordering anchor enforced in every snippet (OBSV-03)"
  affects:
    - "orq-agent/commands/observability.md (Plan 01 Step 3 reads these files)"
tech-stack:
  added:
    - "Python: traceloop-sdk, orq_ai_langchain, opentelemetry-sdk, opentelemetry-exporter-otlp-proto-http"
    - "TypeScript: @orq-ai/node (initOrqObservability), @opentelemetry/sdk-node, @opentelemetry/exporter-trace-otlp-http"
  patterns:
    - "Instrumentors BEFORE SDK clients — enforced via CRITICAL comment in every code block"
    - "Dated snapshot model IDs (gpt-4o-2024-11-20) per MSEL-02 even in illustrative prose"
    - "Per-request metadata (experimental_telemetry) over global setters in serverless contexts"
key-files:
  created:
    - "orq-agent/commands/observability/resources/openai-sdk.md"
    - "orq-agent/commands/observability/resources/langchain.md"
    - "orq-agent/commands/observability/resources/crewai.md"
    - "orq-agent/commands/observability/resources/vercel-ai.md"
    - "orq-agent/commands/observability/resources/generic-otel.md"
  modified: []
decisions:
  - "Per-skill resources/ subdirectory for single-consumer docs (SKST-02 policy) — observability.md is sole reader"
  - "Linter default_file_set uses non-recursive glob commands/*.md — resources/ subdirectory auto-excluded, no lint rule change required"
  - "YAML frontmatter included in resource files for human readability only (not scanned by linter)"
  - "CrewAI identity attribution routed through Traceloop.set_association_properties (association_properties is the CrewAI-via-Traceloop surface for OBSV-07)"
metrics:
  duration: "4 min"
  completed-date: "2026-04-20"
  tasks-completed: 1
  files-created: 5
  files-modified: 0
---

# Phase 37 Plan 02: Observability Resources Directory Summary

Created per-skill `resources/` subdirectory with 5 runnable framework integration snippets (OpenAI SDK, LangChain, CrewAI, Vercel AI, generic OpenTelemetry), each enforcing the OBSV-03 invariant that instrumentors must be imported BEFORE the SDK clients they wrap.

## What Was Built

- `orq-agent/commands/observability/resources/openai-sdk.md` — Python (Traceloop.init) + TypeScript (initOrqObservability) snippets, both pinned to `gpt-4o-2024-11-20` per MSEL-02.
- `orq-agent/commands/observability/resources/langchain.md` — Python OrqAICallbackHandler with handler attached at BOTH LLM construction and `.invoke()` config (LangGraph-safe).
- `orq-agent/commands/observability/resources/crewai.md` — Python Traceloop auto-instrumentation; documents how Agent/Task spans are emitted automatically and how to attach `customer_id` via `association_properties`.
- `orq-agent/commands/observability/resources/vercel-ai.md` — TypeScript `experimental_telemetry.metadata` pattern for session/user/customer enrichment (OBSV-07 surface).
- `orq-agent/commands/observability/resources/generic-otel.md` — Python + TypeScript raw OpenTelemetry SDK wired to `https://api.orq.ai/v2/otel/v1/traces` for OTEL-only mode.

## Precondition Check

Linter scope confirmed non-recursive before writing any file:

```
$ bash -c 'for f in orq-agent/commands/*.md; do echo "$f"; done' | grep -c "resources"
0
OK: resources/ not scanned
```

Bash glob `commands/*.md` is single-level by default, so files under `commands/observability/resources/` are NOT picked up by `default_file_set()` in `orq-agent/scripts/lint-skills.sh`. No lint exclusion rule needed.

## Verification

| Check | Command | Result |
|---|---|---|
| 5 files exist | `ls orq-agent/commands/observability/resources/*.md \| wc -l` | 5 |
| BEFORE anchor present in each file | `grep -c BEFORE <file>` | openai-sdk: 2, langchain: 2, crewai: 1, vercel-ai: 1, generic-otel: 3 |
| Full-suite lint | `bash orq-agent/scripts/lint-skills.sh` | Exit 0 |
| Protected pipelines | `bash orq-agent/scripts/check-protected-pipelines.sh` | Exit 0 — 3/3 SHA-256 matches |

## Deviations from Plan

None — plan executed exactly as written. Single cosmetic addition: explicit `association_properties` note in crewai.md for OBSV-07 identity attribution.

## Commits

- `84b40a3` feat(37-02): add 5 framework integration snippets under observability/resources/

## Self-Check: PASSED

- [x] `orq-agent/commands/observability/resources/openai-sdk.md` — FOUND
- [x] `orq-agent/commands/observability/resources/langchain.md` — FOUND
- [x] `orq-agent/commands/observability/resources/crewai.md` — FOUND
- [x] `orq-agent/commands/observability/resources/vercel-ai.md` — FOUND
- [x] `orq-agent/commands/observability/resources/generic-otel.md` — FOUND
- [x] Commit `84b40a3` — FOUND in git log
