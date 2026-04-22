# Phase 26: Dataset Preparer - Research

**Researched:** 2026-03-10
**Domain:** Dataset transformation, Orq.ai dataset/datapoint APIs, stratified splitting, agent role inference
**Confidence:** MEDIUM-HIGH

## Summary

Phase 26 extracts dataset preparation logic from the monolithic tester.md (771 lines) into a focused ~250-line subagent. The dataset-preparer reads existing V1.0 markdown datasets (clean + edge), augments to 30+ examples using 4 proven techniques, splits 60/20/20 stratified by category, and uploads to Orq.ai with the correct `messages` field format. It produces a `dataset-prep.json` handoff contract consumed by downstream subagents.

The primary technical risk is row format: experiment timeouts are caused by missing `messages` field in datapoints. The MCP `create_datapoints` tool schema accepts only `inputs` (object) and `expected_output` (string) -- it does NOT expose a `messages` field. This means the `messages` field must be placed inside `inputs` when using MCP, or REST must be used to include `messages` as a top-level field. A smoke test (upload 1 row, run mini-experiment) is the mitigation to catch format issues before full upload.

**Primary recommendation:** Use MCP `create_dataset` for dataset creation and REST `POST /v2/datasets/{dataset_id}/rows` for datapoint upload (to guarantee `messages` as a top-level field). Smoke-test 1 row before bulk upload.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Each datapoint MUST include `messages: [{role: "user", content: input_text}]` as a top-level field -- this is the confirmed root cause of experiment timeouts
- Each datapoint MUST include `expected_output` as a top-level field -- evaluators need reference responses for scoring
- Smoke test required: Before uploading the full dataset, upload 1 row and run a mini-experiment to verify non-null evaluator scores
- dataset-prep.json lives in the swarm output directory (alongside test-results.json)
- Per-agent status values: `ready`, `skipped`, `error`
- Dataset-preparer infers agent role (structural/conversational/hybrid) from spec content and includes `role` field per agent (DATA-04)
- Include split counts per agent: `example_counts: { original, augmented, total, per_split: { train, test, holdout } }`
- Include per-agent dataset IDs: `test_dataset_id`, `train_dataset_id`, `holdout_dataset_id`
- Replicate the 4 augmentation techniques from current tester.md exactly: parameter swaps, complexity variations, format variations, rephrasings
- Upload all 3 splits (train, test, holdout) to Orq.ai
- Dataset-preparer handles deployment pre-check (verify agents have `orqai_id` in YAML frontmatter)
- Dataset-preparer accepts optional agent-key filter parameter
- Do NOT record which channel (MCP vs REST) was used -- just make it work

### Claude's Discretion
- MCP-first vs REST-only approach for dataset operations
- Fallback detection scope (per-operation vs session-level)
- REST client implementation (raw fetch vs SDK)
- Where to store category/source/eval_id metadata relative to Orq.ai platform
- Smoke test agent selection strategy
- Internal code structure and error handling patterns

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | Dataset-preparer uploads datapoints with required `messages` field (`[{role: "user", content: input}]`) | MCP `create_datapoints` lacks `messages` field in schema; REST `POST /v2/datasets/{id}/rows` supports arbitrary JSON fields. Recommendation: use REST for row upload. Smoke test validates format. |
| DATA-02 | Dataset-preparer uses MCP `create_dataset`/`create_datapoints` with REST fallback | MCP tools verified: `create_dataset(display_name, path)` and `create_datapoints(dataset_id, datapoints[])`. REST endpoints: `POST /v2/datasets` and `POST /v2/datasets/{id}/rows`. MCP-first for dataset creation, REST-preferred for rows due to `messages` field gap. |
| DATA-03 | Dataset-preparer parses markdown eval pairs, augments to 30+, splits 60/20/20 stratified | Parsing logic documented in tester.md Phase 2. Augmentation techniques in Phase 3. Stratified split in Phase 4. All proven and extractable. |
| DATA-04 | Dataset-preparer infers agent role (structural/conversational/hybrid) from spec content | Role inference heuristics documented in tester.md Phase 6.1. Keyword matching with frontmatter override (`test_role` field). |
| DATA-05 | Dataset-preparer writes `dataset-prep.json` with per-agent dataset IDs and role | Contract structure derived from test-results.json template `per_agent_datasets` section plus new `role` and `status` fields. |
</phase_requirements>

