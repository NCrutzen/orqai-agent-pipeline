# Phase 26: Dataset Preparer - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

New Claude Code subagent (`dataset-preparer.md`) that parses existing V1.0 markdown datasets (clean + edge), augments to 30+ examples, splits 60/20/20 stratified, and uploads to Orq.ai with the correct `messages` field format. Produces a `dataset-prep.json` handoff contract for downstream subagents (experiment-runner, results-analyzer). Also handles deployment pre-check and agent role inference.

This replaces Phases 1-5 of the current monolithic tester.md (771 lines) plus the role inference from Phase 6.

</domain>

<decisions>
## Implementation Decisions

### MCP vs REST Strategy
- Claude's discretion on whether to use MCP-first with REST fallback or REST-only for dataset operations
- Claude's discretion on fallback scope (per-operation vs session-level)
- Do NOT record which channel (MCP vs REST) was used -- just make it work, don't clutter the handoff contract
- Claude's discretion on REST client choice (raw fetch/curl vs @orq-ai/node SDK)

### Row Format & Metadata
- Each datapoint MUST include `messages: [{role: "user", content: input_text}]` as a top-level field -- this is the confirmed root cause of experiment timeouts
- Each datapoint MUST include `expected_output` as a top-level field -- evaluators need reference responses for scoring
- Claude's discretion on where to put category/source/eval_id metadata (in `inputs`, local-only, or hybrid) -- decide based on what the experiment engine actually needs
- **Smoke test required:** Before uploading the full dataset, upload 1 row and run a mini-experiment to verify non-null evaluator scores. Catches format issues early (Pitfall 2 detection). Claude's discretion on which agent to use for the smoke test.

### dataset-prep.json Contract
- Lives in the swarm output directory (alongside test-results.json) -- consistent with existing pattern
- Per-agent status values: `ready` (datasets uploaded), `skipped` (no dataset files found), `error` (upload failed with reason)
- Dataset-preparer infers agent role (structural/conversational/hybrid) from spec content and includes `role` field per agent (DATA-04)
- Include split counts per agent: `example_counts: { original, augmented, total, per_split: { train, test, holdout } }`
- Include per-agent dataset IDs: `test_dataset_id`, `train_dataset_id`, `holdout_dataset_id`

### Augmentation & Splitting
- Replicate the 4 augmentation techniques from current tester.md exactly: parameter swaps, complexity variations, format variations, rephrasings
- Upload all 3 splits (train, test, holdout) to Orq.ai -- train is "for future use" but uploaded for readiness
- Dataset-preparer handles deployment pre-check (verify agents have `orqai_id` in YAML frontmatter) -- it's first in pipeline and already reads specs
- Dataset-preparer accepts optional agent-key filter parameter (passed through from test.md for --agent flag support)

### Claude's Discretion
- MCP-first vs REST-only approach for dataset operations
- Fallback detection scope (per-operation vs session-level)
- REST client implementation (raw fetch vs SDK)
- Where to store category/source/eval_id metadata relative to Orq.ai platform
- Smoke test agent selection strategy
- Internal code structure and error handling patterns

</decisions>

<specifics>
## Specific Ideas

- Success Criterion 1 explicitly requires a test experiment producing non-null evaluator scores -- the smoke test decision directly addresses this
- The architecture research targets ~250 lines for dataset-preparer.md
- Current tester.md anti-patterns to avoid: installing @orq-ai/node@latest (v4 dropped MCP binary), deploying resources in parallel (sequential to respect rate limits)
- Pitfall 2 (row format mismatch) is the primary technical risk -- the smoke test is the mitigation
- Pitfall 3 (token bloat) is addressed by the JSON file handoff contract -- dataset-preparer writes to disk, experiment-runner reads from disk

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `orq-agent/agents/tester.md`: Current monolithic implementation (Phases 1-6 being extracted). Contains proven augmentation logic, category tagging, stratified split implementation, and role inference heuristics.
- `orq-agent/templates/dataset.md`: Dataset template defining the V1.0 markdown format that dataset-preparer parses.
- `orq-agent/agents/dataset-generator.md`: Generates datasets from scratch (different from dataset-preparer which reads existing datasets). Shares category taxonomy (happy-path, variation, boundary, adversarial, edge-case, stress).
- `orq-agent/references/orqai-api-endpoints.md`: REST API reference for /v2/datasets and /v2/datasets/{id}/rows endpoints.

### Established Patterns
- MCP-first / REST-fallback: Defined in deployer.md, inherited across V2.0+ agents. Per-operation with exponential backoff (1s, 2s, 4s + jitter, cap 30s). Retry on 429/500/502/503/504.
- YAML frontmatter: Agent specs store `orqai_id` and `key` in frontmatter between `---` delimiters.
- Dataset naming: `test-{SWARM_NAME}-{AGENT_KEY}-{split}` convention from current tester.md.
- Sequential upload: Current tester.md uploads datasets sequentially to respect rate limits.

### Integration Points
- **Input:** Reads swarm output directory (ORCHESTRATION.md for agent list, agent spec .md files, datasets/ directory for markdown datasets)
- **Output:** Writes `dataset-prep.json` to swarm output directory -- consumed by experiment-runner (Phase 27)
- **Downstream:** experiment-runner reads `test_dataset_id` and `holdout_dataset_id` from dataset-prep.json; results-analyzer may use `example_counts` for reporting

</code_context>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 26-dataset-preparer*
*Context gathered: 2026-03-10*
