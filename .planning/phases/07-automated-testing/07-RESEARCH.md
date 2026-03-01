# Phase 7: Automated Testing - Research

**Researched:** 2026-03-01
**Domain:** LLM evaluation pipelines, dataset management, experiment execution via Orq.ai platform
**Confidence:** MEDIUM

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dataset handling:**
- Auto-augment datasets to minimum 30 examples per agent when V1.0 output is insufficient (typical: 10-15 clean + 8-12 edge = 18-27)
- Augmented examples generated as variations (paraphrases, parameter swaps) and tagged with `source: augmented` so users can review/replace
- Clean and edge-case datasets merged into single dataset per agent with `category` field (happy-path, variation, boundary, adversarial) preserving granular scoring
- Train/test/holdout split at 60/20/20 ratio -- holdout reserved for Phase 8 iteration loop

**Evaluator selection:**
- Agent role (structural vs conversational) inferred from spec content (description, tools, model) with optional `test_role: structural|conversational|hybrid` frontmatter override
- Structural agents: Claude picks evaluators per agent based on what the agent does (e.g., extractor gets exactness, formatter gets json_schema, all get instruction_following)
- Conversational agents: all four LLM evaluators by default -- coherence + helpfulness + relevance + instruction_following
- Adversarial/edge-case examples additionally get safety evaluators (toxicity + harmfulness) on top of the agent's role-based evaluators

**Results presentation:**
- JSON is primary output (test-results.json) -- consumed programmatically by Phase 8 iteration loop
- Markdown output (test-results.md) for historical tracking and human review
- Terminal summary table displayed after test run completes
- Per-evaluator pass/fail thresholds (not a single global threshold) -- Claude sets sensible defaults per evaluator type (e.g., json_validity = 1.0, coherence = 0.7, instruction_following = 0.8)
- Worst-performing cases: bottom 3 per agent shown in detail (input, expected, actual, scores) plus total failure count
- Results sliced by category (happy-path, edge, adversarial) to reveal where agents struggle

**Test invocation:**
- `/orq-agent:test` tests all agents in swarm by default; `/orq-agent:test agent-key` tests single agent
- On individual agent failure: continue testing remaining agents, report everything at end
- Summary progress display: `Testing 5 agents... [####----] 3/5 complete` (not per-run verbose)
- Pre-check deployment before testing -- verify agents exist in Orq.ai, clear error message if not deployed

### Claude's Discretion

- Augmentation strategy details (which variation techniques to use)
- Exact evaluator selection heuristics for structural agents
- Per-evaluator threshold defaults (within the "sensible per-type" guideline)
- Terminal summary table formatting
- Error handling for API failures during experiment execution
- How to handle agents with no dataset files

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | User can upload V1.0-generated datasets to Orq.ai in platform format | Dataset API (`POST /v2/datasets`, `POST /v2/datasets/{id}/rows`), V1.0 markdown-to-row transformation, `@orq-ai/node` SDK `datasets.create()` and `datasets.createDatapoint()` |
| TEST-02 | Evaluators are auto-selected based on agent role (structural agents get schema validation, conversational agents get relevance + coherence) | Orq.ai evaluator taxonomy (40 built-in), role inference from spec content, evaluator-to-role mapping heuristics |
| TEST-03 | User can run experiments against deployed agents via evaluatorq SDK | `@orq-ai/evaluatorq` framework with `job()` + `evaluatorq()` pipeline, `invoke()` helper for calling deployed agents, `datasetId` for platform datasets |
| TEST-04 | Test results are presented as readable markdown with per-agent scores and worst-performing cases | Three output channels: test-results.json (Phase 8), test-results.md (human review), terminal summary table; existing template at `orq-agent/templates/test-results.json` |
| TEST-05 | Experiments run 3 times with median scores to handle non-deterministic outputs | Three `evaluatorq()` invocations per agent, median/variance/CI calculation, results aggregation pattern |

</phase_requirements>

## Summary

Phase 7 implements automated agent evaluation using two Orq.ai SDK packages: `@orq-ai/node` for dataset and resource management, and `@orq-ai/evaluatorq` for running evaluation jobs with parallel execution and platform result submission. The tester subagent (a `.md` natural-language agent, following the Phase 6 deployer pattern) transforms V1.0 markdown datasets into Orq.ai platform format, auto-selects evaluators based on agent role inference, executes experiments 3 times per agent for statistical robustness, and produces structured results in three output channels.

