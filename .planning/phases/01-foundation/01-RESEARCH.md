# Phase 1: Foundation - Research

**Researched:** 2026-02-24
**Domain:** Orq.ai reference knowledge, output templates, architect subagent design
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ARCH-01 | Architect subagent analyzes use case and determines agent count (with complexity gate defaulting to single-agent) | Anthropic's "Building Effective Agents" guide provides the decision framework: start simplest, add complexity only when demonstrably needed. Complexity gate pattern documented below. |
| ARCH-02 | Architect subagent defines each agent's role, responsibilities, and relationship to other agents | Blueprint output format documented in Architecture Patterns section. Role/responsibility assignment follows Orq.ai's `role` and `description` fields. |
| ARCH-03 | Architect subagent determines orchestration pattern: single agent, sequential pipeline, or parallel fan-out with orchestrator | Three canonical Orq.ai patterns documented in reference content. Pattern selection criteria provided. |
| ARCH-04 | Architect subagent identifies which agents should be assigned as tools to an orchestrator agent | Orq.ai's `team_of_agents` field + `retrieve_agents`/`call_sub_agent` tool types are the native mechanism. Documented in Orq.ai API reference. |
| SPEC-10 | Agent spec includes key following `[domain]-[role]-agent` kebab-case convention | Key format constraint: `^[A-Za-z][A-Za-z0-9]*([._-][A-Za-z0-9]+)*$`. Naming convention rules documented below. |
| OUT-01 | Output follows directory structure: `Agents/[swarm-name]/ORCHESTRATION.md`, `agents/[agent-name].md`, `datasets/`, `README.md` | Directory structure template documented. Template files define the exact format for each output type. |
| OUT-02 | Naming convention enforced: `[domain]-[role]-agent` kebab-case for agent keys, swarm directory matches domain | Naming convention reference documented with validation regex and examples. |
| OUT-04 | Output is machine-parseable -- structured consistently so future Orq.ai MCP can consume it programmatically | Template sections map 1:1 to Orq.ai API fields. Consistent markdown heading structure enables future parsing. |
</phase_requirements>

## Summary

Phase 1 delivers three categories of work: (1) reference files that encode Orq.ai platform knowledge so downstream subagents produce valid output without hallucinating field names or model identifiers, (2) output templates that define the exact format for each generated file type so output is consistent and machine-parseable, and (3) the architect subagent that analyzes use cases and produces a swarm blueprint. This phase has no novel technical challenges -- it is primarily content authoring and prompt engineering -- but the content must be precise because every downstream phase depends on it.

The architect subagent is the critical deliverable. It must implement a "complexity gate" that defaults to single-agent designs and requires explicit justification for each additional agent. This is based on Anthropic's guidance: "we recommend finding the simplest solution possible, and only increasing complexity when needed" and "agentic systems often trade latency and cost for better task performance" requiring justification. The complexity gate cannot be retrofitted -- it must be structural in the architect's prompt from day one.

**Primary recommendation:** Build reference files first (they have no dependencies), then templates (depend on references for field names), then the architect subagent (depends on both for pattern knowledge). Test the architect with 3-5 sample use cases of varying complexity to validate the complexity gate before moving to Phase 2.

## Standard Stack

### Core

| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| Claude Code Subagents | v2.1+ | Architect subagent definition | `.claude/agents/architect.md` with YAML frontmatter. Isolated context, restricted tools, model selection per agent. |
| Markdown files | -- | Reference docs, templates, output format | No dependencies, human-readable, git-friendly, parseable. The entire skill is markdown -- no runtime code. |
| Orq.ai Agents API | v2 | Target schema for all references | `POST /v2/agents/run` defines every field the references must document. Key, role, description, instructions, model, settings, tools, team_of_agents. |
| JSON Schema | draft-2020-12 | Tool parameter definitions in references | Orq.ai function tools require JSON Schema for parameters. Reference files must include schema examples. |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| Read, Glob, Grep | Architect subagent tools | Architect needs read-only access to reference files and user input. No write access needed at architecture stage. |
| WebSearch | Architect subagent tool (optional) | Only if the architect needs to research unfamiliar domains. Can be omitted for v1 to keep the architect focused. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate reference files per domain | Single monolithic reference file | Monolithic is simpler to load but impossible to maintain. Separate files mean updating the model catalog does not risk breaking the field reference. Use separate. |
| Markdown templates | Handlebars/Jinja templates | Template engines add dependencies and complexity. Markdown with placeholder comments (`<!-- AGENT_KEY -->`) is sufficient for Claude to fill in. No template engine. |
| Fixed model for architect | Inherit model from user | Architect makes critical decisions (agent count, pattern selection). Should use the best available model. Recommend `model: opus` or `model: inherit` with documentation that quality matters here. |

