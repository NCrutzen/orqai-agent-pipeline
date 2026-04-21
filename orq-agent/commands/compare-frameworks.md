---
description: Generate an evaluatorq comparison script benchmarking the same agent across orq.ai, LangGraph, CrewAI, OpenAI Agents SDK, and Vercel AI SDK with fairness enforcement and smoke-invocation precheck
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, WebFetch, Task, AskUserQuestion
argument-hint: "[--lang python|ts] [--isolate-model] [--dataset <id>] [--evaluators <list>] [--model <snapshot>] [--models <list>]"
---

# Compare Frameworks

You are running the `/orq-agent:compare-frameworks` command. This command generates an `evaluatorq` comparison script that benchmarks the SAME conceptual agent implemented across five frameworks — orq.ai, LangGraph, CrewAI, OpenAI Agents SDK, and Vercel AI SDK — using a shared dataset, shared evaluators, and (by default) a shared model. Results render side-by-side in the orq.ai Experiment UI via a single shared `experiment_id`.

**Tier:** deploy+ (runs live agent invocations + creates/submits experiments to orq.ai). Core-tier users see: "Cross-framework comparison requires a deployed workspace — run the installer with `--reconfigure` and choose tier `deploy+`."

**Banner (emit as the first runtime line):**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► COMPARE FRAMEWORKS                   lang=${LANG}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Constraints

- **NEVER** run the full experiment before each agent passes the smoke-invocation precheck (XFRM-03).
- **NEVER** allow different datasets, different evaluator sets, or different models across jobs unless the user explicitly sets `--isolate-model` for the model dimension (XFRM-02).
- **NEVER** create five separate experiments — all 5 jobs MUST share one `experiment_id` so results render side-by-side in the orq.ai Experiment UI (XFRM-03).
- **NEVER** emit floating-alias model IDs (`*-latest`, `:latest`, `*-beta`) in the generated script — snapshot-pin per MSEL-02 (e.g. `anthropic/claude-sonnet-4-5-20250929`).
- **ALWAYS** emit exactly one `evaluatorq` job block per agent across all 5 frameworks: orq.ai, LangGraph, CrewAI, OpenAI Agents SDK, Vercel AI SDK (XFRM-01).
- **ALWAYS** support `--lang python|ts` so users can pick the host language of the generated script (XFRM-01).
- **ALWAYS** share a single `experiment_id` across all 5 jobs so results surface side-by-side in the orq.ai Experiment UI (XFRM-03).
- **ALWAYS** fail fast with a specific remediation message on any fairness violation — never silently degrade to "best-effort comparison".

**Why these constraints:** Fairness is the scientific guarantee of cross-framework comparison — if the dataset, evaluator set, or model differs across jobs, the numbers measure confounds rather than framework behavior. Model isolation is a legitimate experiment (e.g. "does framework X hurt tool-use on smaller models?"), but it MUST be explicit — silently different models produce headlines that melt under scrutiny. The smoke-invocation precheck prevents silent bad-runs: a misconfigured adapter that always returns `""` or throws on the first datapoint would pollute the entire experiment with 100% failure rows, wasting evaluator spend and producing a report that points at the wrong culprit. The shared `experiment_id` is load-bearing: the Experiment UI's side-by-side column layout is driven off `experiment_id` — five separate experiments render as five separate pages with no way to compare.

## When to use

- User owns the SAME conceptual agent implementation across multiple frameworks (e.g. a refund-triage agent built once in LangGraph, once with the OpenAI Agents SDK, once in CrewAI) and wants apples-to-apples quality / cost / latency comparison.
- User is evaluating framework migration — "should we move from CrewAI to LangGraph?" — and needs the numbers, not the marketing.
- User is authoring a public benchmark and must publish a reproducible script with snapshot-pinned model, shared dataset, and shared evaluator set.

## When NOT to use

- User has only one framework deployed — use `/orq-agent:test` for single-framework experimental evaluation instead.
- User wants automated framework detection on production traces — use `/orq-agent:observability` (Phase 37 identifies frameworks from span attributes).
- User wants to A/B two prompt versions within the same framework — use `/orq-agent:iterate` (single-framework prompt iteration with HITL).
- User wants per-framework failure taxonomy — run this skill first to produce traces, then `/orq-agent:trace-failure-analysis --identity <framework>` to drill in.

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- ← `/orq-agent:prompt-optimization` — produce the optimized prompt (POPT) before benchmarking it across frameworks.
- ← `/orq-agent:datasets` — author the shared dataset this skill requires via `--dataset <id>`.
- → `/orq-agent:analytics --group-by deployment --last 1h` — post-experiment cost / latency comparison across the 5 framework deployments.
- → `/orq-agent:traces --identity <framework>` — drill into per-framework failures surfaced by the experiment.
- → `/orq-agent:trace-failure-analysis --identity <framework>` — systematic failure-mode taxonomy on the losing framework.