The core technical challenge is the dataset transformation pipeline: V1.0 datasets are markdown tables with eval pairs (input/expected-output/pass-criteria), which must be parsed, augmented to 30+ examples when insufficient, merged with category metadata, split 60/20/20, and uploaded as Orq.ai dataset rows containing `inputs`, `messages`, and `expected_output` fields. The evaluatorq framework handles experiment execution natively -- it accepts a `datasetId` to fetch platform datasets and an `invoke()` helper to call deployed agents, then runs evaluator scorers against the outputs.

The second challenge is evaluator auto-selection. With 40 built-in evaluators across three categories (function, LLM, RAGAS), the tester must map agent characteristics to appropriate evaluators without manual configuration. The locked decision uses a structural/conversational/hybrid classification inferred from spec content, with category-specific evaluator overlays for adversarial examples.

**Primary recommendation:** Build the tester as a subagent (`.md` file) that orchestrates `@orq-ai/node` SDK calls for dataset management and `@orq-ai/evaluatorq` for experiment execution, following the deployer subagent pattern from Phase 6.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@orq-ai/evaluatorq` | `^1.1.0` | Evaluation framework -- jobs, evaluators, parallel execution, platform result submission | Official Orq.ai evaluation SDK; handles experiment orchestration, OpenTelemetry tracing, and automatic result upload when `ORQ_API_KEY` is set |
| `@orq-ai/node` | `^3.14.45` | Dataset CRUD, agent execution, platform API client | Already pinned in project (Phase 6); provides `datasets.create()`, `datasets.createDatapoint()`, `agents.retrieve()` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@orq-ai/evaluators` | `^1.0.0` | Pre-built evaluator scorer functions (stringContains, cosineSimilarity) | For function-based evaluators that run locally without LLM calls |
| `@orq-ai/cli` | `^1.0.0` | CLI for discovering and running `.eval` files | Only if using file-based eval discovery pattern (optional) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@orq-ai/evaluatorq` | Direct REST API (`POST /v2/experiments`) | Evaluatorq provides job orchestration, parallel execution, progress tracking, and automatic result submission; REST API requires building all of this manually |
| Local evaluation | Platform-only evaluation | Local eval with evaluatorq + platform upload gives offline capability; platform-only requires connectivity for every run |

**Installation:**
```bash
npm install @orq-ai/evaluatorq @orq-ai/evaluators
# @orq-ai/node already installed from Phase 6
```

## Architecture Patterns

### Recommended Project Structure
```
orq-agent/
├── agents/
│   ├── deployer.md          # Phase 6 (exists)
│   └── tester.md            # Phase 7 (new subagent)
├── commands/
│   └── test.md              # Phase 7 (update existing stub)
├── templates/
│   └── test-results.json    # Phase 7 (exists, update schema)
├── references/
│   ├── orqai-evaluator-types.md   # (exists)
│   └── orqai-api-endpoints.md     # (exists)
└── lib/                     # Phase 7 (if needed for shared utilities)
```

### Pattern 1: Tester Subagent Architecture

**What:** The tester is a `.md` subagent file with natural-language instructions (same pattern as deployer.md). It receives the swarm directory path and orchestrates the full test pipeline.

**When to use:** Always -- this is the established project pattern. Subagents are invoked by commands and receive context from the command layer.

**Pipeline stages:**
```
1. Parse V1.0 datasets (markdown tables -> structured data)
2. Augment to 30+ examples if needed (variation generation)
3. Merge clean + edge datasets with category field
4. Split 60/20/20 (train/test/holdout)
5. Upload dataset to Orq.ai (POST /v2/datasets + POST /v2/datasets/{id}/rows)
6. Infer agent role (structural/conversational/hybrid)
7. Select evaluators based on role + category overlays
8. Execute experiments 3x per agent via evaluatorq
9. Aggregate results (median, variance, CI)
10. Write test-results.json + test-results.md
11. Display terminal summary
```

### Pattern 2: Dataset Transformation Pipeline

**What:** Transform V1.0 markdown dataset tables into Orq.ai platform row format.

**V1.0 markdown format (from dataset-generator.md):**
```markdown
## Eval Pairs