## Standard Stack

### Core
| Library/Tool | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| MCP `create_dataset` | Live server | Create datasets on Orq.ai | Confirmed available; accepts `display_name` and `path` |
| MCP `create_datapoints` | Live server | Create datapoints (limited: no `messages` field) | Available but schema incomplete for experiment needs |
| REST `POST /v2/datasets` | v2 | Create datasets (fallback) | Documented in orqai-api-endpoints.md |
| REST `POST /v2/datasets/{id}/rows` | v2 | Upload rows with full field support | Supports arbitrary JSON including `messages` top-level field |
| MCP `create_experiment` | Live server | Smoke test experiment creation | Confirmed: `task.type: "agent"` with `agents[].agent_key` |

### Supporting
| Library/Tool | Purpose | When to Use |
|-------------|---------|-------------|
| `curl` / `fetch` via Bash | REST API calls | When MCP is unavailable or for row uploads requiring `messages` |
| YAML frontmatter parsing | Read `orqai_id` and `key` from agent specs | Pre-check deployment verification |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| REST for rows | MCP `create_datapoints` only | MCP schema lacks `messages` field -- experiment engine needs it. REST is safer for rows. |
| `@orq-ai/node` SDK | Raw REST via curl/fetch | SDK v4 dropped MCP binary; v3.14.45 doesn't exist on npm. Raw REST avoids dependency risk. |
| Session-level MCP detection | Per-operation fallback | Per-operation is the established deployer pattern and more resilient. |

## Architecture Patterns

### Recommended Agent Structure
```
dataset-preparer.md (~250 lines)
├── Phase 1: Pre-check Deployment       # Verify orqai_id in frontmatter
├── Phase 2: Parse V1.0 Datasets        # Markdown table parsing
├── Phase 3: Augment to 30+ Examples    # 4 augmentation techniques
├── Phase 4: Merge and Split            # 60/20/20 stratified
├── Phase 5: Smoke Test                 # Upload 1 row, run mini-experiment
├── Phase 6: Upload Datasets            # MCP/REST upload all splits
├── Phase 7: Infer Agent Roles          # Structural/conversational/hybrid
└── Phase 8: Write dataset-prep.json    # Handoff contract
```

### Pattern 1: MCP-First with Selective REST Override
**What:** Use MCP for dataset creation, REST for datapoint upload
**When to use:** When MCP tool schema is incomplete for required fields
**Rationale:** The MCP `create_datapoints` schema only accepts `inputs` (object) and `expected_output` (string). The `messages` field required by the experiment engine is NOT in the MCP schema. Using REST for row upload guarantees the correct format.

```
Dataset creation: MCP create_dataset → REST fallback
Row upload: REST POST /v2/datasets/{id}/rows (preferred)
  → MCP create_datapoints fallback (if REST fails, but messages may be missing)
Smoke test: MCP create_experiment (task.type: "agent")
```

### Pattern 2: Smoke Test Before Bulk Upload
**What:** Upload 1 datapoint, create a mini-experiment, verify non-null scores
**When to use:** Always -- before uploading the full dataset
**Why:** Catches the exact row format issue (missing `messages`) that caused experiment timeouts. Fail fast.

```
1. Create smoke-test dataset via MCP/REST
2. Upload 1 representative row with messages field
3. Create experiment via MCP create_experiment:
   - task.type: "agent"
   - agents: [{ agent_key: first_agent_key }]
   - dataset.id: smoke_dataset_id
   - auto_run: true
4. Poll for results (MCP get_experiment_run or REST)
5. Verify evaluator scores are non-null
6. Delete smoke dataset (MCP delete_dataset)
7. If scores are null → ABORT with clear error about row format
```