## Done When

- [ ] Banner `ORQ ► COMPARE FRAMEWORKS` printed with `lang=${LANG}` on sub-line.
- [ ] User supplied dataset id, evaluator set, model (or `--isolate-model` with a `--models` list of length 5), and one invocation adapter per framework.
- [ ] Each of the 5 agents passed the smoke-invocation precheck (one test call, non-empty response, no thrown exception).
- [ ] Fairness checks passed: same `dataset` across jobs, same `evaluators` list across jobs, same `model` across jobs (unless `--isolate-model` is set).
- [ ] Script emitted in the chosen language (Python or TypeScript) at `compare-frameworks-YYYYMMDD-HHMM.{py|ts}` under the user's cwd (or configured output path).
- [ ] Experiment posted to orq.ai with a shared `experiment_id`; Experiment UI link printed.
- [ ] "Open in orq.ai:" deep link emitted with the exact experiment URL.

## Destructive Actions

- **Create experiment on orq.ai** — `AskUserQuestion` confirm with a summary of (`dataset_id`, evaluator set, `model(s)`, 5 framework adapters) BEFORE running the generated script. Experiments are immutable once created and consume evaluator + model spend, so the confirm prompt is mandatory. No deletions occur — `evaluatorq` only appends rows.
- **File writes only (script)** — this command writes exactly one file: `compare-frameworks-YYYYMMDD-HHMM.{py|ts}` in the user's cwd. Before overwriting an existing file with the same name, use `AskUserQuestion` (choices: `overwrite` / `rename with -v2 suffix` / `cancel`).

## Step 1: Parse Args + Dispatch

Parse `$ARGUMENTS` for the following long-form flags (no short flags — Phase 34 convention). Unknown flags STOP with a usage hint.

| Flag | Required | Default | Purpose |
|------|----------|---------|---------|
| `--lang python|ts` | optional | `ts` | Host language for the generated `evaluatorq` script. |
| `--isolate-model` | optional | off | Opt-in to per-framework model variation. Requires `--models <list>` of length 5. |
| `--dataset <id>` | required | — | Shared dataset id used by every job. |
| `--evaluators <list>` | required | — | Comma-separated evaluator ids / slugs applied identically to every job. |
| `--model <snapshot>` | required (unless `--isolate-model`) | — | Snapshot-pinned model id, e.g. `anthropic/claude-sonnet-4-5-20250929`. |
| `--models <list>` | required iff `--isolate-model` | — | Exactly 5 snapshot-pinned model ids, one per framework. |

Validate `--lang` against `python|ts`; STOP with `--lang must be one of python, ts (got: <value>)` otherwise.

Set `LANG=${LANG:-ts}` and compute the output script path: `compare-frameworks-$(date -u +%Y%m%d-%H%M).${LANG=="python"?"py":"ts"}`.

## Step 2: Collect Framework Adapters

The five frameworks for this comparison are (verbatim, case-sensitive): **orq.ai**, **LangGraph**, **CrewAI**, **OpenAI Agents SDK**, **Vercel AI SDK**.

Use one `AskUserQuestion` call with **5 questions**, one per framework, asking the user for the path + export name of their adapter function. Each adapter MUST match the signature:

- TypeScript: `async (input: unknown) => unknown`
- Python: `async def fn(input) -> Any`

Collect the 5 adapter bindings into an internal table:

| Framework key          | Display name        | Adapter import                         |
|------------------------|---------------------|----------------------------------------|
| `orq-ai`               | orq.ai              | `import { invokeOrqAgent } from './adapters/orq-ai'` |
| `langgraph`            | LangGraph           | `import { invokeLangGraph } from './adapters/langgraph'` |
| `crewai`               | CrewAI              | `from adapters.crewai import invoke_crewai` |
| `openai-agents-sdk`    | OpenAI Agents SDK   | `import { invokeOpenAIAgents } from './adapters/openai-agents-sdk'` |
| `vercel-ai-sdk`        | Vercel AI SDK       | `import { invokeVercelAI } from './adapters/vercel-ai-sdk'` |

If the user declines or cannot provide all 5, STOP with: `Cross-framework comparison requires all 5 adapters (orq.ai, LangGraph, CrewAI, OpenAI Agents SDK, Vercel AI SDK). Missing: <list>.`

## Step 3: Fairness Checks (XFRM-02)

Run these assertions BEFORE any live invocation. Fail fast with a specific remediation message on the first violation.

1. **Single dataset across jobs** — assert that exactly one `--dataset` value was supplied and that the generated script references it from a single source. On violation emit:
   ```
   Fairness check failed: multiple dataset ids detected across jobs (<list>).
   Remediation: supply exactly one --dataset <id> and rerun.
   ```
