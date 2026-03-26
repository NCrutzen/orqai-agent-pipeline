# Orq.ai Agent API v2 - Field Reference

Authoritative reference for all Orq.ai Agent API v2 fields. Subagents load this to produce valid agent specs without hallucinating field names, types, or constraints.

**Scope:** Request-side fields only (what you send to create/run an agent). Response schemas are excluded.

## Core Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Unique identifier. Pattern: `^[A-Za-z][A-Za-z0-9]*([._-][A-Za-z0-9]+)*$`. Immutable after creation. Supports `@version-number` suffix (e.g., `invoice-validator-agent@2`). See naming-conventions.md. |
| `role` | string | Yes | Agent's professional designation (e.g., "Data Analyst", "Customer Support Triage"). Displayed in Orq.ai Studio. |
| `description` | string | Yes | Brief purpose summary. Used in the Orq.ai Configuration description field and by orchestrators to understand agent capabilities. |
| `instructions` | string | Yes | Full system prompt with behavioral guidelines, task handling directives, and output format requirements. This is the core of the agent's behavior. |
| `model` | string or object | Yes | Model ID as string (`provider/model-name`) or object: `{ "id": "provider/model-name", "parameters": { "cache": {...}, "guardrails": [...], "load_balancer": {...}, "response_format": {...}, "reasoning_effort": "low"\|"medium"\|"high", "thinking": {...}, "timeout": 300 }, "retry": { "count": 3, "on_codes": [429, 500] } }`. See Model Parameters and orqai-model-catalog.md. |
| `fallback_models` | array of strings | No | Ordered list of alternative model IDs if primary model fails. Same `provider/model-name` format. Pick same-tier models from different providers. |
| `settings.max_iterations` | integer | No | Maximum processing loops the agent can execute. Recommended: 3-15 depending on task complexity. |
| `settings.max_execution_time` | integer | No | Timeout in seconds. Recommended: ~300s for standard tasks. Increase for complex multi-step workflows. |
| `settings.tools` | array | No | Array of tool configurations. See Tool Types table below. |
| `system_prompt` | string | No | Additional system-level instructions beyond `instructions`. Use for context that should persist across conversation turns. |
| `knowledge_bases` | array | No | Connected knowledge base references. Each entry: `{ "knowledge_id": "..." }`. Agent can query these via KB tools. |
| `memory_stores` | array | No | Persistent memory store identifiers. Enables long-term memory across sessions via memory tools. |
| `team_of_agents` | array of objects | No | Sub-agent assignments for hierarchical workflows. Each entry: `{ "key": "sub-agent-key", "role": "description of what this sub-agent does" }`. The parent agent must also have `retrieve_agents` and `call_sub_agent` tools configured. |
| `path` | string | No | Project location in Orq.ai Studio (e.g., "Default/agents"). |
| `variables` | object | No | Key-value pairs for template replacement in instructions. Values are substituted at runtime using `{{variable_name}}` syntax. |
| `identity` | object | No | Contact information: `{ "id": "...", "display_name": "...", "email": "...", "metadata": {...}, "tags": [...] }`. |
| `thread` | object | No | Groups related invocations: `{ "id": "...", "tags": [...] }`. Use for conversation continuity. |
| `response_format` | object | No | Response format configuration. Use `{ "type": "json_schema", "json_schema": { "name": "...", "strict": true, "schema": {JSON Schema} } }` for structured output. ALWAYS use `json_schema` with `strict: true` -- never use `json_object` (causes hallucinated fields and missing required fields). When using model-as-object form, `response_format` can also go inside `model.parameters.response_format` (the top-level field is equivalent and still works). |
| `settings.evaluators` | array | No | Deploy-time evaluator attachment. Each entry: `{ "id": "evaluator-platform-id", "execute_on": "output", "sample_rate": 100 }`. Resolve evaluator IDs via `GET /v2/evaluators`. Used for Control Tower integration. |
| `settings.guardrails` | array | No | Deploy-time guardrail attachment. Same structure as `settings.evaluators`: `{ "id": "guardrail-platform-id", "execute_on": "output", "sample_rate": 100 }`. Applied at runtime to every agent invocation. |
| `settings.max_cost` | number | No | Maximum cost limit in USD per invocation. Agent execution stops if cost exceeds this threshold. |
| `settings.tool_approval_required` | string | No | Tool approval mode: `"all"` (approve every tool call), `"respect_tool"` (use per-tool `requires_approval`), or `"none"` (no approval needed). Default: `"respect_tool"`. |
| `memory` | object | No | Memory configuration: `{ "entity_id": "..." }`. Links agent to a memory entity for persistent recall. |