## Architecture Patterns

### Recommended Project Structure (Phase 1 Scope)

```
orq-agent/
  agents/
    architect.md               # Architect subagent (Phase 1 deliverable)
  templates/
    agent-spec.md              # Template: individual agent spec output
    orchestration.md           # Template: ORCHESTRATION.md output
    dataset.md                 # Template: dataset output
    readme.md                  # Template: swarm README output
  references/
    orqai-agent-fields.md      # Complete Orq.ai agent field reference
    orqai-model-catalog.md     # Model providers, IDs, capabilities, recommendations
    orchestration-patterns.md  # Single / sequential / parallel patterns
    naming-conventions.md      # [domain]-[role]-agent rules + validation
```

### Pattern 1: Complexity Gate (Architect Core Logic)

**What:** The architect subagent evaluates a use case and defaults to a single-agent design. Multi-agent designs require the architect to document a specific justification for each additional agent.

**When to use:** Every architect invocation. This is not optional.

**Decision framework (from Anthropic + project pitfalls research):**

```
1. START with single-agent assumption
2. For each proposed additional agent, require ONE of:
   a. Different model needed (e.g., vision model for image processing + text model for analysis)
   b. Security boundary (e.g., agent handling PII must be isolated from external-facing agent)
   c. Fundamentally different tool sets (e.g., one agent needs web search, another needs code execution)
   d. Parallel execution benefit (e.g., multiple independent research tasks)
   e. Different runtime constraints (e.g., one agent needs 5 min timeout, another needs 30s)
3. If NO justification exists, MERGE into the single agent
4. Maximum recommended: 5 agents per swarm (beyond this, recommend decomposing into sub-swarms)
```

**Warning signs of over-engineering:**
- Multiple agents sharing the same model and similar tools
- Agents whose sole purpose is reformatting output from a previous agent
- Orchestration documentation longer than the combined agent specs

### Pattern 2: Blueprint Output Format (Architect -> Downstream)

**What:** The architect produces a structured blueprint that all downstream subagents consume. This is the data contract for the entire pipeline.

**Blueprint structure:**

```markdown
## ARCHITECTURE COMPLETE

**Swarm name:** [domain]-swarm
**Agent count:** [N]
**Pattern:** [single | sequential | parallel-with-orchestrator]
**Complexity justification:** [why not single agent, if multi]

### Agents

#### 1. [agent-key]
- **Role:** [role description]
- **Responsibility:** [what this agent does]
- **Model recommendation:** [provider/model-name]
- **Tools needed:** [list of Orq.ai tool types]
- **Receives from:** [upstream agent or "user input"]
- **Passes to:** [downstream agent or "final output"]

#### 2. [agent-key] (if multi-agent)
[same structure]

### Orchestration

- **Orchestrator:** [agent-key] (if parallel pattern)
- **Agent-as-tool assignments:** [which agents are tools of which]
- **Data flow:** [what passes between agents]
- **Error handling:** [what happens on failure]
```

### Pattern 3: Reference Injection via files_to_read

**What:** The architect subagent prompt includes `files_to_read` directives to load reference files at spawn time. This ensures the architect has authoritative Orq.ai knowledge without hardcoding it in the prompt.

**Example (architect.md prompt):**

