# Stack Research

**Domain:** V2.0 Autonomous Orq.ai Pipeline -- stack additions for deployment, testing, iteration, and guardrails
**Researched:** 2026-03-01
**Confidence:** MEDIUM (Orq.ai SDK versions verified via npm; MCP server capabilities partially verified; agentic patterns HIGH confidence from official sources)

## Context: What V1.0 Already Has (DO NOT DUPLICATE)

V1.0 is a pure markdown-driven Claude Code skill. No runtime dependencies. No npm packages. The entire stack is Claude Code skills, subagents, templates, and bash scripts distributed as a plugin via GitHub. This works and should remain the foundation.

V2.0 adds **runtime capabilities** that require actual API calls: deploying agents, running experiments, iterating prompts. This means V2.0 needs the Orq.ai Node SDK and evaluatorq SDK as runtime dependencies for the first time.

## Recommended Stack Additions

### Orq.ai MCP Server (Primary Integration Point)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Orq.ai MCP Server | remote (HTTP) | MCP-first access to Orq.ai platform from Claude Code | The `@orq-ai/node` SDK doubles as an MCP server. Adding it via `claude mcp add --transport http orq https://my.orq.ai/v2/mcp` exposes all SDK methods as tools that Claude Code can invoke directly. This is the **primary integration path** -- no wrapper scripts needed. Claude Code natively speaks MCP. |

**What the MCP server exposes (verified via SDK docs):**
- Agent CRUD: create, update (PATCH), delete, list agents
- Agent invocation: `POST /v2/agents/{key}/responses` with task continuation via `task_id`
- Tool management: create/update HTTP tools, function tools, MCP tools
- Prompt management: create, update, list prompts with model config, messages, metadata
- Deployment invocation: invoke deployments for testing
- Dataset operations: create, list, upload rows
- Contact management (for audit trail)
- Memory store operations: create, query, write

**What the MCP server does NOT expose (needs direct API or SDK):**
- Experiment execution (evaluatorq SDK handles this)
- Evaluator creation and management (evaluatorq SDK)
- Bulk dataset upload from local files
- Version tagging and publishing

**MCP server setup:**
```bash
# Add to Claude Code (project scope)
claude mcp add --transport http --scope project orq https://my.orq.ai/v2/mcp \
  --header "Authorization: Bearer ${ORQ_API_KEY}"

# Or via .mcp.json in project root
{
  "mcpServers": {
    "orq": {
      "type": "http",
      "url": "https://my.orq.ai/v2/mcp",
      "headers": {
        "Authorization": "Bearer ${ORQ_API_KEY}"
      }
    }
  }
}
```

### Orq.ai Node SDK (API Fallback + MCP Source)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@orq-ai/node` | ^3.2.8 | TypeScript SDK for Orq.ai API; also the MCP server source | The SDK provides type-safe access to all `/v2/*` endpoints. Use as API fallback when MCP tools are unavailable or for operations the MCP server does not expose. The SDK is the source of the MCP server -- installing it gives you both. Requires Node.js >= 20. |

**Key SDK modules for V2.0:**

| Module | Methods | V2.0 Use Case |
|--------|---------|---------------|
| `orq.agents` | `create()`, `update()` (PATCH), `createResponse()` | Deploy agent specs to Orq.ai, invoke agents for testing |
| `orq.tools` | `create()`, `list()` | Create HTTP/function tools before agent deployment (tools must exist before agents reference them) |
| `orq.prompts` | `create()`, `update()`, `list()` | Manage prompt versions during iteration loop |
| `orq.datasets` | `create()`, `list()`, `createRows()` | Upload test datasets for experiments |
| `orq.deployments` | `invoke()`, `getConfig()` | Invoke deployments for quick single-call tests |

**Agent creation pattern (verified from API docs):**
```typescript
import { Orq } from "@orq-ai/node";

const orq = new Orq({ apiKey: process.env.ORQ_API_KEY });

// Create agent (idempotent via unique key)
await orq.agents.create({
  key: "invoice-checker-agent",
  role: "Invoice document analyzer",
  description: "Validates invoice fields against business rules",
  instructions: "You are an invoice validation specialist...",
  model: "anthropic/claude-sonnet-4-20250514",
  path: "Default",
  settings: {
    max_iterations: 5,
    max_execution_time: 300
  },
  tools: [
    { type: "function", key: "validate-invoice", /* ... */ }
  ]
});

// Update existing agent (PATCH)
await orq.agents.update("invoice-checker-agent", {
  instructions: "Updated instructions after test iteration..."
});

// Invoke agent
const response = await orq.agents.createResponse("invoice-checker-agent", {
  input: "Check this invoice: ...",
});
```

