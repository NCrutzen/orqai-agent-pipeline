# Phase 27: Experiment Runner - Research

**Researched:** 2026-03-11
**Domain:** Orq.ai Experiment API (REST), evaluator resolution, adaptive polling
**Confidence:** HIGH

## Summary

The experiment-runner subagent replaces the broken evaluatorq SDK path (tester.md Phase 7) with direct REST API calls to Orq.ai's `/v2/experiments` endpoints. The MCP `create_experiment` tool schema has been verified and is well-structured, but the user decision locks this phase to REST-only for experiment creation and execution. MCP tools remain available for evaluator operations (create_llm_eval, create_python_eval, search_entities).

The core flow is: read `dataset-prep.json` -> resolve evaluators -> create experiment per agent via REST -> trigger runs -> poll for completion -> export run results via MCP `get_experiment_run` -> write `experiment-raw.json`. The MCP `list_experiment_runs` and `get_experiment_run` tools provide a clean way to poll and retrieve results (including a signed download URL for full row data with evaluator scores).

**Primary recommendation:** Use REST `POST /v2/experiments` for creation with `task.type: "agent"` and `agents: [{ agent_key }]`, REST `POST /v2/experiments/{id}/run` for triggering runs, then MCP `list_experiment_runs` (filtered by `sheet_id`) for polling status and `get_experiment_run` for exporting per-run JSONL with evaluator scores.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- REST-only for experiment creation and execution -- skip MCP entirely for experiments
- MCP `create_experiment` schema is LOW confidence (noted in STATE.md blockers) and adds risk for no benefit
- REST `POST /v2/experiments` and `POST /v2/experiments/{id}/run` have documented schemas
- MCP-first / REST-fallback pattern still applies for other operations (e.g., evaluator lookups if needed)
- One experiment per agent, 3 runs triggered via `POST /v2/experiments/{id}/run`
- Sequential per-agent execution (not parallel)
- Adaptive polling: start at 10s interval, back off to 30s, 15-minute maximum timeout
- Live polling updates: show status each poll cycle
- Raw scores only in experiment-raw.json -- NO thresholds
- Results-analyzer (Phase 28) owns pass/fail determination and threshold application
- Include BOTH per-example and aggregate scores
- Holdout re-test mode: accept `dataset_id` directly, configurable `run_count` (default 3), configurable `agent_key` filter

### Claude's Discretion
- Evaluator selection ownership (experiment-runner vs upstream)
- Evaluator ID resolution strategy (create custom, reference built-in by name, or discover at runtime)
- Category overlay placement (in experiment-runner vs results-analyzer)
- Whether experiment-raw.json includes evaluator metadata, platform experiment IDs, and per-example text
- Holdout mode evaluator source (re-derive from role vs caller-provided)
- Holdout output file naming (overwrite experiment-raw.json vs separate file)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXPR-01 | Experiment-runner creates experiments via MCP `create_experiment` (task.type: "agent") with REST fallback | REST `POST /v2/experiments` verified in API reference. Body requires `key`, `dataset.id`, `task: { type: "agent", agents: [{ agent_key }] }`, `evaluators: [{ id }]`. User decision: REST-only (no MCP for experiments). |
| EXPR-02 | Experiment-runner uses agent `key` (not `orqai_id`) for experiment task configuration | Confirmed in MCP schema: `task.agents[].agent_key` is a string field. REST schema mirrors this. Agent `key` from YAML frontmatter is the correct identifier. |
| EXPR-03 | Experiment-runner resolves evaluator IDs (create custom via MCP or use built-in by name) | MCP `create_llm_eval` and `create_python_eval` tools verified. `search_entities` with `type: "experiment"` can discover existing evaluators. Built-in evaluators (function/LLM) may be referenceable by name -- needs runtime validation. REST `GET /v2/evaluators` lists all evaluators with IDs. |
| EXPR-04 | Experiment-runner executes 3 runs per agent with polling loop (adaptive 10-30s interval) | REST `POST /v2/experiments/{id}/run` triggers a run. MCP `list_experiment_runs` with `sheet_id` filter polls for completion. `get_experiment_run` exports full results as JSONL with evaluator scores. |
| EXPR-05 | Experiment-runner accepts `dataset_id` as direct input for holdout re-test mode | Architecture pattern: when `dataset_id` is provided directly, skip reading `dataset-prep.json` for that dataset. Same experiment creation flow, just different dataset ID source. |
| EXPR-06 | Experiment-runner writes `experiment-raw.json` with per-run per-evaluator raw scores | Output contract derived from tester.md Phase 7 raw score structure. Per-agent, per-run, per-evaluator scores with per-example breakdown. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Orq.ai REST API v2 | v2 | Experiment creation, run triggering, results retrieval | User decision: REST-only for experiments. Documented at `https://api.orq.ai/v2/` |
| Orq.ai MCP tools | Current | Evaluator creation (create_llm_eval, create_python_eval), entity search | MCP-first for non-experiment operations per project pattern |
| curl / fetch | N/A | HTTP client for REST calls | Subagent pattern uses Bash tool with curl for REST |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| MCP `search_entities` | Current | Discover existing evaluators by name | Before creating new evaluators -- check if they already exist |
| MCP `list_experiment_runs` | Current | Poll experiment run status | After triggering runs, poll until complete |
| MCP `get_experiment_run` | Current | Export run results as JSONL | After run completes, download full row data with scores |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| REST-only experiments | MCP `create_experiment` | MCP schema verified but user decision locks REST-only to reduce risk |
| MCP for run polling | REST `GET /v2/experiments/{id}/results` | MCP `list_experiment_runs` provides structured run manifests with cursor pagination; REST results endpoint less well-documented |

