---
phase: 37-observability-setup-skill
plan: 01
subsystem: orq-agent/commands
tags: [observability, skst, instrumentation, identity, traced-decorators]
requires:
  - SKST-9 template (Phase 34)
  - /orq-agent:traces --identity stub (Phase 36 LCMD-02)
provides:
  - /orq-agent:observability command skill
  - delegation hook into observability/resources/<framework>.md (Plan 02 fills)
  - forward-reference to /orq-agent:traces --identity (Plan 03 wires live)
affects:
  - downstream Phase 38 trace-failure analysis (consumes enriched/tagged traces)
tech-stack:
  added: []
  patterns:
    - SKST-9 slash command skill with XML runtime-body + 9 required H2 sections
    - framework detection via Grep (Python + TS import globs)
    - decision-tree mode recommendation (AI Router / OTEL / both)
    - delegation-via-Read to per-framework resource files
    - PII regex scan at baseline verification gate
key-files:
  created:
    - orq-agent/commands/observability.md (242 lines)
  modified: []
decisions:
  - 9 SKST sections rendered in required order; banner ORQ ► OBSERVABILITY emitted as runtime output (Step 1) not skill prose
  - Subagent extraction skipped — 242 lines is comfortably under the 400-line threshold
  - Decision tree for mode recommendation hardcoded in skill body (AI Router default on supported SDK + no OTEL)
  - PII scan emits WARN not FAIL — user decides whether match is test data or real leak
  - Enrichment helpers shown only for OpenAI SDK (Python) + Vercel AI SDK (TS) as representative pair; per-framework expansion lives in Plan 02 resource files
  - Identity attribution uses setIdentity (TS) + set_identity (Python) naming pair consistent with CONTEXT.md specific-ideas block
metrics:
  duration: 4m
  completed: 2026-04-20
---

# Phase 37 Plan 01: Observability Setup Skill Summary

Single-file skill at `orq-agent/commands/observability.md` (242 lines) carrying OBSV-01/02/04/05/06 fully and OBSV-07 prose + forward-reference, with delegation hooks into Plan 02's per-framework resource files and forward-reference into Plan 03's live `--identity` wiring.

## What shipped

- **observability.md** — user-invoked `/orq-agent:observability` skill with all 9 SKST H2 sections in required order, ORQ ► OBSERVABILITY banner, 7-step body:
  1. Framework detection (Grep Python + TS/JS imports + existing instrumentation)
  2. Integration mode recommendation (AI Router default / OTEL-only / both) with written rationale
  3. Integration code emission (delegation to `observability/resources/<framework>.md`)
  4. Baseline verification script spec (`verify-orq-traces.{ts,py}`) + PII regex suite (email/phone/SSN/CC)
  5. Enrichment table (`session_id` / `user_id` / `customer_id` / `feature_tags`)
  6. `@traced` decorator examples for all 6 span types in Python + TypeScript
  7. Identity attribution (`setIdentity` TS / `set_identity` Python) + forward-reference to `/orq-agent:traces --identity <id>`

## Verification gates (all green)

- `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/observability.md` — **exit 0**
- `bash orq-agent/scripts/check-protected-pipelines.sh` — **exit 0** (3/3 SHA-256 matches: orq-agent / prompt / architect)
- 12/12 grep anchors pass: `AI Router`, `OTEL`, `span_type="agent|llm|tool|retrieval|embedding|function"`, `session_id`, `customer_id`, `identity`, `per-tenant`
- File line count: 242 (< 400 subagent-extraction threshold)

## Delegation + forward-reference graph

- → Plan 02: Step 3 references `orq-agent/commands/observability/resources/<framework>.md` for 5 framework variants (openai-sdk, langchain, crewai, vercel-ai, generic-otel)
- → Plan 03: Step 7 forward-references `/orq-agent:traces --identity acme-corp` as the retrieval surface for per-tenant filtering (Plan 03 replaces the Phase 36 TODO(OBSV-07) stub)
- → Phase 38: Anti-Patterns table + baseline verification gate feed the trace-failure analysis workflow (TODO(TFAIL) placeholder)

## Deviations from Plan

None — plan executed exactly as written.

## Requirements addressed

- **OBSV-01** (framework detection) — Step 1 grep matrix + AskUserQuestion fallback
- **OBSV-02** (mode recommendation) — Step 2 decision tree with written rationale
- **OBSV-04** (baseline verification) — Step 4 verify-orq-traces.{ts,py} spec with 6 assertions + PII regex
- **OBSV-05** (trace enrichment) — Step 5 attribute table
- **OBSV-06** (@traced placement) — Step 6 Python + TS examples for all 6 span types
- **OBSV-07** (identity attribution) — Step 7 setIdentity/set_identity snippets + forward-reference to `/orq-agent:traces --identity`

**Deferred to later plans:**
- OBSV-03 per-framework integration snippets — Plan 02 creates `observability/resources/*.md` (already shipped per commit 84b40a3)
- `--identity` live wiring in traces.md — Plan 03

## Self-Check: PASSED

- FOUND: orq-agent/commands/observability.md
- FOUND: commit 2777331 (`feat(37-01): add observability.md SKST skill for LLM instrumentation setup`)
- FOUND: all 12 grep anchors
- FOUND: lint exit 0 + protected-pipelines exit 0