**Tool creation must precede agent creation:**
```typescript
// Tools must exist before agents reference them
await orq.tools.create({
  key: "validate-invoice",
  description: "Validates invoice against business rules",
  type: "http",
  path: "Default",
  http: {
    blueprint: "https://api.example.com/validate/{{invoice_id}}",
    method: "POST",
    arguments: {
      invoice_id: { type: "string", description: "Invoice identifier" }
    }
  }
});
```

### Evaluatorq SDK (Experiment Engine)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@orq-ai/evaluatorq` | ^1.0.7 | Run experiments with datasets, jobs, and evaluators | This is the dedicated experiment runner for Orq.ai. It connects to platform datasets, runs jobs (your agent/deployment under test), applies evaluators, and sends results back to Orq.ai for visualization. Required for the automated testing pipeline. |
| `@orq-ai/evaluators` | latest | Pre-built evaluator functions (cosine similarity, thresholds) | Companion package providing ready-made evaluators. Includes `cosineSimilarityEvaluator`, `cosineSimilarityThresholdEvaluator`, and `simpleCosineSimilarity`. Requires `OPENAI_API_KEY` for embedding-based evaluators. |

**Experiment execution pattern:**
```typescript
import { evaluatorq, job } from "@orq-ai/evaluatorq";
import { cosineSimilarityThresholdEvaluator } from "@orq-ai/evaluators";

// Define the job (what you're testing)
const agentJob = job("invoice-checker-test", async (input) => {
  const response = await orq.agents.createResponse("invoice-checker-agent", {
    input: input.text
  });
  return { output: response.output };
});

// Run experiment against platform dataset
await evaluatorq({
  dataset: "dataset-id-from-orq-platform",  // or inline data array
  jobs: [agentJob],
  evaluators: [
    cosineSimilarityThresholdEvaluator({ threshold: 0.8 }),
    // Custom evaluator
    async (result) => ({
      name: "has-required-fields",
      score: result.output.includes("total") ? 1 : 0
    })
  ]
});
// Results automatically sent to Orq.ai platform
```

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dotenv` | ^16.4 | Environment variable management for API keys | Load `ORQ_API_KEY` and `OPENAI_API_KEY` from `.env` during local development and testing. Not needed if keys are set in shell profile. |
| `zod` | ^3.23 | Runtime validation of API responses and config | Validate Orq.ai API responses, experiment results, and user configuration during the deploy/test/iterate cycle. The `@orq-ai/node` SDK already uses zod internally. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `claude mcp add` | Register Orq.ai MCP server | Use `--scope project` to keep it project-local. Use `--scope user` for personal dev. |
| `claude mcp list` | Verify MCP server registration | Confirms the Orq.ai MCP tools are available before subagents attempt to use them. |
| Node.js >= 20 | Required runtime for MCP server from npm | The `@orq-ai/node` MCP server requires Node.js v20+. Verify with `node --version`. |

## Orq.ai API Surface Reference (V2.0 Endpoints)

### Agent Lifecycle Endpoints

| Endpoint | Method | Purpose | V2.0 Usage |
|----------|--------|---------|------------|
| `/v2/agents` | POST | Create agent | Deploy new agent specs |
| `/v2/agents/{key}` | PATCH | Update agent | Iterate prompts/settings after test results |
| `/v2/agents/{key}` | GET | Get agent config | Verify deployment state |
| `/v2/agents/{key}` | DELETE | Remove agent | Cleanup failed deployments |
| `/v2/agents/{key}/responses` | POST | Invoke agent | Run agent for testing; pass `task_id` for continuation |

### Tool Endpoints

| Endpoint | Method | Purpose | V2.0 Usage |
|----------|--------|---------|------------|
| `/v2/tools` | POST | Create tool | Deploy tools before agents that reference them |
| `/v2/tools` | GET | List tools | Check if tools already exist (idempotent deploys) |
| `/v2/tools/{key}` | PATCH | Update tool | Modify tool configs during iteration |

### Dataset Endpoints

| Endpoint | Method | Purpose | V2.0 Usage |
|----------|--------|---------|------------|
| `/v2/datasets` | POST | Create dataset | Upload generated test data |
| `/v2/datasets` | GET | List datasets | Find existing datasets for experiments |
| `/v2/datasets/{id}/rows` | POST | Add rows | Upload test inputs, expected outputs, messages |

### Prompt Endpoints

| Endpoint | Method | Purpose | V2.0 Usage |
|----------|--------|---------|------------|
| `/v2/prompts` | POST | Create prompt | Store prompt versions |
| `/v2/prompts` | GET | List prompts | Retrieve current prompt versions |
| `/v2/prompts/{key}` | PATCH | Update prompt | Apply iteration changes |

### Agent Versioning

Agents support version tags: invoke `agent-key@2` to target a specific published version. Default routing goes to the `latest` tag. Use this for A/B testing prompt iterations -- deploy v2 while v1 remains live.

### Orchestrator Agent Pattern

Orchestrator agents require two built-in tools:
- `retrieve_agents` -- discovers available sub-agents in the workspace
- `call_sub_agent` -- delegates tasks to discovered sub-agents

These must be included in the orchestrator's tools array. The orchestrator must be instructed to call `retrieve_agents` first before delegating.

### Memory Stores

Agents can use memory stores for persistent context:
- `retrieve_memory_stores` -- discovers available stores
- `query_memory_store` -- reads from a store
- `write_memory_store` -- writes to a store

Memory stores require a unique key and embedding model configuration.

## Installation

```bash
# V2.0 runtime dependencies (new -- V1.0 had zero npm deps)
npm install @orq-ai/node@^3.2.8 @orq-ai/evaluatorq@^1.0.7 @orq-ai/evaluators

