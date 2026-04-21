# Framework Adapters — Cross-Framework Comparison

This reference is consumed **only** by `/orq-agent:compare-frameworks` Step 2 (scaffold) and Step 3 (adapter stubs). It supplies the canonical `async (input) => output` adapter shape per supported framework, plus framework-specific tracing notes that hook into Phase 37 observability.

Single-consumer: do not reference from other skills. Lives under `commands/compare-frameworks/resources/` so lint auto-excludes the path.

Supported frameworks, in the exact order used across the skill (job key order must match the order below):

1. orq.ai
2. LangGraph
3. CrewAI
4. OpenAI Agents SDK
5. Vercel AI SDK

Each section covers:

- **Instantiation** — a 2–5 line snippet showing how to create the agent in that framework.
- **Adapter** — the `async (input) => output` shape that `evaluatorq` calls per dataset row.
- **Tracing** — how to wire the framework into the Phase 37 observability stack. All five frameworks share the **instrumentors-before-SDK** ordering rule: import and register the instrumentor module *before* the framework SDK is imported, or the auto-instrumentation monkey-patches miss the SDK entrypoints.

All examples are TypeScript-first; Python shapes are analogous and the `evaluatorq` Python template accepts sync or async callables identically.

---

## orq.ai

Native invocation through `@orq-ai/node` — this is the baseline every other framework is compared against.

### Instantiation

```ts
import { Orq } from '@orq-ai/node';

const orq = new Orq({ apiKey: process.env.ORQ_API_KEY });
```

### Adapter

```ts
// adapters/orq-ai.ts
import { Orq } from '@orq-ai/node';

const orq = new Orq({ apiKey: process.env.ORQ_API_KEY });

export async function invokeOrqAgent(input: unknown): Promise<string> {
  const res = await orq.deployments.invoke({
    key: 'support-agent',          // deployment key in the workspace
    inputs: { user_message: input as string },
    // No explicit model override — the deployment's snapshot-pinned model wins.
  });
  return res.choices[0].message.content;
}
```

### Tracing

Traces are first-class: orq.ai deployments emit spans to the workspace automatically. No instrumentor import required. Phase 37 observability consumes these spans as-is. The orq.ai job is therefore the reference timing line for cross-framework latency diffs.

---

## LangGraph

State-machine style agent framework from LangChain.

### Instantiation

```ts
import { StateGraph, END } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';

const model = new ChatAnthropic({ model: 'claude-sonnet-4-5-20250929' });
const graph = new StateGraph(/* schema */).addNode('agent', async (s) => ({ messages: [await model.invoke(s.messages)] })).addEdge('__start__', 'agent').addEdge('agent', END).compile();
```

### Adapter

```ts
// adapters/langgraph.ts
import '../tracing/langchain-instrumentor';  // MUST import before the LangGraph SDK
import { StateGraph, END } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';

const model = new ChatAnthropic({ model: 'claude-sonnet-4-5-20250929' });
const graph = new StateGraph(/* schema */)
  .addNode('agent', async (s) => ({ messages: [await model.invoke(s.messages)] }))
  .addEdge('__start__', 'agent')
  .addEdge('agent', END)
  .compile();

export async function invokeLangGraph(input: unknown): Promise<string> {
  const result = await graph.invoke({ messages: [{ role: 'user', content: input as string }] });
  const last = result.messages[result.messages.length - 1];
  return typeof last.content === 'string' ? last.content : JSON.stringify(last.content);
}
```

### Tracing

LangGraph uses LangChain's callback system. Register the OpenInference or native LangChain instrumentor **before** importing `@langchain/langgraph` or `@langchain/anthropic` — otherwise the callback handlers attach to already-imported modules and silently drop spans. See Phase 37 observability for the instrumentors-before-SDK ordering rule applied here.

---

## CrewAI

Multi-agent "crew" orchestrator. Python-native; the TS skill proxies through a small HTTP shim when `--lang ts` is selected.

### Instantiation (Python, native)

```python
from crewai import Agent, Crew, Task

researcher = Agent(role="researcher", goal="…", backstory="…")
crew = Crew(agents=[researcher], tasks=[Task(description="{input}", agent=researcher)])
```

### Adapter