| ID | Input | Expected Output | Pass Criteria |
|----|-------|----------------|---------------|
| E-01 | [input] | [expected output] | [criteria list] |
```

**Orq.ai row format (from docs):**
```json
{
  "inputs": { "text": "[input from eval pair]" },
  "messages": [
    { "role": "user", "content": "[input from eval pair]" }
  ],
  "expected_output": "[expected output from eval pair]"
}
```

**Category metadata:** Add `category` field to each row's inputs for sliced scoring:
```json
{
  "inputs": {
    "text": "[input]",
    "category": "happy-path|variation|boundary|adversarial"
  },
  "messages": [...],
  "expected_output": "[expected]"
}
```

### Pattern 3: Evaluator Selection Matrix

**What:** Auto-select evaluators based on agent role classification.

**Role inference heuristics (Claude's discretion):**
- **Structural:** Agent spec mentions JSON output, schema, structured data, extraction, formatting, parsing, or has `json_schema` tool type
- **Conversational:** Agent spec mentions conversation, chat, support, explanation, advice, or natural language response
- **Hybrid:** Agent has both structured output requirements and conversational elements
- **Override:** `test_role: structural|conversational|hybrid` frontmatter in agent spec takes precedence

**Evaluator mapping:**

| Role | Base Evaluators | Why |
|------|----------------|-----|
| Structural | `json_validity` (or `json_schema` if schema available), `exactness`, `instruction_following` | Validates format correctness and content accuracy |
| Conversational | `coherence`, `helpfulness`, `relevance`, `instruction_following` | Validates quality of natural language responses |
| Hybrid | `instruction_following` + structural subset + conversational subset | Covers both dimensions |

**Category overlays (applied on top of role-based evaluators):**

| Category | Additional Evaluators |
|----------|----------------------|
| adversarial | `toxicity` (function), `harmfulness` (LLM) |
| edge-case | `toxicity`, `harmfulness` |
| happy-path, variation, boundary | none (base evaluators only) |

### Pattern 4: Triple-Run Median Aggregation

**What:** Execute each experiment 3 times and compute median scores for statistical robustness.

**Process:**
```
For each agent:
  For run in [1, 2, 3]:
    results[run] = await evaluatorq("test-{agent}-run-{run}", {
      data: { datasetId: platformDatasetId },
      jobs: [agentInvocationJob],
      evaluators: selectedEvaluators
    })

  For each evaluator:
    scores = [results[1][eval], results[2][eval], results[3][eval]]
    median = sorted(scores)[1]  // middle value of 3
    variance = sum((s - mean)^2) / n
    ci_95 = [median - 1.96*stddev, median + 1.96*stddev]
