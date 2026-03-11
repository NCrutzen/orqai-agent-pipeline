# Phase 27: Experiment Runner - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

New Claude Code subagent (`experiment-runner.md`) that creates experiments on Orq.ai, executes 3 runs per agent against the test split dataset, polls for results with adaptive interval, and writes raw per-run per-evaluator scores to `experiment-raw.json`. Replaces Phase 7 of the current monolithic tester.md (evaluatorq SDK) with native REST API calls.

Also supports holdout re-test mode: accepts a `dataset_id` directly to skip dataset-preparer entirely, used by prompt-editor (Phase 31) after iteration.

</domain>

<decisions>
## Implementation Decisions

### MCP vs REST for Experiments
- REST-only for experiment creation and execution -- skip MCP entirely for experiments
- MCP `create_experiment` schema is LOW confidence (noted in STATE.md blockers) and adds risk for no benefit
- REST `POST /v2/experiments` and `POST /v2/experiments/{id}/run` have documented schemas
- MCP-first / REST-fallback pattern still applies for other operations (e.g., evaluator lookups if needed)

### Experiment Granularity
- One experiment per agent, 3 runs triggered via `POST /v2/experiments/{id}/run`
- Fewer API calls, cleaner on the Orq.ai dashboard
- Sequential per-agent execution (not parallel -- inherited from tester.md anti-patterns)

### Polling & Timeout
- Adaptive polling: start at 10s interval, back off to 30s
- 15-minute maximum timeout per experiment before declaring hung
- Live polling updates: show status each poll cycle (`Agent {key} run 2/3: polling... (45s elapsed)`)

### Score Output
- Raw scores only in experiment-raw.json -- NO thresholds
- Results-analyzer (Phase 28) owns pass/fail determination and threshold application
- Include BOTH per-example and aggregate scores (written to disk as JSON, not in-memory -- token impact is zero)

### Holdout Re-test Mode (EXPR-05)
- Accept `dataset_id` directly as input to skip dataset-preparer
- Configurable `run_count` parameter: default 3, caller can override (e.g., 1 for quick validation)
- Configurable agent scope: accept optional `agent_key` filter, default to single agent if provided, all agents if not

### Claude's Discretion
- Evaluator selection ownership (experiment-runner vs upstream)
- Evaluator ID resolution strategy (create custom, reference built-in by name, or discover at runtime)
- Category overlay placement (in experiment-runner vs results-analyzer)
- Whether experiment-raw.json includes evaluator metadata, platform experiment IDs, and per-example text
- Holdout mode evaluator source (re-derive from role vs caller-provided)
- Holdout output file naming (overwrite experiment-raw.json vs separate file)

</decisions>

<specifics>
## Specific Ideas

- STATE.md blocker: "MCP tool signatures for create_experiment, create_datapoints are LOW confidence -- must verify against live MCP server during Phase 27" -- resolved by going REST-only for experiments
- Current tester.md Phase 7 uses evaluatorq SDK which is broken (root cause of V2.1 restructure) -- experiment-runner replaces this entirely with REST API
- dataset-prep.json provides `test_dataset_id`, `holdout_dataset_id`, `role` per agent -- experiment-runner reads this as input
- Evaluator reference at orq-agent/references/orqai-evaluator-types.md has full catalog: 19 built-in function, 10 LLM, 12 RAGAS, 4 custom types
- Role-based evaluator selection from tester.md Phase 6: structural (json_validity, exactness, instruction_following), conversational (coherence, helpfulness, relevance, instruction_following), hybrid (union)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `orq-agent/agents/tester.md` Phase 6-7: Proven evaluator selection logic (role->evaluator mapping) and experiment execution flow. Being replaced but logic is reusable.
- `orq-agent/agents/dataset-preparer.md`: Upstream subagent producing `dataset-prep.json` -- defines the input contract (per-agent `test_dataset_id`, `holdout_dataset_id`, `role`, `status`).
- `orq-agent/references/orqai-evaluator-types.md`: Complete evaluator catalog with score types and selection guidance.
- `orq-agent/references/orqai-api-endpoints.md`: REST endpoint reference including `POST /v2/experiments`, `POST /v2/experiments/{id}/run`, `GET /v2/experiments/{id}/results`.

### Established Patterns
- MCP-first / REST-fallback: Per-operation with exponential backoff (1s, 2s, 4s + jitter, cap 30s). Retry on 429/500/502/503/504. Exception: REST-only for experiments (this phase's decision).
- Sequential per-agent execution: Not parallel -- respect rate limits.
- JSON file handoff contracts: dataset-prep.json (input) -> experiment-raw.json (output) -> consumed by results-analyzer (Phase 28).
- YAML frontmatter: Agent specs store `orqai_id`, `key`, `test_role` in frontmatter.

### Integration Points
- **Input:** Reads `dataset-prep.json` from swarm output directory (produced by dataset-preparer, Phase 26)
- **Input (holdout mode):** Accepts `dataset_id` directly, bypassing dataset-prep.json for that specific dataset
- **Output:** Writes `experiment-raw.json` to swarm output directory -- consumed by results-analyzer (Phase 28)
- **Downstream:** results-analyzer reads per-run per-evaluator scores, applies thresholds, produces pass/fail and category-sliced analysis

</code_context>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 27-experiment-runner*
*Context gathered: 2026-03-11*