### Pattern 3: Stratified Split Implementation
**What:** Group by category, shuffle within groups, split proportionally
**When to use:** Phase 4 -- after merging clean + edge + augmented examples

```
1. Group examples by category (6 categories)
2. For each category:
   a. Shuffle examples randomly
   b. Assign 60% to train, 20% to test, 20% to holdout
   c. Round up for test/holdout on odd counts
3. Validate: each split has roughly proportional category distribution
```

### Pattern 4: dataset-prep.json Contract
**What:** JSON handoff file consumed by experiment-runner (Phase 27) and results-analyzer (Phase 28)

```json
{
  "swarm_name": "example-swarm",
  "prepared_at": "2026-03-10T12:00:00Z",
  "agents": {
    "agent-key-1": {
      "status": "ready",
      "role": "structural",
      "test_dataset_id": "ulid-1",
      "train_dataset_id": "ulid-2",
      "holdout_dataset_id": "ulid-3",
      "example_counts": {
        "original": 18,
        "augmented": 14,
        "total": 32,
        "per_split": { "train": 19, "test": 7, "holdout": 6 }
      }
    },
    "agent-key-2": {
      "status": "skipped",
      "role": null,
      "reason": "No dataset files found"
    }
  }
}
```

### Anti-Patterns to Avoid
- **Installing `@orq-ai/node@latest`:** v4 dropped MCP binary. v3.14.45 doesn't exist on npm. Use raw REST instead.
- **Parallel dataset uploads:** Sequential to respect rate limits. Parallel risks 429 errors.
- **Putting `messages` inside `inputs`:** The experiment engine reads `messages` as a top-level field on the datapoint, not nested inside `inputs`.
- **Skipping smoke test:** The exact failure mode (null evaluator scores from missing `messages`) is silent -- experiments complete but produce unusable results.
- **Copying expected outputs for augmented examples:** Each augmented example needs an adapted expected output reflecting the specific input changes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dataset creation | Custom HTTP client wrapper | MCP `create_dataset` + REST fallback | MCP handles auth, retries; REST is well-documented |
| Experiment execution for smoke test | Manual agent invocation + scoring | MCP `create_experiment` with `auto_run: true` | Platform handles the full pipeline |
| Row format validation | Manual field checking | Smoke test with real experiment | Only way to verify the platform actually processes the format correctly |
| Markdown table parsing | Regex-only parsing | Line-by-line split on `|` with trim | Proven approach from tester.md Phase 2.2 |

**Key insight:** The row format issue is a platform-side behavior that cannot be validated locally. Only a smoke test with a real experiment run confirms correctness.

## Common Pitfalls

### Pitfall 1: MCP `create_datapoints` Missing `messages` Field
**What goes wrong:** Datapoints uploaded via MCP lack the `messages` top-level field. Experiments run but produce null evaluator scores (timeouts).
**Why it happens:** MCP `create_datapoints` schema only exposes `inputs` (object) and `expected_output` (string). No `messages` property.
**How to avoid:** Use REST `POST /v2/datasets/{id}/rows` for row upload. Include `messages: [{role: "user", content: input_text}]` as a top-level field in the JSON body.
**Warning signs:** Experiment completes but all evaluator scores are null or 0.

### Pitfall 2: `@orq-ai/node` SDK Version Confusion
**What goes wrong:** Installing `@orq-ai/node@latest` gets v4 which dropped the MCP server binary. Pinning `^3.14.45` fails because that version doesn't exist on npm.
**Why it happens:** Major version bump removed MCP functionality; the pinned version was never published.
**How to avoid:** Don't use the SDK at all. Use raw REST API calls via curl/fetch for dataset operations.
**Warning signs:** `npm install` warnings or failures; MCP server binary not found.

### Pitfall 3: Non-Stratified Split
**What goes wrong:** Random splitting without stratification puts all adversarial examples in one split, leaving test split without edge case coverage.
**Why it happens:** Naive shuffle-and-slice ignores category distribution.
**How to avoid:** Group by category first, then split within each group proportionally.
**Warning signs:** One split has 0 examples of a category while another has all of them.