2. **Identical evaluator set across jobs** — assert the `--evaluators` list is applied verbatim to every job. On violation emit:
   ```
   Fairness check failed: evaluator set differs across jobs (<diff>).
   Remediation: apply the same --evaluators list to every job.
   ```
3. **Identical model across jobs UNLESS `--isolate-model`** — if `--isolate-model` is off, assert a single `--model`. If on, assert `--models` has exactly 5 entries (one per framework). On violation emit:
   ```
   Fairness check failed: model dimension varies without --isolate-model (got: <list>).
   Remediation: either supply a single --model <snapshot>, or pass --isolate-model with --models of length 5.
   ```
4. **Snapshot-pinning (MSEL-02)** — reject any model id matching `*-latest`, `:latest`, or `*-beta`. Emit:
   ```
   Fairness check failed: floating-alias model id <value>.
   Remediation: use a dated snapshot, e.g. anthropic/claude-sonnet-4-5-20250929.
   ```

If all four assertions pass, print `Fairness checks: OK (dataset, evaluators, model, snapshots pinned).` and proceed to Step 4.

## Step 4: Smoke-Invocation Precheck (XFRM-03)

For each of the 5 adapters, run ONE test call using a single datapoint sampled from `--dataset`.

Sequence (per adapter):

1. Fetch one datapoint via MCP `get_dataset_datapoints` or REST `GET /v2/datasets/{id}/datapoints?limit=1`.
2. Invoke the adapter with that datapoint's input field.
3. Assert:
   - No thrown exception / rejected promise.
   - Response is non-empty (string length > 0, or non-empty structured output).
   - Response type matches adapter signature (`string | object` — reject `null` / `undefined`).

On ANY failure, STOP immediately. Surface which framework's adapter failed, the raw error, and the datapoint input used. Example output:

```
Smoke-invocation precheck FAILED for framework: LangGraph
  Datapoint: { "input": "Refund my $49 subscription" }
  Raw error: TypeError: Cannot read property 'invoke' of undefined
  at invokeLangGraph (./adapters/langgraph.ts:12:18)

Remediation: fix the LangGraph adapter so it returns a non-empty response for this input, then rerun /orq-agent:compare-frameworks.
Do NOT proceed to the full experiment — silent bad adapters pollute every row.
```

On success, render the precheck summary:

```
| Framework          | Status | Latency | Response preview (first 80 chars) |
|--------------------|--------|---------|------------------------------------|
| orq.ai             | OK     | 412ms   | "Refund approved — issuing..."     |
| LangGraph          | OK     | 680ms   | "I'll process your refund..."      |
| CrewAI             | OK     | 590ms   | "Refund request accepted..."       |
| OpenAI Agents SDK  | OK     | 510ms   | "Processing refund for..."         |
| Vercel AI SDK      | OK     | 445ms   | "Refund complete. Reference..."    |
```

## Step 5: Emit evaluatorq Script (XFRM-01)

Render the script from `orq-agent/commands/compare-frameworks/resources/evaluatorq-script-templates.md` (Python + TypeScript scaffolds), substituting the user's dataset / evaluators / model(s) / adapters. The script MUST contain exactly one `jobs[]` entry per framework, keyed by stable ids: `orq-ai`, `langgraph`, `crewai`, `openai-agents-sdk`, `vercel-ai-sdk`.

**TypeScript scaffold (emitted when `--lang ts`):**

```ts
import { experiment } from '@orq-ai/evaluatorq';
import { invokeOrqAgent } from './adapters/orq-ai';
import { invokeLangGraph } from './adapters/langgraph';
import { invokeCrewAI } from './adapters/crewai';
import { invokeOpenAIAgents } from './adapters/openai-agents-sdk';
import { invokeVercelAI } from './adapters/vercel-ai-sdk';

// Illustrative model snapshot — snapshot-pinned per MSEL-02.
const MODEL = 'anthropic/claude-sonnet-4-5-20250929';

await experiment({
  name: 'cross-framework-${TIMESTAMP}',
  dataset: '${DATASET_ID}',
  evaluators: ${EVALUATORS_JSON},
  model: MODEL, // omitted when --isolate-model; each job overrides
  jobs: [
    { key: 'orq-ai',            fn: async (input) => invokeOrqAgent(input) },
    { key: 'langgraph',         fn: async (input) => invokeLangGraph(input) },
    { key: 'crewai',            fn: async (input) => invokeCrewAI(input) },
    { key: 'openai-agents-sdk', fn: async (input) => invokeOpenAIAgents(input) },
    { key: 'vercel-ai-sdk',     fn: async (input) => invokeVercelAI(input) },
  ],
});
```

**Python scaffold (emitted when `--lang python`):**