## Architecture Patterns

### Recommended Subagent Structure
```
experiment-runner.md
├── Phase 1: Read inputs (dataset-prep.json or direct dataset_id)
├── Phase 2: Resolve evaluators (role-based selection + ID resolution)
├── Phase 3: Create experiments (REST POST /v2/experiments per agent)
├── Phase 4: Execute runs (3x POST /v2/experiments/{id}/run + adaptive polling)
├── Phase 5: Export results (MCP get_experiment_run per run)
└── Phase 6: Write experiment-raw.json
```

### Pattern 1: REST Experiment Creation
**What:** Create experiment with agent task type pointing to the test dataset
**When to use:** For every agent in the test run
**Example:**
```bash
# Source: orq-agent/references/orqai-api-endpoints.md + MCP schema cross-reference
curl -s -X POST "https://api.orq.ai/v2/experiments" \
  -H "Authorization: Bearer $ORQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "test-{swarm}-{agent-key}",
    "dataset": { "id": "{test_dataset_id}" },
    "task": {
      "type": "agent",
      "agents": [{ "agent_key": "{agent_key}" }]
    },
    "evaluators": [
      { "id": "{evaluator_id_1}" },
      { "id": "{evaluator_id_2}" }
    ]
  }'
```

### Pattern 2: Adaptive Polling Loop
**What:** Poll for experiment run completion with backoff
**When to use:** After each `POST /v2/experiments/{id}/run`
**Example:**
```bash
# Adaptive polling: start 10s, back off to 30s, max 15 minutes
INTERVAL=10
MAX_INTERVAL=30
TIMEOUT=900
ELAPSED=0

while [ $ELAPSED -lt $TIMEOUT ]; do
  # Use MCP list_experiment_runs with sheet_id filter
  # Check run status in response
  # If complete: break
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
  INTERVAL=$((INTERVAL < MAX_INTERVAL ? INTERVAL + 5 : MAX_INTERVAL))
  echo "Agent {key} run {N}/3: polling... (${ELAPSED}s elapsed)"
done
```

### Pattern 3: Evaluator Resolution
**What:** Map role-based evaluator names to platform evaluator IDs
**When to use:** Before experiment creation
**Strategy (recommended):**
1. Use `GET /v2/evaluators` (REST) or `search_entities` (MCP, type not directly "evaluator" but can search) to list workspace evaluators
2. For built-in evaluators (json_validity, coherence, etc.): check if the platform accepts evaluator names directly in the `evaluators` array, or requires explicit IDs
3. For built-in evaluators needing IDs: list all evaluators, filter by name, extract ID
4. For custom evaluators: create via MCP `create_llm_eval` or `create_python_eval`, capture returned ID
5. Cache evaluator name->ID mapping for reuse across agents

### Pattern 4: Run Result Export
**What:** Download full per-row evaluator scores from a completed run
**When to use:** After polling confirms run completion
**Details:**
- MCP `get_experiment_run` takes `experiment_id` + `run_id`, returns a signed download URL
- Export format: JSONL (default) or JSON or CSV
- JSONL contains per-row: inputs, outputs, evaluator scores, cost, latency
- Download the file content and parse for score extraction