```markdown
<files_to_read>
- references/orchestration-patterns.md
- references/orqai-model-catalog.md
- references/naming-conventions.md
</files_to_read>
```

**Why:** Reference files change independently of the architect prompt. Model catalog updates monthly; orchestration patterns are stable. Separating them means updating one does not risk breaking the other.

### Anti-Patterns to Avoid

- **Hardcoding Orq.ai field names in architect prompt:** Use the reference file. When Orq.ai adds a field, update one file, not every subagent.
- **Architect recommending tools without checking catalog:** The tool type reference must list which tool types exist and when each is appropriate. The architect should cite the reference, not guess.
- **Generating the blueprint AND the specs in one agent:** The architect produces the blueprint only. Spec generation is Phase 2. Mixing them creates a monolithic agent that cannot be tested or iterated independently.
- **Skip testing architect with simple use cases:** If the first test case is complex (5+ agents), the complexity gate will never be validated. Test with "a chatbot that answers FAQ" first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Orq.ai field validation | Custom JSON validator for agent specs | Reference file with field descriptions + constraints | The spec generator (Phase 2) will use the reference as a checklist. A validator is premature. |
| Model capability lookup | Hardcoded model-to-capability mapping | `orqai-model-catalog.md` with provider/model/capabilities columns | Orq.ai has 300+ models across 17+ providers. A static reference file is maintainable; a lookup table in code is not. |
| Agent key validation | Regex validator in architect prompt | Naming convention reference with regex pattern and examples | The regex `^[A-Za-z][A-Za-z0-9]*([._-][A-Za-z0-9]+)*$` is in Orq.ai docs. Document it once, reference everywhere. |
| Orchestration pattern selection | Complex decision tree in code | Pattern reference file with "when to use" criteria | Three patterns (single, sequential, parallel). A reference table is clearer than programmatic logic. |

**Key insight:** Phase 1 is content, not code. Every "tool" is a markdown reference file. The architect subagent is a prompt, not a program. Hand-rolling code here would be building infrastructure that does not need to exist.

## Common Pitfalls

### Pitfall 1: Over-Engineering Agent Count (The "Bag of Agents" Trap)

**What goes wrong:** The architect designs swarms with 5-7 agents for use cases that need 1-2. Research shows >40% of agentic AI projects get cancelled due to unanticipated complexity from multi-agent systems.
**Why it happens:** The tool is designed for multi-agent systems, so it biases toward multi-agent solutions. LLMs generate more content when asked to "design" something.
**How to avoid:** Complexity gate (Pattern 1 above). Default to single agent. Require documented justification per additional agent. Cap at 5 agents per swarm.
**Warning signs:** Multiple agents sharing same model/tools. Agents that only reformat. Orchestration docs longer than specs.

### Pitfall 2: Reference Files That Are Too Verbose

**What goes wrong:** Reference files balloon to 5000+ words, consuming the context window when loaded by subagents. The subagent runs out of reasoning space and produces shallow output.
**Why it happens:** Trying to document every edge case in the Orq.ai API. Including full API response schemas when only request schemas matter.
**How to avoid:** Each reference file targets under 1500 words. Include only what subagents need to PRODUCE output, not everything that EXISTS in the API. Split into focused files rather than one comprehensive doc.
**Warning signs:** Reference files over 2000 words. Subagents producing generic output despite having references loaded. References including response schemas (not needed for spec generation).

### Pitfall 3: Templates Without Clear Placeholder Boundaries

**What goes wrong:** Templates use ambiguous placeholders like `[description]` that the LLM interprets as instructions rather than fill-in-the-blank markers. The spec generator outputs the literal text `[description]` or replaces the wrong section.
**Why it happens:** Markdown does not have a formal placeholder syntax. Square brackets, curly braces, and angle brackets all have existing semantics in markdown.
**How to avoid:** Use a consistent, unambiguous placeholder format: `{{FIELD_NAME}}` with ALL_CAPS. Include a legend at the top of each template mapping placeholders to the reference file field they correspond to. Add explicit instructions: "Replace each `{{PLACEHOLDER}}` with the appropriate value from the architect blueprint."
**Warning signs:** Generated specs that still contain placeholder text. Spec generator asking for clarification on what to fill in. Inconsistent placeholder formats across templates.

