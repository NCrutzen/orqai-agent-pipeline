# Orchestration Template

Output template for swarm orchestration documentation. The spec generator fills each `{{PLACEHOLDER}}` with values from the architect blueprint and reference files.

**Instructions:** Replace each `{{PLACEHOLDER}}` with the appropriate value from the architect blueprint and reference files.

## Placeholder Legend

| Placeholder | Source | Reference File |
|-------------|--------|----------------|
| `{{SWARM_NAME}}` | Architect blueprint — swarm name | references/naming-conventions.md |
| `{{PATTERN}}` | Architect blueprint — orchestration pattern | references/orchestration-patterns.md |
| `{{AGENT_COUNT}}` | Architect blueprint — number of agents | references/orchestration-patterns.md |
| `{{COMPLEXITY_JUSTIFICATION}}` | Architect blueprint — why not single agent | references/orchestration-patterns.md |
| `{{AGENT_KEY}}` | Per-agent — agent key | references/naming-conventions.md |
| `{{ROLE}}` | Per-agent — role designation | references/orqai-agent-fields.md |
| `{{RESPONSIBILITY}}` | Per-agent — what this agent does | Architect blueprint |
| `{{TOOL_ASSIGNMENTS}}` | Agent-as-tool mapping | references/orqai-agent-fields.md |
| `{{DATA_FLOW}}` | Information flow between agents | Architect blueprint |
| `{{ERROR_HANDLING}}` | Failure/timeout behavior | references/orchestration-patterns.md |
| `{{HITL_POINTS}}` | Human approval decision points | Architect blueprint |

---

# {{SWARM_NAME}} — Orchestration

## Overview

| Property | Value |
|----------|-------|
| **Orchestration pattern** | {{PATTERN}} |
| **Agent count** | {{AGENT_COUNT}} |
| **Complexity justification** | {{COMPLEXITY_JUSTIFICATION}} |

> Patterns: `single` (one agent handles everything), `sequential` (pipeline of agents), `parallel` (orchestrator delegates to sub-agents). See `references/orchestration-patterns.md` for pattern selection criteria.
>
> For single-agent swarms, the remaining sections can be simplified — agent-as-tool assignments, data flow, and error handling are not applicable.

## Agents

| # | Agent Key | Role | Responsibility |
|---|-----------|------|----------------|
| 1 | `{{AGENT_KEY}}` | {{ROLE}} | {{RESPONSIBILITY}} |
| 2 | `{{AGENT_KEY}}` | {{ROLE}} | {{RESPONSIBILITY}} |
| ... | ... | ... | ... |

> List all agents in dependency order (agents that others depend on first). For single-agent swarms, list the single agent.

## Agent-as-Tool Assignments

{{TOOL_ASSIGNMENTS}}

> Which sub-agents are assigned as tools to which parent agents. Format:
>
> | Parent Agent | Sub-Agent Tools | Purpose |
> |-------------|----------------|---------|
> | `orchestrator-agent` | `sub-agent-a`, `sub-agent-b` | Delegates research and analysis |
>
> The parent agent needs `retrieve_agents` and `call_sub_agent` tools configured, plus `team_of_agents` listing sub-agent keys.
>
> Not applicable for single-agent swarms — omit this section.

## Data Flow

{{DATA_FLOW}}

> What information passes between agents. Include a flow diagram:
>
> ```
> User Input
>   -> [agent-a] extracts data
>     -> [agent-b] analyzes extracted data
>       -> [agent-c] generates report
>         -> Final Output
> ```
>
> For parallel patterns:
> ```
> User Input -> [orchestrator]
>                 |-> [sub-agent-1] -> result-1
>                 |-> [sub-agent-2] -> result-2
>               [orchestrator] assembles results -> Final Output
> ```
>
> Not applicable for single-agent swarms — omit this section.

## Error Handling

{{ERROR_HANDLING}}

> What happens when a sub-agent fails or times out. Define for each agent:
>
> | Agent | On Failure | On Timeout | Retry Strategy |
> |-------|-----------|-----------|----------------|
> | `agent-a` | Skip and log | Return partial | 1 retry |
> | `agent-b` | Escalate to orchestrator | Fail task | No retry |
>
> Consider: fallback models, graceful degradation, partial results, human escalation.
>
> Not applicable for single-agent swarms — omit this section.

## Human-in-the-Loop

{{HITL_POINTS}}

> Decision points where human approval is needed before proceeding. Use `requires_approval: true` on the relevant tools.
>
> | Decision Point | Agent | Trigger | What Human Reviews |
> |---------------|-------|---------|-------------------|
> | High-value action | `agent-a` | Amount > threshold | Action details, risk assessment |
> | Sensitive data | `agent-b` | PII detected | Data handling plan |
>
> Not applicable if no human approval points — omit this section.

## Setup Steps

Configure this swarm in Orq.ai Studio:

1. **Create agents in dependency order** — create sub-agents before orchestrator agents that reference them
2. For each agent:
   - Navigate to Agents in Orq.ai Studio
   - Click "Create Agent"
   - Set key, role, description per the agent spec file
   - Configure model, instructions, and tools per the agent spec file
3. **Configure orchestration** (if multi-agent):
   - On the orchestrator agent, set `team_of_agents` to list sub-agent keys
   - Add `retrieve_agents` and `call_sub_agent` tools to the orchestrator
4. **Test individual agents** — run each agent standalone with sample inputs from the dataset
5. **Test the full swarm** — run the orchestrator (or first agent in pipeline) with end-to-end test inputs
6. **Verify error handling** — test with invalid inputs and simulate sub-agent failures