# Optional: environment management
npm install dotenv@^16.4

# Dev dependencies
npm install -D typescript@^5.5 @types/node@^20

# MCP server registration (run in Claude Code)
claude mcp add --transport http --scope project orq https://my.orq.ai/v2/mcp \
  --header "Authorization: Bearer ${ORQ_API_KEY}"
```

**Environment variables required:**
```bash
# Required for all V2.0 features
ORQ_API_KEY=your-orq-api-key

# Required only for embedding-based evaluators (@orq-ai/evaluators)
OPENAI_API_KEY=your-openai-api-key
```

## Agentic Framework Patterns (Reference for Prompt Updates)

These patterns inform how the skill's reference materials and agent instructions should be updated. They are NOT runtime dependencies -- they are knowledge to bake into the skill's templates and subagent prompts.

### Anthropic: Building Effective Agents (Dec 2024, still canonical in 2026)

**Core principle:** Start simple, add complexity only when measured improvement justifies it.

**Six composable patterns (in order of complexity):**

1. **Prompt Chaining** -- Break task into sequential steps, each LLM call processes output of previous. Gate steps with programmatic checks. Use when: task decomposes into fixed subtasks.

2. **Routing** -- Classify input, route to specialized handler. Use when: distinct categories need different approaches.

3. **Parallelization** -- Run multiple LLM calls simultaneously, aggregate results. Two variants: sectioning (split task) and voting (same task, multiple perspectives). Use when: subtasks are independent.

4. **Orchestrator-Workers** -- Central LLM dynamically determines subtasks and delegates. Unlike parallelization, subtasks are not pre-defined. Use when: task complexity varies per input.

5. **Evaluator-Optimizer** -- One LLM generates, another evaluates, loop until quality threshold met. **Directly maps to V2.0's prompt iteration loop.** Use when: clear evaluation criteria exist and iterative refinement adds measurable value.

6. **Autonomous Agent** -- LLM operates in a loop with tool access, deciding next actions. Use when: open-ended tasks requiring adaptive behavior.

**Key insight for V2.0:** The evaluator-optimizer pattern is exactly what the prompt iteration loop implements. The existing skill already uses orchestrator-workers (architect delegates to researchers/generators). V2.0 adds evaluator-optimizer on top.

### OpenAI: Agents SDK Patterns (2025-2026)

**Two multi-agent patterns:**

1. **Handoff** -- Agent transfers control to another agent mid-conversation. The receiving agent takes over the thread. Use for: conversational routing.

2. **Agent-as-Tool** -- Central agent calls other agents as tools for subtasks. Sub-agents do not take over the conversation; results flow back to the orchestrator. **This maps to Orq.ai's `call_sub_agent` pattern.**

**Guardrails:** Run input validation in parallel with agent execution. Fail fast when checks do not pass. Implement as separate model instances (not same-call guardrails).

### Google: A2A Protocol (v0.3, 2025-2026)

**Relevance to Orq.ai:** Orq.ai's agent runtime is built on A2A Protocol concepts. Task states (`submitted`, `working`, `input_required`, `completed`, `failed`, `canceled`), message parts format, and task continuation via `task_id` are A2A patterns.

**Key update:** A2A v0.3 brings a more stable interface. Protocol is framework-agnostic (works across ADK, LangGraph, CrewAI, etc.). Built on HTTP, SSE, and JSON-RPC.

**Implication for V2.0:** Agent orchestration specs should reference A2A task lifecycle states. The `input_required` state maps to HITL (human-in-the-loop) approval gates in the iteration loop.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Orq.ai MCP server (MCP-first) | Direct REST API calls via `fetch()` | Only if MCP server is unavailable or specific endpoints are not exposed as MCP tools. MCP-first is preferred because Claude Code natively understands MCP tool calls. |
| `@orq-ai/node` SDK | Raw `fetch()` to REST endpoints | Only if SDK introduces breaking changes or version conflicts. SDK provides type safety, error handling, and retry logic. |
| `@orq-ai/evaluatorq` | Custom experiment runner | Only if evaluatorq lacks needed features (e.g., custom metrics not expressible as evaluator functions). evaluatorq handles platform integration automatically. |
| `@orq-ai/evaluators` (cosine similarity) | Custom LLM-as-judge evaluators | Use LLM-as-judge when semantic similarity is insufficient -- e.g., evaluating reasoning quality, instruction adherence, or tone. Cosine similarity works for factual output matching. |
| `dotenv` for key management | Shell environment variables | If users already export `ORQ_API_KEY` in their shell profile. dotenv is only needed for `.env` file convenience. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| LangChain / LangGraph / CrewAI | Agent execution frameworks. V2.0 deploys to Orq.ai -- it does not execute agents locally. Adding these frameworks is the wrong abstraction. | Orq.ai MCP server + SDK for deployment; evaluatorq for testing |
| Orq.ai Deployments API (`/v2/deployments`) | Deployments are single-call, no orchestration, no state. V2.0 targets the Agents API which supports multi-step, tools, memory, and task continuation. | Agents API (`/v2/agents`) |
| Custom MCP server (building one) | The `@orq-ai/node` SDK already IS an MCP server. Building a wrapper adds complexity with no benefit. | `@orq-ai/node` as MCP server directly |
| `@orq-ai/node` as the ONLY integration | MCP-first is better for Claude Code because tool calls are native. SDK should be fallback, not primary. | MCP server primary, SDK fallback |
| OpenAI Agents SDK / Google ADK | These are agent execution runtimes for building agents that run locally. V2.0 deploys specs to Orq.ai's runtime. Their patterns are valuable as reference -- their code is not needed. | Reference patterns in skill templates; deploy to Orq.ai runtime |
| Heavyweight test frameworks (Jest, Vitest) | Experiment execution is handled by evaluatorq, not a test runner. Test assertions are evaluator functions, not `expect()` calls. | `@orq-ai/evaluatorq` with custom evaluator functions |

## Stack Patterns by Variant

**If user selects "core" install (spec generation only, no deploy/test):**
- Zero npm dependencies (same as V1.0)
- MCP server not registered
- Output remains copy-paste markdown specs
- Because: some users only want spec generation without API integration

**If user selects "deploy" install (core + deployment):**
- Add `@orq-ai/node` dependency
- Register Orq.ai MCP server
- Enable `/orq-agent:deploy` skill
- Because: deploys specs but does not test them

**If user selects "full" install (core + deploy + test + iterate):**
- Add `@orq-ai/node`, `@orq-ai/evaluatorq`, `@orq-ai/evaluators`
- Register Orq.ai MCP server
- Enable all V2.0 skills (deploy, test, iterate, guardrails)
- Requires both `ORQ_API_KEY` and `OPENAI_API_KEY`
- Because: full autonomous pipeline

**If MCP server is unavailable or broken:**
- Fall back to SDK direct calls wrapped in bash scripts
- Subagents invoke `node bin/orq-deploy.js` instead of MCP tools
- Because: API fallback ensures pipeline works without MCP

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@orq-ai/node@^3.2.8` | Node.js >= 20 | Required for MCP server mode. SDK auto-generated from OpenAPI spec, updates frequently. Pin to `^3.2` to avoid breaking changes. |
| `@orq-ai/evaluatorq@^1.0.7` | `@orq-ai/node@^3.x` | Part of orqkit monorepo. Requires `ORQ_API_KEY` env var for platform dataset access. |
| `@orq-ai/evaluators` | `@orq-ai/evaluatorq@^1.x` | Companion package. Cosine similarity evaluators require `OPENAI_API_KEY` for embeddings. |
| Orq.ai Agents API v2 | `@orq-ai/node@^3.x` | Agent versioning via `@version-number` tags. Orchestrator agents need `retrieve_agents` + `call_sub_agent` tools. |
| Claude Code MCP (HTTP transport) | Claude Code v2.1+ | `claude mcp add --transport http` for remote MCP servers. Requires `--scope project` for project-local registration. |
| A2A Protocol | v0.3 | Orq.ai agent runtime uses A2A task states. Specs should reference: `submitted`, `working`, `input_required`, `completed`, `failed`. |