```

**Note:** With only 3 runs, the "median" is simply the middle value when sorted. Confidence intervals with n=3 are wide but still indicate stability. This is a pragmatic balance between cost and robustness.

### Pattern 5: MCP-First / REST-Fallback (inherited from Phase 6)

**What:** Every API operation attempts MCP first, falls back to REST on failure.

**Applies to:** Dataset create/upload, evaluator configuration, agent retrieval for pre-check. The deployer.md already implements this pattern -- the tester.md inherits it.

**Evaluatorq operations:** The evaluatorq SDK manages its own API calls for experiment execution and result submission (uses `ORQ_API_KEY` directly). MCP-first/REST-fallback applies only to dataset and evaluator management operations outside evaluatorq.

### Anti-Patterns to Avoid

- **Running evaluatorq in a single mega-experiment with all agents:** Run per-agent experiments so failures are isolated and results are per-agent. One agent's failure should not abort other agents' tests.
- **Creating platform evaluators for built-in types:** Built-in function/LLM/RAGAS evaluators are referenced by name in the evaluatorq SDK; they don't need to be created via `POST /v2/evaluators`. Custom evaluators (if needed) do require creation, but Phase 7 should use only built-in types.
- **Uploading augmented examples without tagging:** Every augmented example MUST have `source: augmented` in its metadata so users can distinguish original from generated examples.
- **Using holdout set during Phase 7:** The 20% holdout split is reserved for Phase 8 iteration loop. Phase 7 tests use only the test split. Train split is uploaded but not used in Phase 7 experiments.
- **Blocking on individual agent test failure:** Continue testing remaining agents. Report all results at the end (locked decision).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Experiment orchestration | Custom async job runner | `@orq-ai/evaluatorq` with `evaluatorq()` | Handles parallelism, progress tracking, error capture, OpenTelemetry tracing, and platform result submission |
| Agent invocation during tests | Direct REST calls to agent execute endpoint | `invoke()` helper from evaluatorq | Integrates with evaluatorq job pipeline, handles retries, captures traces |
| Evaluator scoring | Custom scoring functions | `@orq-ai/evaluators` pre-built scorers + evaluatorq built-in evaluators | Pre-built evaluators handle edge cases (Unicode, whitespace normalization, embedding model calls) |
| Dataset upload | Manual `fetch()` calls to REST API | `@orq-ai/node` SDK `datasets.create()` + `datasets.createDatapoint()` | SDK handles auth, pagination, error codes, retries |
| Markdown table parsing | Regex-based markdown parser | Line-by-line split on `|` with header detection | Markdown table parsing is simple enough (split rows by `|`, trim cells, skip header separator line) -- no library needed, but don't use complex regex |
| Statistical aggregation (median, variance, CI) | Statistics library | Inline calculation for n=3 | With only 3 values, median = sorted[1], variance and CI are trivial arithmetic -- no library needed |

**Key insight:** The evaluatorq SDK is purpose-built for this exact use case -- running evaluation jobs against Orq.ai platform datasets with multiple evaluators. Using it avoids reimplementing experiment orchestration, result collection, progress tracking, and platform integration.

## Common Pitfalls

### Pitfall 1: Dataset Row Format Mismatch
**What goes wrong:** Uploading rows with wrong field names or structure causes silent failures -- experiments run but evaluators score against empty/null values.
**Why it happens:** Orq.ai dataset rows expect specific field names (`inputs`, `messages`, `expected_output`) that don't map 1:1 to V1.0 markdown table columns.
**How to avoid:** Validate row structure before upload. Each row must have at minimum `inputs` (object with key-value pairs) and `expected_output` (string). The `messages` field (array of role/content objects) is needed for chat-style evaluations.
**Warning signs:** All evaluator scores return 0 or null; "expected_output not found" in evaluation traces.

### Pitfall 2: Augmentation Quality
**What goes wrong:** Auto-augmented examples are too similar to originals or introduce invalid test cases, inflating apparent dataset size without adding evaluation value.
**Why it happens:** Naive augmentation (simple word substitution, random paraphrasing) produces near-duplicates or semantically invalid examples.
**How to avoid:** Use meaningful variation techniques: parameter swaps (different values for same input pattern), complexity variations (simple vs. detailed inputs), format variations (terse vs. verbose phrasing). Tag all augmented examples with `source: augmented` and validate that expected outputs still make sense.
**Warning signs:** Augmented examples have >0.95 cosine similarity to originals; expected outputs are copy-pasted without adaptation.

### Pitfall 3: Evaluator Score Scale Mismatch
**What goes wrong:** Combining scores from different evaluator types (binary 0/1, continuous 0-1, LLM 1-5 scale) produces misleading aggregates.
**Why it happens:** Function evaluators score binary (0 or 1), similarity metrics score 0-1, LLM evaluators score 1-5. Averaging across these scales is meaningless.
**How to avoid:** Report per-evaluator scores separately (locked decision). Normalize to 0-1 only if absolutely needed for comparison. Set per-evaluator thresholds appropriate to their scale.
**Warning signs:** An agent "passes" with 0.6 average because json_validity (1.0) and coherence (0.2 on 0-1 scale from 1/5) are averaged.

### Pitfall 4: MCP Tool Name Mismatch for Datasets
**What goes wrong:** Attempting dataset operations via MCP using guessed tool names that don't exist on the MCP server.
**Why it happens:** Phase 6 validated MCP tool names for agents/tools CRUD, but dataset MCP tools may have different naming conventions or may not be exposed via MCP at all.
**How to avoid:** Use `@orq-ai/node` SDK for all dataset operations (REST-based). Reserve MCP-first pattern for agent operations where MCP tools are already validated. If dataset MCP tools are discovered at runtime, use them as a bonus.
**Warning signs:** MCP calls for dataset operations fail with "tool not found" errors.

### Pitfall 5: Holdout Data Leakage
**What goes wrong:** Using holdout split examples in Phase 7 testing means Phase 8 iteration loop has no clean validation set.
**Why it happens:** Developer uses all dataset examples for testing instead of respecting the 60/20/20 split.
**How to avoid:** Split BEFORE upload. Upload three separate datasets per agent (train, test, holdout) or one dataset with split metadata. Phase 7 experiments run ONLY against the test split dataset.
**Warning signs:** Phase 8 iteration shows suspiciously high scores on "holdout" set because those examples were already seen during Phase 7 testing.

### Pitfall 6: Rate Limiting During Triple-Run Execution
**What goes wrong:** Running 3 experiments per agent * N agents in quick succession triggers Orq.ai API rate limits (429 responses).
**Why it happens:** Each experiment invokes the agent for every test example, generating many API calls in parallel.
**How to avoid:** Use evaluatorq's built-in `parallelism` configuration to control concurrency. Add delay between experiment runs. Respect `Retry-After` headers (same pattern as deployer).
**Warning signs:** Intermittent 429 errors, experiments partially complete, inconsistent scores across runs due to dropped requests.

## Code Examples

### Dataset Transformation (V1.0 Markdown to Orq.ai Row)

```typescript
// Source: derived from V1.0 dataset template + Orq.ai dataset docs
// Confidence: MEDIUM - row schema confirmed via docs, exact field mapping needs runtime validation

