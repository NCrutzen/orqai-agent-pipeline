# Orq.ai Orchestration Patterns

Three canonical patterns for agent orchestration in Orq.ai. Every swarm design maps to one of these. Subagents reference this to select the correct pattern and configure it properly.

## Pattern 1: Single Agent

```
User Input -> [agent] -> Output
```

**When to use:**
- One model can handle the entire task
- One set of tools is sufficient
- One responsibility boundary
- No parallel processing benefit

**Orq.ai configuration:** No orchestration fields needed. Standard agent with `key`, `role`, `instructions`, `model`, and optional `settings.tools`.

**This is the default.** Start here. Only move to multi-agent patterns when the complexity gate justifies it.

## Pattern 2: Sequential Pipeline

```
User Input -> [agent-a] -> [agent-b] -> [agent-c] -> Output
```

Each agent processes its phase and passes results to the next.

**When to use:**
- Distinct processing phases that benefit from different models or tools
- Each phase has a clear input/output contract
- Order matters -- later agents depend on earlier output
- Example: extract data (fast model) -> analyze (reasoning model) -> format (generation model)

**Orq.ai mechanism:** Task ID continuation. Each agent runs as a separate invocation. The output of agent A becomes the input of agent B via the application layer.

**Orq.ai configuration per agent:**
- Each agent is configured independently (separate `key`, `model`, `tools`)
- No `team_of_agents` needed -- the pipeline is managed by the calling application
- Use `thread.id` to maintain conversation context across agents if needed

## Pattern 3: Parallel Fan-Out with Orchestrator

```
User Input -> [orchestrator-agent]
                 |-> [sub-agent-1] (as tool)
                 |-> [sub-agent-2] (as tool)
                 |-> [sub-agent-3] (as tool)
              -> Orchestrator assembles -> Output
```

An orchestrator delegates independent subtasks to specialized sub-agents, then assembles results.

**When to use:**
- Multiple independent subtasks that can run in parallel
- Different specializations needed (e.g., research + analysis + writing)
- A coordinator is needed to merge results
- Example: research competitors (web search agent) + analyze data (code agent) + write report (generation agent)

**Orq.ai mechanism:** `team_of_agents` + `retrieve_agents` + `call_sub_agent` tools.

**Orq.ai configuration for orchestrator:**
```json
{
  "key": "domain-orchestrator-agent",
  "role": "Orchestrator",
  "team_of_agents": ["sub-agent-1-key", "sub-agent-2-key"],
  "settings": {
    "tools": [
      { "type": "retrieve_agents" },
      { "type": "call_sub_agent" }
    ]
  }
}
```

**Orq.ai configuration for sub-agents:** Standard agent configuration. Sub-agents do not know they are sub-agents -- they just respond to requests.

## Pattern Selection Criteria

| Characteristic | Single Agent | Sequential Pipeline | Parallel Fan-Out |
|---------------|-------------|-------------------|-----------------|
| Task phases | One phase | Multiple ordered phases | Multiple independent phases |
| Model needs | One model sufficient | Different models per phase | Different specializations |
| Tool overlap | All tools in one agent | Different tools per phase | Different tools per agent |
| Parallelism | N/A | No (sequential by definition) | Yes (independent subtasks) |
| Data flow | Direct | Linear chain | Fan-out then merge |
| Complexity | Lowest | Medium | Highest |

## Complexity Gate

**Default to single agent.** Multi-agent designs require explicit justification per additional agent.

### Five Valid Justifications

1. **Different model needed** -- e.g., vision model for image processing + text model for analysis
2. **Security boundary** -- e.g., agent handling PII must be isolated from external-facing agent
3. **Fundamentally different tool sets** -- e.g., one agent needs web search, another needs code execution
4. **Parallel execution benefit** -- e.g., multiple independent research tasks that should run concurrently
5. **Different runtime constraints** -- e.g., one agent needs 5-minute timeout, another needs 30 seconds

**If none of these justifications apply, MERGE into a single agent.**

### Warning Signs of Over-Engineering

- Multiple agents sharing the same model and similar tools
- Agents whose sole purpose is reformatting output from a previous agent
- Orchestration documentation longer than the combined agent specs
- More than 5 agents in a single swarm

### Maximum Agent Count

**Recommended maximum: 5 agents per swarm.** Beyond this:
- Decompose into sub-swarms with their own orchestrators
- Each sub-swarm handles a distinct domain
- A top-level orchestrator coordinates sub-swarms if needed

## Quick Reference

| Pattern | Orq.ai Mechanism | Key Fields |
|---------|-----------------|------------|
| Single | Standard agent | `key`, `model`, `tools` |
| Sequential | Task ID continuation | Independent agents, `thread.id` optional |
| Parallel | `team_of_agents` | `team_of_agents`, `retrieve_agents`, `call_sub_agent` |