### Pitfall 4: Architect Prompt Without Concrete Examples

**What goes wrong:** The architect receives a well-structured prompt with decision criteria but no examples of what good output looks like. It produces output that technically follows instructions but has inconsistent formatting, missing fields, or wrong level of detail.
**Why it happens:** Prompt engineering that focuses on rules without few-shot examples. The LLM needs to see the target format, not just read about it.
**How to avoid:** Include 2-3 concrete examples in the architect prompt: (1) a simple use case that correctly resolves to single agent, (2) a moderate use case that resolves to 2-3 agents with justification, (3) a complex use case that resolves to parallel pattern. These examples are the strongest calibration mechanism.
**Warning signs:** Architect output that varies wildly in format between invocations. Fields present in one run but missing in another. Inconsistent agent naming.

### Pitfall 5: Naming Convention Reference Without Validation Examples

**What goes wrong:** The naming convention reference states the rule (`[domain]-[role]-agent`) but does not show enough examples of valid AND invalid names. Users and downstream agents produce keys like `InvoiceValidator` or `invoice_validation_agent` that violate the pattern.
**Why it happens:** Rules without examples are ambiguous. "Kebab-case" means different things to different people.
**How to avoid:** Include 10+ examples of valid keys AND 5+ examples of invalid keys with explanations of why they are wrong. Include the Orq.ai regex pattern `^[A-Za-z][A-Za-z0-9]*([._-][A-Za-z0-9]+)*$` with an explanation of what it means.
**Warning signs:** Generated agent keys that do not match the convention. Downstream agents using camelCase or snake_case.

## Code Examples

### Example 1: Architect Subagent Frontmatter

```yaml
---
name: orq-architect
description: Analyzes use cases and designs Orq.ai agent swarm topology. Determines agent count, roles, orchestration pattern, and agent-as-tool assignments. Defaults to single-agent design with complexity gate.
tools: Read, Glob, Grep
model: inherit
---
```

Source: Claude Code subagent documentation pattern. `tools` restricted to read-only (architect does not write files). `model: inherit` uses the user's selected model for maximum quality on architectural decisions.

### Example 2: Orq.ai Agent Key Naming Convention

```
Valid keys:
  invoice-validator-agent        # [domain]-[role]-agent
  hr-onboarding-agent            # [domain]-[role]-agent
  customer-support-triage-agent  # [domain]-[role]-[qualifier]-agent
  data-extraction-agent          # [domain]-[role]-agent

Invalid keys:
  InvoiceValidator               # No camelCase
  invoice_validator_agent        # No underscores (use hyphens)
  agent-invoice-validator        # "agent" must be suffix, not prefix
  invoice validator agent        # No spaces
  123-invoice-agent              # Must start with letter

Regex: ^[A-Za-z][A-Za-z0-9]*([._-][A-Za-z0-9]+)*$
```

Source: Orq.ai API documentation, agent key parameter constraint.

### Example 3: Orq.ai team_of_agents Configuration (Multi-Agent)

```json
{
  "key": "customer-support-orchestrator-agent",
  "role": "Orchestrator",
  "team_of_agents": ["customer-triage-agent", "customer-escalation-agent"],
  "settings": {
    "tools": [
      { "type": "retrieve_agents" },
      { "type": "call_sub_agent" }
    ]
  }
}
```

Source: Orq.ai Agent API documentation. The orchestrator agent must have both `retrieve_agents` and `call_sub_agent` tools to use sub-agents. Sub-agents must exist before being referenced.

### Example 4: Orq.ai Function Tool Schema

```json
{
  "type": "function",
  "function": {
    "name": "validate_invoice",
    "description": "Validates an invoice against purchase order records",
    "parameters": {
      "type": "object",
      "properties": {
        "invoice_number": {
          "type": "string",
          "description": "The invoice number to validate"
        },
        "po_number": {
          "type": "string",
          "description": "The purchase order number to check against"
        }
      },
      "required": ["invoice_number"]
    }
  }
}
```