interface V1EvalPair {
  id: string;
  input: string;
  expectedOutput: string;
  passCriteria: string;
  category: "happy-path" | "variation" | "boundary" | "adversarial" | "edge-case";
  source?: "original" | "augmented";
}

interface OrqDatasetRow {
  inputs: {
    text: string;
    category: string;
    source: string;
    eval_id: string;
  };
  messages: Array<{ role: string; content: string }>;
  expected_output: string;
}

function transformToOrqRow(pair: V1EvalPair): OrqDatasetRow {
  return {
    inputs: {
      text: pair.input,
      category: pair.category,
      source: pair.source || "original",
      eval_id: pair.id,
    },
    messages: [
      { role: "user", content: pair.input }
    ],
    expected_output: pair.expectedOutput,
  };
}
```

### Evaluator Selection Logic

```typescript
// Source: CONTEXT.md locked decisions + evaluator reference
// Confidence: MEDIUM - evaluator names confirmed via docs, selection heuristics are Claude's discretion

interface EvaluatorConfig {
  name: string;
  threshold: number;
  scale: "binary" | "continuous-01" | "continuous-15";
}

function selectEvaluators(
  agentRole: "structural" | "conversational" | "hybrid",
  category: string
): EvaluatorConfig[] {
  const base: EvaluatorConfig[] = [];

  // Role-based base evaluators
  if (agentRole === "structural" || agentRole === "hybrid") {
    base.push(
      { name: "json_validity", threshold: 1.0, scale: "binary" },
      { name: "exactness", threshold: 0.8, scale: "binary" },
      { name: "instruction_following", threshold: 0.8, scale: "continuous-15" },
    );
  }
  if (agentRole === "conversational" || agentRole === "hybrid") {
    base.push(
      { name: "coherence", threshold: 0.7, scale: "continuous-15" },
      { name: "helpfulness", threshold: 0.7, scale: "continuous-15" },
      { name: "relevance", threshold: 0.7, scale: "continuous-15" },
      { name: "instruction_following", threshold: 0.8, scale: "continuous-15" },
    );
  }

  // Category overlays for adversarial/edge examples
  if (category === "adversarial" || category === "edge-case") {
    base.push(
      { name: "toxicity", threshold: 0.1, scale: "continuous-01" }, // lower is better
      { name: "harmfulness", threshold: 0.0, scale: "binary" },     // 0 = not harmful
    );
  }

  // Deduplicate (instruction_following may appear twice for hybrid)
  return [...new Map(base.map(e => [e.name, e])).values()];
}
```

### Evaluatorq Experiment Execution

```typescript
// Source: @orq-ai/evaluatorq GitHub README + orqkit monorepo
// Confidence: MEDIUM - API surface confirmed, exact parameter names need runtime validation

import { evaluatorq, job } from "@orq-ai/evaluatorq";

