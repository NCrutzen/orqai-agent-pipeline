# evaluatorq Script Templates — Cross-Framework Comparison

This reference is consumed **only** by `/orq-agent:compare-frameworks` Steps 2 (scaffold) and 5 (emit). It supplies the canonical `@orq-ai/evaluatorq` (TypeScript) and `evaluatorq` (Python) job-block scaffolds the skill instantiates when the user runs `/orq-agent:compare-frameworks --lang ts|python`.

Single-consumer: do not reference from other skills. Lives under `commands/compare-frameworks/resources/` so lint auto-excludes the path.

---

## TypeScript template

Emitted when the user selects `--lang ts`. Uses `@orq-ai/evaluatorq@^1.1.0` (pinned in `PROJECT.md` Phase 41 constraints).

```ts
import { experiment } from '@orq-ai/evaluatorq';

// Framework adapter imports — see ./framework-adapters.md for the
// per-framework `async (input) => output` adapter shapes.
import { invokeOrqAgent } from './adapters/orq-ai';
import { invokeLangGraph } from './adapters/langgraph';
import { invokeCrewAI } from './adapters/crewai';
import { invokeOpenAIAgentsSDK } from './adapters/openai-agents-sdk';
import { invokeVercelAISDK } from './adapters/vercel-ai-sdk';

await experiment({
  name: 'cross-framework-{DATE}',
  dataset: '{DATASET_ID}',
  evaluators: [
    // Shared evaluator IDs — MUST be identical across all jobs (fairness-check).
    // Example: 'tone-fail-pass', 'refund-accuracy'
  ],
  // MSEL-02 snapshot-pinned model. Omit this line and supply perJobModel[]
  // when the caller passes --isolate-model to vary model per job.
  model: 'anthropic/claude-sonnet-4-5-20250929',
  jobs: [
    { key: 'orq-ai',            fn: async (input) => invokeOrqAgent(input) },
    { key: 'langgraph',         fn: async (input) => invokeLangGraph(input) },
    { key: 'crewai',            fn: async (input) => invokeCrewAI(input) },
    { key: 'openai-agents-sdk', fn: async (input) => invokeOpenAIAgentsSDK(input) },
    { key: 'vercel-ai-sdk',     fn: async (input) => invokeVercelAISDK(input) },
  ],
});
```

### `--isolate-model` variant (TypeScript)

When the caller wants each framework to run against its native/default model:

```ts
await experiment({
  name: 'cross-framework-isolated-{DATE}',
  dataset: '{DATASET_ID}',
  evaluators: [/* same set across jobs */],
  jobs: [
    { key: 'orq-ai',            model: 'anthropic/claude-sonnet-4-5-20250929', fn: async (input) => invokeOrqAgent(input) },
    { key: 'langgraph',         model: 'openai/gpt-4o-2024-11-20',             fn: async (input) => invokeLangGraph(input) },
    { key: 'crewai',            model: 'openai/gpt-4o-2024-11-20',             fn: async (input) => invokeCrewAI(input) },
    { key: 'openai-agents-sdk', model: 'openai/gpt-4o-2024-11-20',             fn: async (input) => invokeOpenAIAgentsSDK(input) },
    { key: 'vercel-ai-sdk',     model: 'openai/gpt-4o-2024-11-20',             fn: async (input) => invokeVercelAISDK(input) },
  ],
});
```

Note: top-level `model` is omitted; per-job `model` fields are required. The skill's fairness-check relaxes the equal-model constraint when `--isolate-model` is set but still enforces equal dataset + equal evaluators.

---

## Python template

Emitted when the user selects `--lang python`. Uses the `evaluatorq` PyPI module (same major version as the TS SDK).