Source: Orq.ai Agent API documentation, function tool type.

### Example 5: Three Orchestration Patterns

**Single Agent:**
```
User Input -> [single-agent] -> Output
No orchestration needed. Agent handles everything.
Use when: One model, one tool set, one responsibility.
```

**Sequential Pipeline:**
```
User Input -> [agent-a] -> [agent-b] -> [agent-c] -> Output
Each agent processes and passes to next.
Use when: Distinct processing phases, different models/tools per phase.
Orq.ai mechanism: Task ID continuation between agents.
```

**Parallel Fan-Out with Orchestrator:**
```
User Input -> [orchestrator-agent]
                 ├-> [sub-agent-1] (as tool)
                 ├-> [sub-agent-2] (as tool)
                 └-> [sub-agent-3] (as tool)
              -> Orchestrator assembles -> Output
Orq.ai mechanism: team_of_agents + retrieve_agents + call_sub_agent tools.
```

Source: Orq.ai Agent API documentation + project architecture research.

## Orq.ai Agent Fields Reference (Complete)

This is the authoritative field list for the `orqai-agent-fields.md` reference file:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Unique identifier. Pattern: `^[A-Za-z][A-Za-z0-9]*([._-][A-Za-z0-9]+)*$`. Immutable after creation. Supports `@version-number` suffix. |
| `role` | string | Yes | Agent's professional designation (e.g., "Data Analyst", "Customer Support Triage") |
| `description` | string | Yes | Brief purpose summary for Orq.ai Configuration description field |
| `instructions` | string | Yes | Full system prompt. Behavioral guidelines and task handling directives. |
| `model` | string or object | Yes | Model ID in `provider/model-name` format (e.g., `anthropic/claude-sonnet-4-5`) or object with `id`, `parameters`, `retry` |
| `fallback_models` | array | No | Ordered list of alternative models if primary fails |
| `settings.max_iterations` | integer | No | Maximum processing loops (recommended: 3-15) |
| `settings.max_execution_time` | integer | No | Timeout in seconds (recommended: ~300s) |
| `settings.tools` | array | No | Array of tool configurations (see Tool Types below) |
| `system_prompt` | string | No | Additional system-level instructions beyond `instructions` |
| `knowledge_bases` | array | No | Connected knowledge base references (`knowledge_id` per entry) |
| `memory_stores` | array | No | Persistent memory store identifiers |
| `team_of_agents` | array | No | Sub-agent keys for hierarchical workflows. Requires `retrieve_agents` + `call_sub_agent` tools. |
| `path` | string | No | Project location (e.g., "Default/agents") |
| `variables` | object | No | Key-value pairs for template replacement in instructions |
| `identity` | object | No | Contact information (id, display_name, email, metadata, tags) |
| `thread` | object | No | Groups related invocations (id, tags) |
| `memory` | object | No | Memory configuration with `entity_id` |

### Tool Types

| Type | Identifier | Configuration | When to Use |
|------|-----------|---------------|-------------|
| Current Date | `current_date` | `{ "type": "current_date" }` | Agent needs to know today's date |
| Google Search | `google_search` | `{ "type": "google_search" }` | Agent needs to search the web |
| Web Scraper | `web_scraper` | `{ "type": "web_scraper" }` | Agent needs to extract page content |
| Function | `function` | `{ "type": "function", "function": { "name": "...", "description": "...", "parameters": {...} } }` | Custom business logic with JSON Schema params |
| Code | `code` | `{ "type": "code", "language": "python", "code": "...", "parameters": {...} }` | Executable Python scripts |
| HTTP | `http` | `{ "type": "http", "blueprint": { "url": "...", "method": "...", "headers": {...}, "body": "..." } }` | External API integration |
| MCP | `mcp` | `{ "type": "mcp", "server_url": "...", "connection_type": "http" }` | Model Context Protocol services |
| KB Discovery | `retrieve_knowledge_bases` | `{ "type": "retrieve_knowledge_bases" }` | Discover available knowledge sources |
| KB Query | `query_knowledge_base` | `{ "type": "query_knowledge_base" }` | Search specific knowledge bases |
| Memory Discovery | `retrieve_memory_stores` | `{ "type": "retrieve_memory_stores" }` | Discover available memory stores |
| Memory Query | `query_memory_store` | `{ "type": "query_memory_store" }` | Search memory documents |
| Memory Write | `write_memory_store` | `{ "type": "write_memory_store" }` | Store information persistently |
| Memory Delete | `delete_memory_document` | `{ "type": "delete_memory_document" }` | Remove memory entries |
| Agent Discovery | `retrieve_agents` | `{ "type": "retrieve_agents" }` | Discover sub-agents (multi-agent) |
| Agent Invocation | `call_sub_agent` | `{ "type": "call_sub_agent" }` | Invoke sub-agents for task delegation |

