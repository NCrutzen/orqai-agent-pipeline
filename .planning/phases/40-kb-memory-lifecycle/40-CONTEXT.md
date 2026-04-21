# Phase 40: KB & Memory Lifecycle - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Enhance `orq-agent/commands/kb.md` + `orq-agent/agents/kb-generator.md` and create a new subagent `orq-agent/agents/memory-store-generator.md` that applies:
- KBM-01: Retrieval quality test after chunking; refuse wire-up on failure
- KBM-02: Embedding model activation check before KB creation
- KBM-03: Content-type-driven chunking strategy (sentence vs recursive) + record in KB metadata
- KBM-04: KB-vs-Memory decision rule enforced with blocking guidance
- KBM-05: Memory-store generator — descriptive keys, wire agents, round-trip read/write/recall test

Tier: deploy+. Preserve Phase 34 SKST + Phase 35 snapshot-pin + Phase 36 protected-pipeline.

</domain>

<decisions>
## Implementation Decisions

### File structure
- **Enhance** `orq-agent/commands/kb.md` — new Steps: embedding-model check, chunking-strategy picker, retrieval quality test, KB-vs-Memory gate.
- **Enhance** `orq-agent/agents/kb-generator.md` — embed the chunking/retrieval policies; adds `chunking_strategy` to emitted KB metadata.
- **New subagent** `orq-agent/agents/memory-store-generator.md` — creates memory stores + wires agents + runs round-trip test. Full 9 SKST sections.
- **New command** `orq-agent/commands/memory.md` — standalone entry to invoke memory-store generator (optional — Claude's discretion; simplest is kb.md handles both via `--mode kb|memory` flag).
- **Resources** under `orq-agent/commands/kb/resources/`:
  - `chunking-strategies.md` — sentence vs recursive + decision rules
  - `kb-vs-memory.md` — decision rule + anti-patterns
  - `retrieval-test-template.md` — sample queries + pass criteria

### KB-vs-Memory decision rule (KBM-04)
Exact rule text (lint-anchor):
```
- **KB (static reference data):** Docs, FAQs, product catalogs, policies, structured knowledge. Chunked + embedded + queried by similarity.
- **Memory Store (dynamic user context):** Session history, preferences, per-user facts. Keyed + written at runtime by agent decisions.
- **Block:** Memory for docs/FAQs → use KB. KB for conversation context → use Memory Store.
```

### Retrieval quality test (KBM-01)
- After chunking, skill generates 5-10 sample queries (LLM-synthesized from document titles/headings).
- Runs each query against the newly-created KB via MCP `search_entities` or similar retrieval tool.
- Pass criterion: ≥70% of queries return a chunk that semantically matches the intended source (LLM-judge or user confirmation).
- **Refuse to wire to deployment** if pass rate < 70%; output remediation (reduce chunk size, change strategy, re-ingest).

### Embedding model activation (KBM-02)
- Before KB creation, call MCP `list_models --type embedding` (or equivalent) and confirm the chosen embedding model appears in the user's activated set.
- If missing: output remediation — "Activate `<model_id>` in Orq.ai Studio → AI Router → Models → Embeddings before re-running this command."

### Chunking strategy (KBM-03)
- Detect content type by file extension + header frequency:
  - Prose (.md with few H2s, .txt, .pdf) → **sentence** chunker, 512 tokens, 50 overlap
  - Structured (.md with many H2s/H3s, .html, .json, code) → **recursive** chunker, 1024 tokens, 100 overlap
- Record in KB metadata: `{chunking_strategy: "sentence", chunk_size: 512, overlap: 50, reason: "prose"}`

### Memory store generator (KBM-05)
- Collects from user: store name, purpose (description), schema (keys expected to be written).
- Creates memory store via MCP `create_memory_store` (or REST equivalent).
- Wires agent: adds to `agent.settings.memory_stores` + injects instruction: "Use memory store `<key>` to recall user-specific context."
- Round-trip test: writes a test value (`test_write_<uuid>`), reads it back, recalls via sample agent invocation. Reports each step's result.
- Deletes test value after verification.

### Tier
- deploy+ (documented in command banner). Core-tier users get "KB/Memory requires a connected Orq.ai workspace."

### Claude's Discretion
- Whether to create separate `/orq-agent:memory` command or fold memory generation into `/orq-agent:kb --mode memory`. Lean single command with `--mode` flag (consistency with Phase 39 dataset).
- Exact threshold for retrieval pass (70% proposed; user can override via `--retrieval-threshold <N>`).
- Integration with existing KB flow in `kb-generator.md` — additive, not destructive.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `orq-agent/commands/kb.md` (existing, Phase 34-conformant)
- `orq-agent/agents/kb-generator.md` (existing, Phase 34-conformant)
- Phase 36 MCP patterns — `list_models`, `search_entities` are available
- Phase 37 observability patterns — traces capture retrieval results; useful for KB debugging

### Established Patterns
- Banner: `ORQ ► KB` (existing).
- MCP-first with REST fallback.
- 9 SKST sections.
- AskUserQuestion for destructive actions (deleting old KB, overwriting memory store).
- Resources under `<skill>/resources/` when single-consumer.

### Integration Points
- `SKILL.md`: add `memory-store-generator` subagent row + `kb/resources/` subdir.
- `help.md`: update `/orq-agent:kb` flag summary; optionally add `/orq-agent:memory` if Claude chooses split-command.

</code_context>

<specifics>
## Specific Ideas

### Sample retrieval test query generation
- From heading: "### Refund Policy" → query: "How do I get a refund?"
- From heading: "## Billing FAQ" → query: "Where do I update my credit card?"
- Skill does LLM-judge: does the returned chunk actually cover the query intent? If yes → pass. If no → fail.

### Memory store naming convention
- Format: `<agent-slug>-memory` (e.g., `coach-memory`, `support-memory`).
- Descriptive keys: `session_history`, `user_preferences`, `conversation_context`.

### KB-vs-Memory anti-patterns to block
- "Store product catalog in memory" → block, guide to KB.
- "Use KB for last-N user turns" → block, guide to memory store.
- "Use memory for FAQ" → block.

</specifics>

<deferred>
## Deferred Ideas

- Automatic re-chunking on retrieval quality regression — surfaced via `/orq-agent:analytics`, manual rerun for now.
- Multi-KB queries with fusion — Orq.ai platform feature; out of scope.
- Memory-store schema enforcement at runtime — platform feature; skill only documents expected schema.

</deferred>