```python
from evaluatorq import experiment

# Framework adapter imports — see ./framework-adapters.md for the
# per-framework `async def (input) -> output` adapter shapes.
from adapters.orq_ai import invoke_orq_agent
from adapters.langgraph import invoke_langgraph
from adapters.crewai import invoke_crewai
from adapters.openai_agents_sdk import invoke_openai_agents_sdk
from adapters.vercel_ai_sdk import invoke_vercel_ai_sdk

experiment(
    name="cross-framework-{DATE}",
    dataset="{DATASET_ID}",
    evaluators=[
        # Shared evaluator IDs — MUST be identical across all jobs (fairness-check).
        # Example: "tone-fail-pass", "refund-accuracy"
    ],
    # MSEL-02 snapshot-pinned model. Omit and pass per-job model when
    # the caller uses --isolate-model.
    model="anthropic/claude-sonnet-4-5-20250929",
    jobs=[
        {"key": "orq-ai",            "fn": lambda input: invoke_orq_agent(input)},
        {"key": "langgraph",         "fn": lambda input: invoke_langgraph(input)},
        {"key": "crewai",            "fn": lambda input: invoke_crewai(input)},
        {"key": "openai-agents-sdk", "fn": lambda input: invoke_openai_agents_sdk(input)},
        {"key": "vercel-ai-sdk",     "fn": lambda input: invoke_vercel_ai_sdk(input)},
    ],
)
```

### `--isolate-model` variant (Python)

```python
experiment(
    name="cross-framework-isolated-{DATE}",
    dataset="{DATASET_ID}",
    evaluators=[],  # same set across jobs
    jobs=[
        {"key": "orq-ai",            "model": "anthropic/claude-sonnet-4-5-20250929", "fn": lambda input: invoke_orq_agent(input)},
        {"key": "langgraph",         "model": "openai/gpt-4o-2024-11-20",             "fn": lambda input: invoke_langgraph(input)},
        {"key": "crewai",            "model": "openai/gpt-4o-2024-11-20",             "fn": lambda input: invoke_crewai(input)},
        {"key": "openai-agents-sdk", "model": "openai/gpt-4o-2024-11-20",             "fn": lambda input: invoke_openai_agents_sdk(input)},
        {"key": "vercel-ai-sdk",     "model": "openai/gpt-4o-2024-11-20",             "fn": lambda input: invoke_vercel_ai_sdk(input)},
    ],
)
```

---

## Substitution tokens

The skill fills these tokens at emit time. `{...}` tokens are the only placeholders the template exposes — no implicit `{{variable}}` syntax (evaluatorq uses runtime args, not prompt templating).

| Token           | Source                                             | Example                         |
| --------------- | -------------------------------------------------- | ------------------------------- |
| `{DATE}`        | `date -u +%Y%m%d` at emit time                     | `20260420`                      |
| `{DATASET_ID}`  | Dataset ID from the user's orq.ai workspace        | `shared-test-set-20260421`      |
| Evaluator IDs   | List the user selects interactively (Step 2)       | `tone-fail-pass`                |
| Model snapshot  | MSEL-02 pinned snapshot (default)                  | `claude-sonnet-4-5-20250929`    |
| Per-job model   | Only emitted when `--isolate-model`                | `openai/gpt-4o-2024-11-20`      |
| Adapter imports | One per job key, resolved to `./adapters/<key>`    | `invokeLangGraph`               |

All job keys MUST be stable across runs so the orq.ai Experiment UI can join successive experiments into a trend view.

---

## How `/orq-agent:compare-frameworks` uses this

The skill walks the following flow, referencing this file at Steps 2 and 5:

1. **Step 1 — Gather.** Ask the user for dataset ID, evaluator set, `--lang`, and `--isolate-model` flag via `AskUserQuestion`.
2. **Step 2 — Scaffold.** Pick the TypeScript or Python template above, substitute the collected tokens, emit to a working file (`compare-frameworks-{DATE}.ts` or `.py`).
3. **Step 3 — Adapter stubs.** Pull per-framework adapter shapes from `./framework-adapters.md`, emit one adapter file per job key under `./adapters/`.
4. **Step 4 — Fairness check.** Run smoke-invoke once per adapter; fail-fast if any framework can't produce an output, if dataset IDs drift, or if evaluator sets differ across jobs (unless `--isolate-model` relaxes the model constraint).
5. **Step 5 — Run.** Execute the emitted script against the live workspace (deploy+ tier). Results land in the orq.ai Experiment UI under the shared `experiment_id`, and `/orq-agent:analytics` (Phase 36) can produce post-run comparison tables.

If the user edits the emitted script between Step 2 and Step 5, the skill re-runs the fairness check on the edited version before executing.

---

## Why this lives here

Phase 37/38/39/40 established the single-consumer resources pattern: long-form scaffolds used by exactly one command live under `commands/<name>/resources/`. The repo's lint config already auto-excludes this path via the `commands/*.md` single-level glob, so lengthy code blocks in this file don't trigger style rules intended for user-facing skill bodies.
