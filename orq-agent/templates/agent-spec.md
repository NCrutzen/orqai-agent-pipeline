# Agent Spec Template

Output template for individual Orq.ai agent specifications. The spec generator fills each `{{PLACEHOLDER}}` with values from the architect blueprint and reference files.

**Instructions:** Replace each `{{PLACEHOLDER}}` with the appropriate value from the architect blueprint and reference files. Omit sections marked "Not applicable" for agents that do not need them.

## Placeholder Legend

| Placeholder | Orq.ai API Field | Reference File |
|-------------|-----------------|----------------|
| `{{AGENT_KEY}}` | `key` | references/naming-conventions.md |
| `{{ROLE}}` | `role` | references/orqai-agent-fields.md |
| `{{DESCRIPTION}}` | `description` | references/orqai-agent-fields.md |
| `{{MODEL}}` | `model` | references/orqai-model-catalog.md |
| `{{FALLBACK_MODELS}}` | `fallback_models` | references/orqai-model-catalog.md |
| `{{INSTRUCTIONS}}` | `instructions` | references/orqai-agent-fields.md |
| `{{TOOLS_BUILTIN}}` | `settings.tools` (built-in types) | references/orqai-agent-fields.md |
| `{{TOOLS_FUNCTION}}` | `settings.tools` (function type) | references/orqai-agent-fields.md |
| `{{TOOLS_HTTP}}` | `settings.tools` (http type) | references/orqai-agent-fields.md |
| `{{TOOLS_CODE}}` | `settings.tools` (code type) | references/orqai-agent-fields.md |
| `{{TOOLS_AGENT}}` | `settings.tools` (agent types) + `team_of_agents` | references/orqai-agent-fields.md |
| `{{CONTEXT}}` | `knowledge_bases`, `memory_stores`, `variables` | references/orqai-agent-fields.md |
| `{{EVALUATORS}}` | Evaluator configuration | references/orqai-agent-fields.md |
| `{{GUARDRAILS}}` | Guardrail configuration | references/orqai-agent-fields.md |
| `{{MAX_ITERATIONS}}` | `settings.max_iterations` | references/orqai-agent-fields.md |
| `{{MAX_EXECUTION_TIME}}` | `settings.max_execution_time` | references/orqai-agent-fields.md |
| `{{INPUT_TEMPLATE}}` | Input message template | references/orqai-agent-fields.md |
| `{{OUTPUT_TEMPLATE}}` | Output format specification | references/orqai-agent-fields.md |

---

# {{AGENT_KEY}}

## Configuration

| Field | Value |
|-------|-------|
| **Key** | `{{AGENT_KEY}}` |
| **Role** | {{ROLE}} |
| **Description** | {{DESCRIPTION}} |

## Model

**Primary model:** `{{MODEL}}`

**Fallback models** (ordered):

{{FALLBACK_MODELS}}

> Pick fallback models from the same tier but different providers. See `references/orqai-model-catalog.md` for recommendations.

## Instructions

{{INSTRUCTIONS}}

> The instructions field is the full system prompt. Include behavioral guidelines, task handling directives, output format requirements, and any constraints the agent must follow.

## Tools

### Built-in Tools

{{TOOLS_BUILTIN}}

> Built-in tools: `current_date`, `google_search`, `web_scraper`. Configure as `{ "type": "<identifier>" }`. Not applicable for this agent — omit when configuring in Orq.ai Studio.

### Function Tools

{{TOOLS_FUNCTION}}

> Function tools require JSON Schema parameters:
> ```json
> {
>   "type": "function",
>   "function": {
>     "name": "tool_name",
>     "description": "What this tool does",
>     "parameters": { "type": "object", "properties": {...}, "required": [...] }
>   }
> }
> ```
> Not applicable for this agent — omit when configuring in Orq.ai Studio.

### HTTP Tools

{{TOOLS_HTTP}}

> HTTP tools for external API integration:
> ```json
> {
>   "type": "http",
>   "blueprint": { "url": "...", "method": "GET|POST|...", "headers": {...}, "body": "..." }
> }
> ```
> Not applicable for this agent — omit when configuring in Orq.ai Studio.

### Code Tools

{{TOOLS_CODE}}

> Python code tools for computation:
> ```json
> {
>   "type": "code",
>   "language": "python",
>   "code": "...",
>   "parameters": { "type": "object", "properties": {...} }
> }
> ```
> Not applicable for this agent — omit when configuring in Orq.ai Studio.

### Agent Tools (Sub-Agents)

{{TOOLS_AGENT}}

> For orchestrator agents that delegate to sub-agents. Requires:
> - `team_of_agents`: list of sub-agent keys
> - `retrieve_agents` tool: discover available sub-agents
> - `call_sub_agent` tool: invoke a sub-agent
>
> Not applicable for this agent — omit when configuring in Orq.ai Studio.

## Context

{{CONTEXT}}

> Context includes knowledge bases (`knowledge_bases`), memory stores (`memory_stores`), and variables (`variables`) the agent needs. Specify knowledge base IDs, memory entity IDs, and any key-value variables for template replacement in instructions.
>
> Not applicable for this agent — omit when configuring in Orq.ai Studio.

## Evaluators

{{EVALUATORS}}

> Evaluator configuration for monitoring agent quality. Define metrics, thresholds, and evaluation criteria.
>
> Not applicable for this agent — omit when configuring in Orq.ai Studio.

## Guardrails

{{GUARDRAILS}}

> Guardrail configuration for safety and compliance. Define input/output filters, content policies, and boundary constraints.
>
> Not applicable for this agent — omit when configuring in Orq.ai Studio.

## Runtime Constraints

| Constraint | Value |
|-----------|-------|
| **Max iterations** | {{MAX_ITERATIONS}} |
| **Max execution time** | {{MAX_EXECUTION_TIME}} seconds |

> Recommended: 3-15 iterations, ~300s execution time. Adjust based on task complexity.

## Input/Output Templates

### Input Template

{{INPUT_TEMPLATE}}

> Define the expected input message format using `{{variables}}` syntax. Example:
> ```
> Analyze the following document: {{document_text}}
> Focus on: {{analysis_focus}}
> ```

### Output Template

{{OUTPUT_TEMPLATE}}

> Define the expected output format. Example:
> ```
> ## Analysis Results
> **Summary:** {{summary}}
> **Key Findings:** {{findings}}
> **Recommendations:** {{recommendations}}
> ```