### Anti-Patterns to Avoid
- **Do NOT use evaluatorq SDK:** Root cause of V2.1 restructure. Broken, replaced entirely by REST/MCP.
- **Do NOT install @orq-ai/node:** v4 dropped MCP binary, v3.14.45 doesn't exist on npm. Use raw REST.
- **Do NOT create experiments via MCP:** User decision -- REST-only for experiments to reduce risk.
- **Do NOT apply thresholds:** Raw scores only. Results-analyzer (Phase 28) owns pass/fail.
- **Do NOT run agents in parallel:** Sequential per-agent execution to respect rate limits.
- **Do NOT compute aggregation:** Experiment-runner writes raw per-run scores. Results-analyzer computes median, variance, CI.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Evaluator scoring | Custom scoring logic | Orq.ai platform evaluators | Platform handles LLM-as-judge, function evaluators natively in experiment runs |
| Run result parsing | Custom result polling | MCP `get_experiment_run` export | Returns structured JSONL with all scores, inputs, outputs per row |
| Experiment status tracking | Custom status state machine | MCP `list_experiment_runs` polling | Provides run manifests with status, sorted newest-first |
| Evaluator ID lookup | Hardcoded evaluator IDs | REST `GET /v2/evaluators` list-and-filter | IDs may change across workspaces; always resolve at runtime |

**Key insight:** The Orq.ai platform runs evaluators server-side during experiment execution. The experiment-runner just needs to create the experiment with the right evaluator IDs, trigger runs, and download results. No local scoring needed.

## Common Pitfalls

### Pitfall 1: Evaluator ID vs Name Confusion
**What goes wrong:** Passing evaluator names (e.g., "coherence") instead of evaluator IDs to the experiment `evaluators` array, causing 422 validation errors.
**Why it happens:** The `create_experiment` schema requires `evaluators: [{ id: string }]` -- an actual platform ID, not a human-readable name.
**How to avoid:** Always resolve evaluator names to IDs via `GET /v2/evaluators` before experiment creation. Cache the mapping.
**Warning signs:** 422 errors on experiment creation mentioning evaluator validation.

### Pitfall 2: Experiment Key Uniqueness
**What goes wrong:** Re-using an experiment key that already exists, getting a 409 or unexpected behavior.
**Why it happens:** Experiment keys must be unique. Re-running tests with the same swarm/agent creates collisions.
**How to avoid:** Include a timestamp or run ID in the experiment key: `test-{swarm}-{agent}-{timestamp}`. Or check if experiment exists first via `search_entities` and reuse/update.
**Warning signs:** 409 Conflict responses on experiment creation.

### Pitfall 3: Polling Too Aggressively
**What goes wrong:** Hitting rate limits (429) during polling, slowing down the entire test run.
**Why it happens:** Fixed short intervals without backoff.
**How to avoid:** Adaptive polling (10s -> 30s backoff as decided). Respect Retry-After headers.
**Warning signs:** 429 responses during polling phase.

### Pitfall 4: Run Not Completing (Hung Experiment)
**What goes wrong:** Experiment run stays in "running" state indefinitely, blocking the pipeline.
**Why it happens:** Platform issues, malformed dataset rows (the original root cause with missing `messages` field -- fixed in Phase 26).
**How to avoid:** 15-minute hard timeout per experiment. If exceeded, declare the experiment hung, log the error, continue to next agent.
**Warning signs:** Polling duration exceeding 5 minutes for a small dataset.

### Pitfall 5: get_experiment_run Returns Download URL, Not Data
**What goes wrong:** Treating the MCP response as containing inline results when it actually returns a signed URL.
**Why it happens:** The MCP tool description says "return a signed download URL" -- the data must be fetched separately.
**How to avoid:** After calling `get_experiment_run`, fetch the signed URL to download the actual JSONL/JSON data. Parse the downloaded file for scores.
**Warning signs:** Response contains a URL string instead of result objects.

### Pitfall 6: Evaluator Scores in Export May Use Different Keys
**What goes wrong:** Assuming evaluator names in the export match the names used during creation.
**Why it happens:** Platform may use evaluator IDs or display names in the export format.
**How to avoid:** When parsing export JSONL, map evaluator columns back to known evaluator names using the ID mapping built during resolution.
**Warning signs:** Score columns in export don't match expected evaluator names.