### Pitfall 4: Augmented Example Quality
**What goes wrong:** Augmented examples are near-duplicates or have copy-pasted expected outputs that don't match the modified input.
**Why it happens:** Rushing augmentation to hit the 30-example minimum.
**How to avoid:** Each augmented example must have an adapted expected output. Verify category distribution isn't all in one bucket.
**Warning signs:** Many examples with identical expected outputs despite different inputs.

### Pitfall 5: Smoke Test Agent Selection
**What goes wrong:** Smoke test uses an agent that's unavailable or has unusual configuration, causing false failures.
**Why it happens:** Picking an arbitrary agent without checking deployment status.
**How to avoid:** Use the first agent that passes the pre-check (has `orqai_id` in frontmatter). If using agent-key filter, smoke test with that specific agent.
**Warning signs:** Smoke test fails but full upload would succeed with a different agent.

### Pitfall 6: Race Condition on Experiment Results
**What goes wrong:** Polling for smoke test results too early returns incomplete/empty results.
**Why it happens:** Experiment execution is async; results need time to populate.
**How to avoid:** Poll with adaptive interval (start at 10s, back off to 30s). Check for non-null scores, not just completion status.
**Warning signs:** First poll returns empty scores array.

## Code Examples

### MCP create_dataset Call
```
Tool: mcp__orqai-mcp__create_dataset
Parameters:
  display_name: "test-{swarm_name}-{agent_key}-test"
  path: "/"
```
Returns: dataset object with `id` field (ULID).

### MCP create_datapoints Call (limited -- no messages field)
```
Tool: mcp__orqai-mcp__create_datapoints
Parameters:
  dataset_id: "{dataset_id}"
  datapoints: [
    {
      "inputs": {
        "text": "How do I return a product?",
        "category": "happy-path",
        "source": "original",
        "eval_id": "E-01"
      },
      "expected_output": "To return a product..."
    }
  ]
```
Note: maxItems is 100 per call. Does NOT support `messages` field.

### REST Row Upload (preferred for datapoints)
```bash
curl -X POST "https://api.orq.ai/v2/datasets/{dataset_id}/rows" \
  -H "Authorization: Bearer $ORQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "text": "How do I return a product?",
      "category": "happy-path",
      "source": "original",
      "eval_id": "E-01"
    },
    "messages": [
      { "role": "user", "content": "How do I return a product?" }
    ],
    "expected_output": "To return a product..."
  }'
```

### MCP create_experiment for Smoke Test
```
Tool: mcp__orqai-mcp__create_experiment
Parameters:
  experiment:
    key: "smoke-{swarm_name}-{agent_key}"
    dataset:
      id: "{smoke_dataset_id}"
    task:
      type: "agent"
      agents:
        - agent_key: "{agent_key}"
  auto_run: true
```

### Markdown Table Parsing (from tester.md Phase 2.2)
```
1. Find "## Eval Pairs" heading (or "## Adversarial Test Cases" for edge datasets)
2. Read lines until next "##" or EOF
3. Split each row by "|" delimiter
4. Trim whitespace from each cell
5. Skip header row and separator line (contains "---")
6. Extract: ID, Input, Expected Output, Pass Criteria
```

### Role Inference Heuristics (from tester.md Phase 6.1)
```
Structural signals: JSON output, schema, structured data, extraction, formatting, parsing, json_schema tool type
Conversational signals: conversation, chat, support, explanation, advice, natural language
Hybrid: both structural AND conversational signals present
Override: test_role field in YAML frontmatter takes precedence
Default: hybrid (safest -- gets union of evaluators)
```

### Dataset Naming Convention
```
test-{SWARM_NAME}-{AGENT_KEY}-{split}
  where split = train | test | holdout
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@orq-ai/evaluatorq` SDK for experiments | MCP `create_experiment` (task.type: "agent") | V2.1 | Eliminates SDK dependency; direct platform experiment API |
| SDK-based dataset upload | REST API with `messages` field | V2.1 | Fixes root cause of experiment timeouts |
| Monolithic tester.md (771 lines) | Separate dataset-preparer (~250 lines) | V2.1 | Single responsibility; JSON contract handoff |
| In-memory state passing | `dataset-prep.json` file handoff | V2.1 | Enables independent subagent execution |