## Tool Types

All tools support `requires_approval` (boolean) for human-in-the-loop gating.

| Type | Identifier | Configuration | When to Use |
|------|-----------|---------------|-------------|
| Current Date | `current_date` | `{ "type": "current_date" }` | Agent needs today's date for time-sensitive tasks |
| Google Search | `google_search` | `{ "type": "google_search" }` | Agent needs to search the web for information |
| Web Scraper | `web_scraper` | `{ "type": "web_scraper" }` | Agent needs to extract content from a specific URL |
| Function | `function` | `{ "type": "function", "function": { "name": "...", "description": "...", "parameters": {JSON Schema} } }` | Custom business logic with typed parameters |
| Code | `code` | `{ "type": "code", "language": "python", "code": "...", "parameters": {JSON Schema} }` | Executable Python scripts for computation |
| HTTP | `http` | `{ "type": "http", "blueprint": { "url": "...", "method": "...", "headers": {...}, "body": "..." } }` | External API integration (REST calls) |
| MCP | `mcp` | `{ "type": "mcp", "server_url": "...", "connection_type": "http" }` | Model Context Protocol services |
| KB Discovery | `retrieve_knowledge_bases` | `{ "type": "retrieve_knowledge_bases" }` | Discover available knowledge sources |
| KB Query | `query_knowledge_base` | `{ "type": "query_knowledge_base" }` | Search specific knowledge bases for information |
| Memory Discovery | `retrieve_memory_stores` | `{ "type": "retrieve_memory_stores" }` | Discover available memory stores |
| Memory Query | `query_memory_store` | `{ "type": "query_memory_store" }` | Search memory documents for stored information |
| Memory Write | `write_memory_store` | `{ "type": "write_memory_store" }` | Store information persistently across sessions |
| Memory Delete | `delete_memory_document` | `{ "type": "delete_memory_document" }` | Remove specific memory entries |
| Agent Discovery | `retrieve_agents` | `{ "type": "retrieve_agents" }` | Discover sub-agents in a team (multi-agent only) |
| Agent Invocation | `call_sub_agent` | `{ "type": "call_sub_agent" }` | Invoke a sub-agent for task delegation (multi-agent only) |

**Multi-agent requirement:** An orchestrator agent using sub-agents must have both `retrieve_agents` and `call_sub_agent` tools, plus `team_of_agents` listing the sub-agent keys.

## Response Format

When an agent must produce structured or JSON output, configure the `response_format` field to enforce schema compliance.