## Code Examples

### Experiment Creation (REST)
```bash
# Source: orq-agent/references/orqai-api-endpoints.md
RESPONSE=$(curl -s -X POST "https://api.orq.ai/v2/experiments" \
  -H "Authorization: Bearer $ORQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"key\": \"test-${SWARM_NAME}-${AGENT_KEY}-$(date +%s)\",
    \"dataset\": { \"id\": \"${TEST_DATASET_ID}\" },
    \"task\": {
      \"type\": \"agent\",
      \"agents\": [{ \"agent_key\": \"${AGENT_KEY}\" }]
    },
    \"evaluators\": ${EVALUATOR_IDS_JSON}
  }")
EXPERIMENT_ID=$(echo "$RESPONSE" | jq -r '.id')
```

### Triggering a Run (REST)
```bash
# Source: orq-agent/references/orqai-api-endpoints.md
RUN_RESPONSE=$(curl -s -X POST "https://api.orq.ai/v2/experiments/${EXPERIMENT_ID}/run" \
  -H "Authorization: Bearer $ORQ_API_KEY" \
  -H "Content-Type: application/json")
```

### Evaluator Listing (REST)
```bash
# Source: orq-agent/references/orqai-api-endpoints.md
EVALUATORS=$(curl -s "https://api.orq.ai/v2/evaluators?limit=200" \
  -H "Authorization: Bearer $ORQ_API_KEY")
# Filter by name to get ID
EVAL_ID=$(echo "$EVALUATORS" | jq -r '.data[] | select(.name == "coherence") | .id')
```