**All tools support:** `requires_approval` (boolean) for human-in-the-loop gating.

### Task States (for Orchestration Reference)

| State | Description | Transition |
|-------|-------------|------------|
| `submitted` | Queued for processing | -> `working` |
| `working` | Active execution | -> `completed` / `failed` / `input_required` |
| `input_required` | Awaiting user/tool input | -> `working` (via task_id continuation) |
| `completed` | Successfully finished | Terminal |
| `failed` | Execution error | Terminal |
| `canceled` | User-initiated termination | Terminal |

**Critical constraint:** Task must be in INACTIVE state (`input_required`, `completed`, `failed`, `canceled`) before it can be continued with `task_id`. Attempting to continue an active task will fail.

### Model Providers (for Model Catalog Reference)

| Provider | Format | Example Models |
|----------|--------|---------------|
| OpenAI | `openai/model-name` | `openai/gpt-4o`, `openai/gpt-4o-mini`, `openai/o3` |
| Anthropic | `anthropic/model-name` | `anthropic/claude-sonnet-4-5`, `anthropic/claude-3-5-haiku-20241022` |
| Google AI | `google-ai/model-name` | `google-ai/gemini-2.5-flash`, `google-ai/gemini-2.5-pro` |
| AWS Bedrock | `aws/provider.model` | `aws/anthropic.claude-3-5-haiku-20241022-v1:0` |
| Azure | `azure/model-name` | `azure/gpt-4o` |
| Groq | `groq/model-name` | `groq/llama-3.3-70b-versatile` |
| DeepSeek | `deepseek/model-name` | `deepseek/deepseek-chat` |
| Mistral | `mistral/model-name` | `mistral/mistral-large-latest` |
| Cohere | `cohere/model-name` | `cohere/command-r-08-2024` |
| Cerebras | `cerebras/model-name` | `cerebras/llama-3.3-70b` |
| Perplexity | `perplexity/model-name` | `perplexity/sonar-pro` |
| Together AI | `togetherai/path/model` | `togetherai/meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| Alibaba | `alibaba/model-name` | `alibaba/qwen-max` |
| Minimax | `minimax/model-name` | `minimax/minimax-m2.5` |

**Orq.ai supports 300+ models across 17+ providers.** The model catalog reference file should categorize by use case (reasoning, classification, extraction, generation, vision, embedding) rather than trying to list all 300+. Include "last verified" dates and recommend experimentation.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.claude/commands/` directory | `.claude/skills/` + plugin system | Claude Code v2.1 (Jan 2026) | Skills support frontmatter, supporting files, subagent delegation. Commands still work but are legacy. |
| Single monolithic agent prompt | Subagent pipeline with `agents/` directory | Claude Code v1.0.60+ | Each subagent gets isolated context, restricted tools, and custom model. Essential for our pipeline. |
| Orq.ai Deployments API | Orq.ai Agents API v2 | 2025 | Agents support orchestration, persistent state, tool execution loops, A2A Protocol. Deployments are single-call only. |
| Agent key as free-form string | Agent key with regex validation + version tagging | Orq.ai v2 | Keys must match `^[A-Za-z][A-Za-z0-9]*([._-][A-Za-z0-9]+)*$`. Version via `@version-number` suffix. |