```ts
// adapters/crewai.ts — TS adapter calls a local Python shim exposing POST /invoke
export async function invokeCrewAI(input: unknown): Promise<string> {
  const res = await fetch('http://localhost:7801/invoke', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) throw new Error(`crewai shim error ${res.status}`);
  const { output } = await res.json();
  return output;
}
```

Python-native adapter:

```python
# adapters/crewai.py
from crewai import Agent, Crew, Task

researcher = Agent(role="researcher", goal="…", backstory="…")

def invoke_crewai(input: str) -> str:
    crew = Crew(agents=[researcher], tasks=[Task(description=input, agent=researcher)])
    return str(crew.kickoff())
```

### Tracing

CrewAI integrates via OpenTelemetry instrumentation for LangChain (under the hood, CrewAI tasks route through LangChain). Install and register the LangChain instrumentor **before** importing `crewai` — same instrumentors-before-SDK ordering as LangGraph. When running through the TS shim, the Python process owns tracing; the TS-side shim span is joined via the shared `experiment_id` in the orq.ai Experiment UI.

---

## OpenAI Agents SDK

OpenAI's first-party agent runtime (`@openai/agents`).

### Instantiation

```ts
import { Agent } from '@openai/agents';

const agent = new Agent({ name: 'support-agent', instructions: 'You are…' });
```

### Adapter

```ts
// adapters/openai-agents-sdk.ts
import '../tracing/openai-instrumentor';  // MUST import before @openai/agents
import { Agent, run } from '@openai/agents';

const agent = new Agent({
  name: 'support-agent',
  instructions: 'You are a senior customer-support agent.',
  model: 'gpt-4o-2024-11-20',
});

export async function invokeOpenAIAgentsSDK(input: unknown): Promise<string> {
  const result = await run(agent, String(input));
  return result.finalOutput ?? '';
}
```

### Tracing

The Agents SDK ships with its own tracing to OpenAI's trace dashboard; for orq.ai Experiment-UI joinability, layer the OpenInference OpenAI instrumentor on top. Register the instrumentor **before** `@openai/agents` is imported — the SDK monkey-patches `openai` at import time, and a late instrumentor misses those patches. See Phase 37 observability for details.

---

## Vercel AI SDK

Streaming-first model client (`ai` package from Vercel).

### Instantiation

```ts
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const model = anthropic('claude-sonnet-4-5-20250929');
```

### Adapter

```ts
// adapters/vercel-ai-sdk.ts
import '../tracing/vercel-ai-instrumentor';  // MUST import before the ai SDK
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const model = anthropic('claude-sonnet-4-5-20250929');

export async function invokeVercelAISDK(input: unknown): Promise<string> {
  const { text } = await generateText({
    model,
    prompt: String(input),
  });
  return text;
}
```

### Tracing

The Vercel AI SDK exposes an `experimental_telemetry` option that emits OpenTelemetry spans. The cleanest wiring is:

1. Import the OpenTelemetry SDK + instrumentor module first.
2. Then import `ai` and `@ai-sdk/*`.
3. Pass `experimental_telemetry: { isEnabled: true }` on each `generateText`/`streamText` call.

Same instrumentors-before-SDK ordering rule as the other frameworks.

---

## How `/orq-agent:compare-frameworks` uses this

1. **Step 2 — Scaffold.** Emit the evaluatorq script (see `./evaluatorq-script-templates.md`) with adapter imports keyed off the 5 framework slugs above.
2. **Step 3 — Adapter stubs.** For each framework the user opts into, copy the Adapter block into `./adapters/<slug>.ts` (or `.py`). If the user opts out of a framework, the job entry is removed from the evaluatorq `jobs:` array and the adapter file is skipped.
3. **Step 3.5 — Tracing wiring.** For every opted-in framework except orq.ai, ensure the instrumentor import appears as the first line of the adapter file. The skill greps the emitted file post-generation to enforce this.
4. **Step 4 — Fairness check.** Smoke-invoke each adapter exactly once with a throwaway dataset row. Any adapter that throws is reported and the run is aborted before the full experiment starts.
5. **Step 5 — Run.** The evaluatorq experiment hits every opted-in adapter per dataset row; shared `experiment_id` lets the orq.ai UI stack jobs side-by-side.

Changes to framework SDKs (new major versions, renamed entrypoints) go here first, not into the skill body.
