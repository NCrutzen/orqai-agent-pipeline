# Phase 39: Dataset Generator Enhancements - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Enhance the existing `orq-agent/agents/dataset-generator.md` subagent AND the `orq-agent/commands/datasets.md` command with:
- DSET-01: Two-step generation mode (dimensions 3-6 → tuples → NL inputs in separate passes)
- DSET-02: 8-vector adversarial catalog (15-20% coverage, ≥3/vector)
- DSET-03: Coverage rules (every dimension value ≥2 datapoints; no value >30%); violations block upload
- DSET-04: Mode 4 curation (dedupe/rebalance/fill/resolve; confirm before deletion via AskUserQuestion)
- DSET-05: Category+dimension tagging per datapoint; multi-turn shape (Messages+perturbation); RAG shape (source chunk IDs)
- DSET-06: Multi-turn shape (Messages column + perturbations) — consolidated under DSET-05 family
- DSET-07: RAG shape (expected source chunk IDs) — consolidated under DSET-05 family
- DSET-08: Promote production trace → dataset regression case

Tier: deploy+. Must preserve Phase 34 SKST + Phase 35 snapshot-pin + Phase 36 protected-pipeline invariants.

</domain>

<decisions>
## Implementation Decisions

### File structure
- **Enhance** `orq-agent/agents/dataset-generator.md` — add sections for Two-Step Mode, Adversarial Vectors, Coverage Rules, Curation Mode 4, Multi-turn Shape, RAG Shape, Promote-From-Trace. Preserve all 9 SKST sections.
- **Enhance** `orq-agent/commands/datasets.md` — add CLI flags: `--mode two-step|flat|curation|promote-trace`, `--trace-id <id>`, `--shape single|multi-turn|rag`. Preserve 9 SKST sections.
- **New resources** under `orq-agent/agents/dataset-generator/resources/`:
  - `adversarial-vectors.md` — 8-vector catalog with 3+ examples per vector
  - `coverage-rules.md` — rule definitions + remediation messages
  - `shapes.md` — multi-turn and RAG shape templates

### 8-vector adversarial catalog (DSET-02)
Exact vector names (lint-anchor):
1. persona-breaking
2. instruction-override
3. language-switching
4. formality-mismatch
5. refusal
6. format-forcing
7. multi-turn-manipulation
8. contradiction

### Coverage rules (DSET-03)
- Every dimension value appears in ≥2 datapoints.
- No single value dominates >30% of total.
- Violations print remediation: "Coverage check failed: value 'X' appears in only 1 datapoint (need ≥2). Add datapoints or adjust dimensions." Block upload.

### Curation Mode 4 (DSET-04)
- Reads existing dataset, groups by (category, dimension, input-hash).
- Deduplicates exact hashes.
- Rebalances: flags values >30%; suggests removals.
- Fills gaps: flags values <2 count; suggests additions.
- Resolves contradictions: finds conflicting expected outputs for equivalent inputs.
- Every proposed deletion requires `AskUserQuestion` confirmation.

### Promote-from-trace (DSET-08)
- `datasets --mode promote-trace --trace-id <id>`
- Fetches trace via MCP `get_span` (root) + `list_spans`
- Preserves: input (root span input), output (root span output), intermediate steps (tool call sequence), metadata (session_id, user_id, customer_id, identity).
- Emits a single datapoint with `source: production-trace` + `source_trace_id: <id>`.

### Shapes (DSET-05, DSET-06, DSET-07)
Every datapoint carries:
- `category` (required)
- `dimension_values: {dim1: val1, dim2: val2, ...}` (required for two-step mode; optional in flat mode)
- `shape: single | multi-turn | rag`
- For multi-turn: `messages: [...]` array + `perturbation_scenario: <name>`
- For rag: `expected_source_chunk_ids: [...]`

### Claude's Discretion
- Exact split of dataset-generator subagent content — single file vs. subagent + resources/ split (lean resources/ per Phase 37 precedent).
- Wording of the remediation messages — must contain exact phrase "Coverage check failed:" for lint grep.
- Whether to add a new lint rule `dataset-generator-vectors` (checks 8 vector names) — nice-to-have; defer unless scope allows.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `orq-agent/agents/dataset-generator.md` (V2.0) — existing subagent with 9 SKST sections (post-Phase 34). Has input-handling and dataset-shape logic; we extend.
- `orq-agent/commands/datasets.md` (V2.0, Phase 34-updated) — existing standalone command; add new flags.
- `orq-agent/agents/results-analyzer.md` — consumes `category` + `dimension` tags for slice analysis (Phase 42 interaction).
- Phase 37 observability patterns — traces have `session_id` / `customer_id` / `identity` attributes we preserve in promote-from-trace.

### Established Patterns
- Resources subdir per skill: `orq-agent/agents/dataset-generator/resources/*.md` (single-consumer, out of lint default scope).
- AskUserQuestion required for deletions (Destructive Actions rule).
- Banner: `ORQ ► DATASETS` (existing command) / no banner for subagent.

### Integration Points
- `orq-agent/SKILL.md` — update dataset-generator entry if line count changes substantially; add resources subdir row.
- `orq-agent/commands/help.md` — update `/orq-agent:datasets` flags summary if flag count grows.
- `orq-agent/agents/results-analyzer.md` — downstream consumer; Phase 42 wires slice analysis. No edit here unless analyzer already references missing tags.

</code_context>

<specifics>
## Specific Ideas

### Two-step mode output example (DSET-01)
```
Step A: Dimensions (3-6 axes)
  - task_complexity: [simple, complex]
  - user_persona: [novice, expert, non-native-speaker]
  - input_channel: [chat, voice-transcript]

Step B: Tuples (enumerate manually or via LLM scale)
  - (simple, novice, chat)
  - (complex, expert, voice-transcript)
  - ...

Step C: Natural-language inputs (one per tuple)
  - "How do I reset my password?"
  - "Explain quantum error correction in a voice memo from a PhD"
  - ...
```

### Promote-from-trace datapoint shape
```json
{
  "category": "regression",
  "source": "production-trace",
  "source_trace_id": "tr_01JRXYZ",
  "input": "...",
  "expected_output": "...",
  "intermediate_steps": [{"tool": "db_lookup", "args": {...}, "result": {...}}],
  "metadata": {"session_id": "...", "customer_id": "acme", "identity": {"tenant": "eu-1"}}
}
```

</specifics>

<deferred>
## Deferred Ideas

- Auto-regeneration trigger on new traces — Phase 36 `/orq-agent:automations` covers this orchestration; DSET-08 handles the single-trace case.
- Cross-dataset merge/split — out of scope; Mode 4 operates on one dataset at a time.
- Dataset versioning UI — Orq.ai platform feature; skill surfaces only current version.

</deferred>