## Open Questions

1. **Optimal reference file size for subagent context consumption**
   - What we know: Claude Code subagents have finite context windows. Loading multiple reference files competes with the task prompt for space.
   - What's unclear: The exact character/token limit per subagent invocation and how much reference material can be loaded before quality degrades.
   - Recommendation: Target 1000-1500 words per reference file. Test with the architect subagent loading all references simultaneously. If quality drops, prioritize and load only the most relevant references per subagent.

2. **Model catalog freshness strategy**
   - What we know: Orq.ai has 300+ models. The landscape changes monthly. Hardcoding recommendations goes stale.
   - What's unclear: Whether to include specific model recommendations in the catalog or only categories + selection criteria.
   - Recommendation: Include a curated "recommended models by use case" section (10-15 models) with "last verified" dates, plus a "how to choose" section with criteria. The `/orq-agent:update` mechanism (Phase 4) should specifically target the model catalog for freshness.

3. **Template placeholder format**
   - What we know: Templates need placeholders that the spec generator (Phase 2) will fill in. Common formats: `{{FIELD}}`, `[FIELD]`, `<!-- FIELD -->`.
   - What's unclear: Which format Claude's spec generator subagent handles most reliably.
   - Recommendation: Use `{{FIELD_NAME}}` (double curly braces, ALL_CAPS) which matches Orq.ai's own variable syntax (`{{variables}}`). This is familiar and unambiguous. Include a legend at the top of each template.

## Sources

### Primary (HIGH confidence)
- [Orq.ai Agent API Documentation](https://docs.orq.ai/docs/agents/agent-api) - Complete v2 API field reference, tool types, task states, message format
- [Orq.ai Agent API Run Endpoint](https://docs.orq.ai/reference/agents/run-an-agent-with-configuration) - Full request body schema including fallback_models, team_of_agents, identity, thread, memory
- [Orq.ai Agent Tools Reference](https://docs.orq.ai/docs/agents/tools) - All 14 tool types with configuration schemas
- [Orq.ai Supported Models](https://docs.orq.ai/docs/proxy/supported-models) - 300+ models across 17+ providers with ID format
- [Orq.ai AI Agent Introduction](https://docs.orq.ai/docs/ai-agent) - Studio UI configuration fields
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) - Complexity gate framework: start simplest, justify each addition

### Secondary (MEDIUM confidence)
- [Claude Code Subagents Documentation](https://code.claude.com/docs/en/sub-agents) - Frontmatter fields, tool restrictions, model selection (verified via web search cross-references)
- [Claude Code Deep Dive - Subagents](https://medium.com/@the.gigi/claude-code-deep-dive-subagents-in-action-703cd8745769) - Practical subagent patterns
- [Claude Code Multiple Agent Systems Guide 2026](https://www.eesel.ai/blog/claude-code-multiple-agent-systems-complete-2026-guide) - Multi-agent best practices

### From Project Research (HIGH confidence - already verified)
- `.planning/research/ARCHITECTURE.md` - System architecture, component responsibilities, build order
- `.planning/research/STACK.md` - Plugin vs skill decision, subagent definitions, version compatibility
- `.planning/research/PITFALLS.md` - All 7 critical pitfalls with prevention strategies
- `.planning/research/FEATURES.md` - Feature prioritization, competitor analysis
- `.planning/research/SUMMARY.md` - Executive summary with phase implications

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All based on official Orq.ai API docs and Claude Code docs
- Architecture: HIGH - Complexity gate pattern from Anthropic's official guide; blueprint format follows established GSD patterns
- Pitfalls: HIGH - Drawn from verified project pitfalls research with multiple sources per pitfall
- Reference content: HIGH - Orq.ai field list extracted directly from API documentation
- Template design: MEDIUM - Placeholder format and size targets are recommendations, not verified empirically

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (30 days - Orq.ai API is stable; model catalog may update sooner)