const agentJob = job("invoke-agent", async (data) => {
  // invoke() calls the deployed Orq.ai agent
  const response = await invoke({
    deploymentKey: agentKey,
    inputs: data.inputs,
    messages: data.messages,
  });
  return response.output;
});

// Single experiment run
const results = await evaluatorq(`test-${agentKey}-run-${runNumber}`, {
  data: { datasetId: testSplitDatasetId },
  jobs: [agentJob],
  evaluators: selectedEvaluators.map(e => ({
    name: e.name,
    scorer: async ({ output, expected }) => {
      // Built-in evaluators handle scoring
      // Custom threshold checking happens post-run
      return { value: score, pass: score >= e.threshold };
    }
  })),
});
```

### Triple-Run Median Aggregation

```typescript
// Source: mathematical definition, project decisions
// Confidence: HIGH - pure math, no external dependencies

interface RunResult {
  evaluator: string;
  scores: number[];
}

function aggregateTripleRun(runs: number[]): {
  median: number;
  variance: number;
  confidence_interval: [number, number];
} {
  const sorted = [...runs].sort((a, b) => a - b);
  const median = sorted[1]; // middle of 3
  const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
  const variance = runs.reduce((a, b) => a + (b - mean) ** 2, 0) / runs.length;
  const stddev = Math.sqrt(variance);
  // 95% CI approximation (note: n=3 makes this very rough)
  const ci: [number, number] = [
    Math.max(0, median - 1.96 * stddev),
    Math.min(1, median + 1.96 * stddev), // cap depends on evaluator scale
  ];
  return { median, variance, confidence_interval: ci };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual evaluation via Studio playground | Programmatic evaluation via evaluatorq SDK | 2025 (evaluatorq v1.0+) | Enables automated CI/CD-style testing |
| Single-run experiments | Triple-run with median (project decision) | Phase 7 | Statistical robustness for non-deterministic outputs |
| Global pass/fail threshold | Per-evaluator thresholds (project decision) | Phase 7 | More nuanced evaluation -- structural strictness + conversational leniency |
| Separate clean/edge datasets | Merged dataset with category field (project decision) | Phase 7 | Unified scoring with category-sliced results |

**Deprecated/outdated:**
- `agents.invoke()` and `agents.run()` in `@orq-ai/node` are marked deprecated -- use `agents.responses.create()` or the evaluatorq `invoke()` helper instead
- Version 4 of `@orq-ai/node` dropped MCP server binary -- project is pinned to `^3.14.45`

## Open Questions

1. **Exact Orq.ai dataset row schema for `createDatapoint()`**
   - What we know: Rows contain `inputs` (object), `messages` (array), `expected_output` (string). The SDK has `datasets.createDatapoint()`.
   - What's unclear: Exact TypeScript type signature for `createDatapoint()`, whether batch row upload is supported (vs. one-at-a-time), and whether custom metadata fields (like `category`, `source`) are stored in `inputs` or in a separate metadata field.
   - Recommendation: Validate at implementation time by creating a test dataset with a single row and inspecting the response. LOW confidence on exact schema.

2. **Evaluatorq built-in evaluator names vs. Orq.ai platform evaluator names**
   - What we know: Orq.ai docs list 40 built-in evaluators by name. Evaluatorq uses scorer functions in `@orq-ai/evaluators`.
   - What's unclear: Whether evaluatorq has built-in scorers for ALL 40 Orq.ai evaluators, or only a subset (currently confirmed: `stringContainsEvaluator`, `cosineSimilarityEvaluator`). For LLM evaluators (coherence, helpfulness, etc.), it's unclear whether evaluatorq provides these as built-in scorers or if they're invoked via the platform.
   - Recommendation: Check `@orq-ai/evaluators` package exports at implementation time. If LLM evaluators aren't available as local scorers, use platform-side evaluator configuration (attach evaluators to experiments via REST API, let the platform run them). MEDIUM confidence.

3. **Evaluatorq `invoke()` helper for agent execution**
   - What we know: Evaluatorq docs mention an `invoke()` helper for calling Orq deployments within jobs.
   - What's unclear: Whether `invoke()` works with the Agents API (which Phase 6 uses) or only with the Deployments API (prompts/models). If agents are not invocable via evaluatorq's `invoke()`, the job function will need to call the agent via `@orq-ai/node` SDK directly.
   - Recommendation: Test at implementation time. If `invoke()` doesn't support agents, use `agents.responses.create()` from `@orq-ai/node` inside the job function. MEDIUM confidence.

4. **Batch dataset upload performance**
   - What we know: SDK provides `datasets.createDatapoint()` for individual rows.
   - What's unclear: Whether there's a batch endpoint for uploading many rows at once, or if 30+ rows must be uploaded one-at-a-time (which could be slow with rate limiting).
   - Recommendation: Check if `POST /v2/datasets/{id}/rows` accepts an array of rows. If not, upload sequentially with rate-limit awareness. LOW confidence.

5. **Platform-side vs. local evaluator execution**
   - What we know: Evaluatorq runs evaluator scorer functions locally. Orq.ai platform can also run evaluators server-side during experiments.
   - What's unclear: Whether the locked decision's evaluator types (coherence, helpfulness, relevance, toxicity, etc.) should run locally via evaluatorq scorers or be configured as platform-side evaluators attached to the experiment.
   - Recommendation: Use platform-side evaluation for LLM evaluators (coherence, helpfulness, relevance, instruction_following, harmfulness) -- these require LLM calls that the platform handles. Use local evaluation for function evaluators (json_validity, exactness, toxicity) where possible. MEDIUM confidence.

## Sources

### Primary (HIGH confidence)
- [orq-ai/orqkit GitHub](https://github.com/orq-ai/orqkit) - evaluatorq architecture, job/evaluator API, data source options
- [orq-ai/orq-node GitHub](https://github.com/orq-ai/orq-node) - SDK methods for datasets (create, createDatapoint, list), agents
- [Orq.ai evaluator library docs](https://docs.orq.ai/docs/evaluators/library) - Complete list of 40 built-in evaluators with types and scoring
- [Orq.ai datasets overview](https://docs.orq.ai/docs/datasets/overview) - Dataset structure (inputs, messages, expected_output)
- [Orq.ai experiments overview](https://docs.orq.ai/docs/experiments/overview) - Experiment lifecycle (execution, metrics, validation)

### Secondary (MEDIUM confidence)
- [Orq.ai evaluator introduction](https://docs.orq.ai/docs/evaluator) - Evaluator types overview, migration notice to project-level
- [Orq.ai function evaluator docs](https://docs.orq.ai/docs/function-evaluator) - Function evaluator use cases
- [@orq-ai/evaluatorq npm](https://www.npmjs.com/package/@orq-ai/evaluatorq) - Package version confirmation (^1.1.0)
- [Orq.ai experiments from code (release 4.1)](https://docs.orq.ai/changelog/release-4-1) - Programmatic experiment features, Python/Node SDK parity
- [Orq.ai creating curated dataset](https://docs.orq.ai/docs/creating-curated-dataset) - Dataset creation methods

### Tertiary (LOW confidence)
- Exact `createDatapoint()` request/response schema -- not found in docs, needs runtime validation
- Evaluatorq `invoke()` helper compatibility with Agents API vs. Deployments API -- not documented clearly
- Batch row upload support -- not confirmed in available docs

### Project-Internal (HIGH confidence)
- `orq-agent/references/orqai-evaluator-types.md` - Full evaluator taxonomy with 41 types and scoring details
- `orq-agent/references/orqai-api-endpoints.md` - REST API endpoints including datasets, evaluators, experiments
- `orq-agent/agents/deployer.md` - MCP-first/REST-fallback pattern, retry with exponential backoff
- `orq-agent/agents/dataset-generator.md` - V1.0 markdown dataset format (dual-file with eval pairs)
- `orq-agent/templates/test-results.json` - JSON result template with per-agent scores structure
- `orq-agent/commands/test.md` - Existing test command stub with capability gating

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - SDK packages confirmed, but exact API surface for evaluatorq + dataset operations needs runtime validation
- Architecture: HIGH - Subagent pattern established in Phase 6, pipeline stages follow naturally from locked decisions
- Pitfalls: MEDIUM - Based on evaluation framework experience and project-specific constraints; some pitfalls (rate limiting, schema mismatch) are common patterns but exact Orq.ai behavior needs validation

**Research date:** 2026-03-01
**Valid until:** 2026-03-15 (evaluatorq SDK is relatively new; check for updates before implementation)
