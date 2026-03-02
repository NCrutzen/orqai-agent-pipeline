# Agent Spec Template

Output template for individual Orq.ai agent specifications. The spec generator fills each `{{PLACEHOLDER}}` with values from the architect blueprint and reference files.

**Instructions:** Replace each `{{PLACEHOLDER}}` with the appropriate value from the architect blueprint and reference files. Omit sections marked "Not applicable" for agents that do not need them.

## Placeholder Legend

| Placeholder | Orq.ai API Field | Reference File |
|-------------|-----------------|----------------|
| `{{AGENT_KEY}}` | `key` | references/naming-conventions.md |
| `{{ROLE}}` | `role` | references/orqai-agent-fields.md |
| `{{DESCRIPTION}}` | `description` | references/orqai-agent-fields.md |
| `{{MODEL}}` | `model` | MCP models-list tool |
| `{{FALLBACK_MODELS}}` | `fallback_models` | MCP models-list tool |
| `{{INSTRUCTIONS}}` | `instructions` | references/orqai-agent-fields.md |
| `{{AGENT_ROLE_AND_PURPOSE}}` | Role definition within instructions | Derived from architect blueprint |
| `{{HEURISTIC_TASK_APPROACH}}` | Heuristic approach to core task (how a skilled human would approach it) | Derived from research brief |
| `{{BOUNDARIES_WITH_REASONS}}` | Constraints with WHY explanations (security, scope, data only) | Derived from research brief |
| `{{EXPECTED_RESPONSE_STRUCTURE}}` | Output format the agent should follow | Derived from architect blueprint |
| `{{CONTEXT_BUDGET_DIRECTIVES}}` | Context management directives (always present) | Standard pattern |
| `{{CANONICAL_EXAMPLES}}` | 1-2 example interactions in `<example>` tags | Derived from domain research |
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

> Use the MCP models-list tool to confirm model availability. Pick fallback models from the same tier but different providers.

## Instructions

```xml
<instructions>
{{AGENT_ROLE_AND_PURPOSE}}

<task_handling>
{{HEURISTIC_TASK_APPROACH}}
</task_handling>

<constraints>
{{BOUNDARIES_WITH_REASONS}}
</constraints>

<output_format>
{{EXPECTED_RESPONSE_STRUCTURE}}
</output_format>

<context_management>
{{CONTEXT_BUDGET_DIRECTIVES}}
</context_management>

<examples>
{{CANONICAL_EXAMPLES}}
</examples>
</instructions>
```

> The instructions field is the full system prompt using XML-tagged structure. Each section serves a specific purpose:
> - **Role and purpose**: 2-3 sentences establishing identity and authority
> - **task_handling**: Heuristic approach -- how a skilled human would do this work, not rigid flowcharts
> - **constraints**: Security, scope, and data boundaries with WHY each matters
> - **output_format**: Expected response structure
> - **context_management**: Always present -- directives for managing context window
> - **examples**: 1-2 canonical examples in `<example>` tags with `<input>` and `<output>` pairs
>
> **Conditional sections** (include only when applicable):
> - `<memory_patterns>` -- Include when Memory Store tools are present. Omit for agents without persistent memory needs.
> - `<delegation_framework>` -- Include for orchestrator agents only. See ORCHESTRATION.md for delegation details.
> - `<thinking_recommendation>` -- Advisory section. Orchestrators and complex reasoners: extended thinking recommended. Simple formatters: standard mode sufficient.

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