### json_schema with strict mode (ALWAYS use this)

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "agent_output",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "result": { "type": "string", "description": "The agent's output" },
        "confidence": { "type": "number", "description": "Confidence score 0-1" }
      },
      "required": ["result", "confidence"],
      "additionalProperties": false
    }
  }
}
```

- `strict: true` enforces exact schema compliance -- the model output will match the schema precisely
- `name` is a descriptive identifier for the schema (e.g., `triage_classification`, `invoice_extraction`)
- `schema` follows JSON Schema Draft 2020-12 format, same as function tool parameter schemas
- `additionalProperties: false` is recommended with strict mode to prevent extra fields

### Anti-pattern: json_object (NEVER use this)

Do NOT use `{ "type": "json_object" }` for response format. The `json_object` type tells the model to produce JSON but provides no schema enforcement. This causes:

- **Hallucinated field names** -- the model invents field names not in your expected schema
- **Missing required fields** -- the model omits fields it considers optional
- **Inconsistent structure** -- output shape varies across invocations

### When to use response_format

- Any agent that must produce structured/JSON output (classifiers, extractors, formatters, data transformers)
- Agents whose output is consumed by downstream code or other agents that parse specific fields
- Do NOT use for conversational agents that produce free-text responses

## Task States

Task states govern orchestration flow, especially for sequential pipelines using task ID continuation.

| State | Description | Transitions To |
|-------|-------------|----------------|
| `submitted` | Queued for processing | `working` |
| `working` | Active execution in progress | `completed`, `failed`, `input_required` |
| `input_required` | Awaiting user or tool input | `working` (via `task_id` continuation) |
| `completed` | Successfully finished | Terminal |
| `failed` | Execution error occurred | Terminal |
| `canceled` | User-initiated termination | Terminal |

**Critical constraint:** A task must be in an INACTIVE state (`input_required`, `completed`, `failed`, or `canceled`) before it can be continued with `task_id`. Attempting to continue an active (`working`) task will fail.

## Model Format

All models use `provider/model-name` format. Examples:
- `anthropic/claude-sonnet-4-5`
- `openai/gpt-4o`
- `google-ai/gemini-2.5-flash`

For the full provider list and use-case recommendations, see `orqai-model-catalog.md`.

## Model Parameters

When using the object form of `model`, these parameters are available inside `model.parameters`:

| Parameter | Type | Description |
|-----------|------|-------------|
| `thinking` | object | Thinking/reasoning config. Options: `{ "type": "disabled" }`, `{ "type": "enabled", "budget_tokens": 4096, "thinking_level": "low"\|"medium"\|"high" }`, or `{ "type": "adaptive" }`. Use "enabled" for complex reasoning tasks. |
| `reasoning_effort` | string | Shorthand reasoning control: `"low"`, `"medium"`, or `"high"`. Alternative to the full `thinking` object for models that support it. |
| `response_format` | object | Same as the top-level `response_format` field. Can be placed here when using model-as-object form. |
| `cache` | object | Response caching config: `{ "type": "exact_match", "ttl": 1800 }`. TTL range: 1-259200 seconds (max 3 days). **NOTE:** Caching is an AI Gateway feature. It works when the agent's underlying model calls go through the Gateway (`/v2/router/chat/completions`). For standard agent execution via `/v2/agents/{id}/execute`, caching behavior depends on the platform's internal routing. |
| `load_balancer` | object | Weighted multi-model routing configuration. Distributes requests across multiple models based on weights. |
| `guardrails` | array | Model-level guardrail configuration (separate from `settings.guardrails` which applies at the agent level). |
| `timeout` | integer | Model-level timeout in seconds. |

### Model Retry Configuration

The `model.retry` object controls automatic retry behavior:

```json
{
  "model": {
    "id": "anthropic/claude-sonnet-4-5",
    "parameters": { "thinking": { "type": "adaptive" } },
    "retry": { "count": 3, "on_codes": [429, 500, 502, 503] }
  }
}
```

### Thinking Configuration Examples

```json
// Disabled (default for most agents)
{ "thinking": { "type": "disabled" } }

// Enabled with budget
{ "thinking": { "type": "enabled", "budget_tokens": 4096, "thinking_level": "medium" } }

// Adaptive (model decides)
{ "thinking": { "type": "adaptive" } }
```

## Multimodal Message Format

Agents support file attachments via the A2A message parts format. Use this when agents process images or PDFs.

```json
{
  "message": {
    "role": "user",
    "parts": [
      { "kind": "text", "text": "Analyze this invoice" },
      {
        "kind": "file",
        "file": {
          "bytes": "base64-encoded-content",
          "mimeType": "application/pdf",
          "name": "invoice.pdf"
        }
      }
    ]
  }
}
```

**File type rules:**
- **Images:** Support both URL (`uri` field) and base64 (`bytes` field). Supported types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`.
- **PDFs:** Base64 (`bytes`) ONLY -- `uri` is NOT supported for PDFs. Type: `application/pdf`.
- **Mandatory fields:** `mimeType` must always be specified. `name` is optional but recommended.
- **Model requirement:** The agent's model must be vision-capable (e.g., `openai/gpt-4o`, `google-ai/gemini-2.5-flash`, `anthropic/claude-sonnet-4-5`). Non-vision models will ignore file parts.