**Deprecated/outdated:**
- `@orq-ai/evaluatorq` SDK: Replaced by native MCP/REST experiment API
- `@orq-ai/node` v3.14.45: Version doesn't exist on npm; v4 removed MCP binary
- `evaluators` field in evaluatorq config: Replaced by experiment-level evaluator attachment

## Open Questions

1. **REST Row Upload -- Batch vs Individual**
   - What we know: REST endpoint is `POST /v2/datasets/{id}/rows`. Tester.md mentions "if a batch endpoint is available, use it."
   - What's unclear: Whether the endpoint accepts an array of rows or only one row per request.
   - Recommendation: Try sending an array first. If 422, fall back to individual row upload. Sequential either way for rate limit safety.

2. **MCP `create_datapoints` -- Does `inputs` Pass Through to Experiment Engine?**
   - What we know: MCP schema allows arbitrary key-value in `inputs`. Tester.md puts `text`, `category`, `source`, `eval_id` in `inputs`.
   - What's unclear: Whether putting `messages` inside `inputs` would be picked up by the experiment engine, or if it MUST be top-level.
   - Recommendation: Use REST for rows to guarantee top-level `messages`. The smoke test will validate whichever approach is used.

3. **Smoke Test Evaluator Selection**
   - What we know: Smoke test needs at least one evaluator to verify non-null scores. The `create_experiment` MCP tool accepts `evaluators[].id`.
   - What's unclear: Whether built-in evaluators (like `instruction_following`) can be referenced by name or need platform IDs.
   - Recommendation: Use the smoke test to also discover evaluator ID resolution. If name-based fails, this surfaces the issue early for Phase 27.

4. **MCP `create_dataset` -- `path` Parameter**
   - What we know: MCP `create_dataset` requires `display_name` and `path`.
   - What's unclear: What `path` means in the Orq.ai context (folder/namespace? file path?).
   - Recommendation: Try `"/"` as default path. If that fails, try `""` or the swarm name.

## Sources

### Primary (HIGH confidence)
- MCP tool schemas (live server): `create_dataset`, `create_datapoints`, `create_experiment`, `delete_dataset` -- directly inspected parameter schemas
- `orq-agent/agents/tester.md` -- proven implementation of Phases 1-6 (parsing, augmentation, splitting, upload, role inference)
- `orq-agent/references/orqai-api-endpoints.md` -- REST API endpoint reference
- `orq-agent/templates/dataset.md` -- V1.0 markdown dataset format
- `orq-agent/templates/test-results.json` -- output schema with `per_agent_datasets` structure
- `orq-agent/agents/dataset-generator.md` -- category taxonomy and dataset generation patterns

### Secondary (MEDIUM confidence)
- `orq-agent/agents/deployer.md` -- MCP-first/REST-fallback pattern, retry logic, per-operation fallback approach
- `.planning/phases/26-dataset-preparer/26-CONTEXT.md` -- user decisions from discussion phase

### Tertiary (LOW confidence)
- REST row upload batch capability -- not verified against live API; tester.md is ambiguous
- `path` parameter semantics for `create_dataset` MCP tool -- no documentation found
- Whether evaluator IDs are name-based or ULID-based for `create_experiment` -- needs live testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - MCP tool schemas directly inspected, REST endpoints documented
- Architecture: HIGH - Extracting proven logic from tester.md with clear phase boundaries
- Pitfalls: HIGH - Root cause of experiment timeouts confirmed (missing `messages` field); MCP schema gap verified
- Row format: MEDIUM - REST should support top-level `messages` but needs smoke test confirmation
- Evaluator integration: LOW - evaluator ID resolution for smoke test not verified

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable domain; MCP schema may evolve)