### Role-Based Evaluator Selection (from tester.md Phase 6)
```
Structural: json_validity, exactness, instruction_following
Conversational: coherence, helpfulness, relevance, instruction_following
Hybrid: union of both (deduplicated)
Category overlays (adversarial/edge-case): +toxicity, +harmfulness
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| evaluatorq SDK (`@orq-ai/evaluatorq`) | REST API + MCP tools | V2.1 restructure (now) | Root cause fix: evaluatorq caused experiment timeouts |
| @orq-ai/node SDK for datasets | Raw REST via curl | V2.1 Phase 26 | SDK v4 dropped MCP binary, v3.14.45 doesn't exist |
| Monolithic tester.md (771 lines) | dataset-preparer + experiment-runner + results-analyzer | V2.1 restructure | Better separation of concerns, intermediate JSON contracts |
| Local evaluator scoring | Platform-side evaluation | V2.1 | Orq.ai runs evaluators server-side during experiments |

**Deprecated/outdated:**
- `@orq-ai/evaluatorq`: Broken, causes timeouts. Replaced by REST experiment API.
- `@orq-ai/node@^3.14.45`: Does not exist on npm. Do not install.
- `agents.invoke()`: Deprecated SDK method. Use `agents.responses.create()` if SDK is used (but prefer REST).

## Open Questions

1. **Built-in evaluator ID format**
   - What we know: `create_experiment` requires `evaluators: [{ id: string }]`. Built-in evaluators exist on the platform.
   - What's unclear: Whether built-in evaluators (coherence, json_validity, etc.) have stable IDs that can be discovered via `GET /v2/evaluators`, or if they need to be created as custom evaluators first.
   - Recommendation: At runtime, call `GET /v2/evaluators?limit=200` and search for built-in names. If not found, the evaluators may need to be created. Flag this as a runtime validation step in Phase 1 of the subagent.

2. **Run trigger response schema**
   - What we know: `POST /v2/experiments/{id}/run` triggers a run.
   - What's unclear: Whether the response includes a `run_id` directly, or if we need to poll `list_experiment_runs` to discover the new run ID.
   - Recommendation: Try parsing `run_id` from the response. Fall back to polling `list_experiment_runs` with `sheet_id` filter and taking the newest run.

3. **get_experiment_run export content structure**
   - What we know: Returns a signed download URL for JSONL with "inputs, outputs, evaluator scores, cost, and latency."
   - What's unclear: Exact JSONL row schema -- field names for evaluator scores, how per-example scores are keyed.
   - Recommendation: Export one run during implementation, log the JSONL structure, and adapt the parser accordingly. This is a runtime discovery step.

4. **Evaluator selection ownership**
   - What we know: Tester.md Phase 6 has proven role->evaluator mapping logic. Dataset-preparer already infers role.
   - Recommendation (Claude's discretion): Experiment-runner owns evaluator selection. It reads `role` from `dataset-prep.json` and applies the role->evaluator mapping from tester.md Phase 6. This keeps experiment-runner self-contained and avoids adding evaluator logic to dataset-preparer.

5. **Category overlay placement**
   - What we know: Adversarial/edge-case examples need additional evaluators (toxicity, harmfulness).
   - Recommendation (Claude's discretion): Defer category overlays to results-analyzer (Phase 28). Experiment-runner attaches ALL evaluators (base + overlay) to every experiment. Results-analyzer slices scores by category from `inputs.category` metadata. This simplifies experiment creation (one evaluator set per agent, not per category).

6. **Holdout output naming**
   - Recommendation (Claude's discretion): Write to `experiment-raw-holdout.json` for holdout re-test mode, keeping `experiment-raw.json` for the primary test run. Results-analyzer can detect which file is present.

## Discretion Recommendations

Based on research, here are recommendations for areas marked as Claude's discretion:

| Area | Recommendation | Rationale |
|------|---------------|-----------|
| Evaluator selection ownership | Experiment-runner owns it | Reads `role` from dataset-prep.json, applies tester.md Phase 6 mapping. Self-contained. |
| Evaluator ID resolution | List-and-filter via REST `GET /v2/evaluators` | Discover built-in evaluator IDs at runtime. Create custom only if built-in not found. |
| Category overlay placement | All evaluators on every experiment; results-analyzer slices by category | Simpler experiment creation. Category metadata in `inputs.category` enables downstream slicing. |
| experiment-raw.json metadata | Include evaluator metadata, platform experiment IDs, per-example text | Zero token cost (written to disk). Helps debugging and downstream analysis. |
| Holdout evaluator source | Re-derive from role (read dataset-prep.json for role, apply same mapping) | Consistent logic. Caller doesn't need to know evaluator details. |
| Holdout output naming | `experiment-raw-holdout.json` (separate file) | Avoids overwriting primary test results. Results-analyzer detects which file to read. |

## Sources

### Primary (HIGH confidence)
- MCP `create_experiment` tool schema -- verified via ToolSearch, full JSON schema inspected
- MCP `create_llm_eval` tool schema -- verified via ToolSearch
- MCP `create_python_eval` tool schema -- verified via ToolSearch
- MCP `list_experiment_runs` tool schema -- verified via ToolSearch (sheet_id filter, cursor pagination)
- MCP `get_experiment_run` tool schema -- verified via ToolSearch (signed download URL, JSONL/JSON/CSV formats)
- MCP `search_entities` tool schema -- verified via ToolSearch (supports experiment, dataset, agent types)
- `orq-agent/references/orqai-api-endpoints.md` -- REST endpoint reference
- `orq-agent/references/orqai-evaluator-types.md` -- Full evaluator catalog (19 function, 10 LLM, 12 RAGAS, 4 custom)
- `orq-agent/agents/tester.md` Phase 6-7 -- Proven evaluator selection and experiment execution patterns
- `orq-agent/agents/dataset-preparer.md` -- Upstream subagent, defines dataset-prep.json contract
- `orq-agent/templates/test-results.json` -- Downstream output schema (consumed by results-analyzer)

### Secondary (MEDIUM confidence)
- `orq-agent/references/orqai-api-endpoints.md` experiment endpoints -- paths documented but request/response body schemas not fully specified in reference
- Evaluator ID resolution via `GET /v2/evaluators` -- endpoint exists in reference but response schema not documented in detail

### Tertiary (LOW confidence)
- Whether `POST /v2/experiments/{id}/run` returns run_id in response -- needs runtime validation
- Whether built-in evaluators appear in `GET /v2/evaluators` list -- needs runtime validation
- Exact JSONL export schema from `get_experiment_run` -- needs runtime validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - REST endpoints documented, MCP schemas verified via ToolSearch
- Architecture: HIGH - Follows established subagent pattern from dataset-preparer, tester.md provides proven logic
- Pitfalls: HIGH - Root causes well-understood from V2.1 restructure context and STATE.md blockers

**Research date:** 2026-03-11
**Valid until:** 2026-04-10 (30 days -- Orq.ai API is stable)