```python
from evaluatorq import experiment
from adapters.orq_ai import invoke_orq_agent
from adapters.langgraph import invoke_langgraph
from adapters.crewai import invoke_crewai
from adapters.openai_agents_sdk import invoke_openai_agents
from adapters.vercel_ai_sdk import invoke_vercel_ai

# Illustrative model snapshot — snapshot-pinned per MSEL-02.
MODEL = "anthropic/claude-sonnet-4-5-20250929"

await experiment(
    name="cross-framework-${TIMESTAMP}",
    dataset="${DATASET_ID}",
    evaluators=${EVALUATORS_LIST},
    model=MODEL,  # omitted when --isolate-model; each job overrides
    jobs=[
        {"key": "orq-ai",            "fn": invoke_orq_agent},
        {"key": "langgraph",         "fn": invoke_langgraph},
        {"key": "crewai",            "fn": invoke_crewai},
        {"key": "openai-agents-sdk", "fn": invoke_openai_agents},
        {"key": "vercel-ai-sdk",     "fn": invoke_vercel_ai},
    ],
)
```

When `--isolate-model` is set, emit a per-job `model` override (TypeScript `{ key, fn, model }`; Python `{"key": ..., "fn": ..., "model": ...}`) drawing from the 5-entry `--models` list in framework-key order.

Write the script to `compare-frameworks-YYYYMMDD-HHMM.{py|ts}`. Before overwriting an existing file, confirm via `AskUserQuestion`.

## Step 6: Run Experiment

Use `AskUserQuestion` to confirm a summary (dataset, evaluators, model(s), 5 framework adapters). On approval, execute the generated script and capture `experiment_id` from stdout / SDK return.

**MCP-first path:** if the `evaluatorq` SDK auto-registers the experiment via `$ORQ_API_KEY`, no extra call is needed. Parse `experiment_id` from the script's final log line.

**REST fallback** (when MCP auto-registration fails): `POST /v2/experiments` with the run artifacts:

```bash
curl -sS -X POST -H "Authorization: Bearer $ORQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d @experiment-payload.json \
  https://api.orq.ai/v2/experiments
```

If both MCP and REST fallback fail, STOP and surface the raw error — never fabricate an `experiment_id`.

## Step 7: Link to Side-by-Side Results

Print the deep link so the user can open the Experiment UI with all 5 jobs rendered side-by-side as columns (driven off the shared `experiment_id`):

```
Experiment: https://my.orq.ai/experiments/${EXPERIMENT_ID}
All 5 framework jobs share this experiment_id and render side-by-side as columns.

Next:
  /orq-agent:analytics --group-by deployment --last 1h   (cost/latency by framework)
  /orq-agent:traces --identity <framework>                (drill-down on losers)
  /orq-agent:trace-failure-analysis --identity <framework> (failure taxonomy)
```

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Different dataset per framework ("each team had their own test set") | Use one shared `dataset` id — the fairness check blocks otherwise (XFRM-02). Without a shared dataset, you measure dataset drift, not framework differences. |
| Different evaluator sets per framework ("LangGraph has a tool-use evaluator we wrote") | Use one shared `evaluators` list. Isolating the evaluator dimension is not supported — applying different rubrics to different jobs produces numbers that cannot be compared. |
| Different models by accident ("CrewAI defaulted to gpt-4o, LangGraph to claude") | Use one shared `--model`. Only `--isolate-model` with a `--models` list of length 5 opts in to per-framework model variation (XFRM-02), and this must be explicit and recorded. |
| Skipping the smoke precheck to save time ("we'll catch bad adapters in the results") | A silent bad adapter that returns `""` or throws on every call pollutes the entire experiment. The precheck (XFRM-03) is mandatory and cheap — one call per framework, ~2 seconds total. |
| Creating 5 separate experiments ("one per framework, then I'll compare manually") | One shared `experiment_id` is what makes the side-by-side UI possible (XFRM-03). Five separate experiments render as five separate pages with no column layout — comparison becomes manual spreadsheet work. |
| Using floating model aliases (`claude-sonnet-latest`) in the generated script | Snapshot-pin (`anthropic/claude-sonnet-4-5-20250929`) per MSEL-02. Floating aliases make the benchmark irreproducible the moment the alias points to a new snapshot. |
| Auto-detecting frameworks from production traces inside this skill | Out of scope — `/orq-agent:observability` (Phase 37) detects frameworks from span attributes. This skill assumes the user names the 5 frameworks and supplies adapters. |

## Open in orq.ai

- **Experiments:** https://my.orq.ai/experiments
- **Datasets:** https://my.orq.ai/datasets
- **Evaluators:** https://my.orq.ai/evaluators
- **Deployments:** https://my.orq.ai/deployments

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`search_entities`, `get_dataset_datapoints`, `list_evaluators`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly (see the `evaluatorq` SDK reference).
4. **This skill file** — may lag behind API or docs changes.