## Sources

- [Orq.ai Agent API Documentation](https://docs.orq.ai/docs/agents/agent-api) -- Agent CRUD, invocation, orchestrator pattern, tool requirements. MEDIUM confidence (verified endpoints but not all method signatures).
- [Orq.ai MCP Documentation](https://docs.orq.ai/docs/common-architecture/mcp) -- MCP server setup, capabilities overview. MEDIUM confidence (confirmed existence; exact tool list not fully enumerated).
- [@orq-ai/node on npm](https://www.npmjs.com/package/@orq-ai/node) -- Version 3.2.8, TypeScript SDK, MCP server mode. HIGH confidence (npm verified).
- [@orq-ai/evaluatorq on npm](https://www.npmjs.com/package/@orq-ai/evaluatorq) -- Version 1.0.7, experiment runner with jobs and evaluators. HIGH confidence (npm verified).
- [@orq-ai/evaluators on npm](https://www.npmjs.com/package/@orq-ai/evaluators) -- Cosine similarity evaluators, requires OpenAI API key. MEDIUM confidence (version not pinned in search results).
- [orq-ai/orq-node GitHub](https://github.com/orq-ai/orq-node) -- SDK source, 102+ methods, standalone functions, FUNCTIONS.md. HIGH confidence.
- [orq-ai/orqkit GitHub](https://github.com/orq-ai/orqkit) -- Monorepo for evaluatorq and evaluators packages. MEDIUM confidence.
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) -- Six composable patterns, evaluator-optimizer, guardrails. HIGH confidence (official Anthropic publication).
- [Anthropic: Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system) -- Orchestrator-worker pattern in production. HIGH confidence.
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) -- Handoff and agent-as-tool patterns, guardrails. HIGH confidence (official OpenAI docs).
- [Google A2A Protocol](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/) -- A2A v0.3, task lifecycle states, framework-agnostic. HIGH confidence (official Google publication).
- [Orq.ai Datasets Overview](https://docs.orq.ai/docs/datasets/overview) -- Dataset structure, experiment integration. MEDIUM confidence (overview only, not full endpoint reference).
- [Orq.ai Evaluator Introduction](https://docs.orq.ai/docs/evaluator) -- Evaluator types, experiment integration. MEDIUM confidence.
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp) -- HTTP transport, scope options, header configuration. HIGH confidence.

---
*Stack research for: V2.0 Autonomous Orq.ai Pipeline -- additions to existing Claude Code skill*
*Researched: 2026-03-01*
