# Feature Research

**Domain:** LLM Agent Design Tooling (use-case-to-agent-specification pipeline)
**Researched:** 2026-02-24
**Confidence:** MEDIUM — This is an emerging category with few direct competitors doing exactly what Orq Agent Designer does. Feature landscape is synthesized from adjacent tools (agent builders, orchestration frameworks, eval tools) rather than direct competitors.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Natural language input | Every agent builder (Airia, LangSmith Agent Builder, Microsoft Copilot Agent Builder) accepts plain English descriptions. Users will not fill out forms | LOW | Already planned as "adaptive input handling" — accept brief or detailed descriptions |
| Agent decomposition | Given a use case, determine how many agents are needed and what each does. This is the core promise — Airia and LangSmith Agent Builder both auto-decompose | HIGH | The architect subagent — hardest part is knowing when 1 agent suffices vs. when you need 3 |
| System prompt generation | Every agent needs instructions. Users expect quality prompts without writing them. PromptHub, Anthropic's guides, and all builders generate these | MEDIUM | Must follow Orq.ai's `instructions` field format. Should incorporate Anthropic's "simple, composable" guidance |
| Model recommendation | Users don't know which of Orq.ai's 200+ models to pick. Agent builders like CrewAI and OpenAI Agent Builder handle model selection automatically | MEDIUM | Needs a decision matrix: task type -> model recommendation. Must be swappable (user can override) |
| Tool/function schema generation | Agents need tools with JSON schemas. This is mechanical but error-prone by hand. OpenAI's function calling and Orq.ai both require precise schemas | MEDIUM | Generate valid JSON Schema for each tool. Include description fields (Anthropic says tool docs are as important as prompts) |
| Structured output format | Specs must be copy-paste ready into Orq.ai Studio. Non-negotiable for non-technical users | LOW | One `.md` per agent with all Orq.ai fields: key, role, description, model, instructions, settings, tools |
| README / setup guide | Non-technical users need step-by-step instructions to go from spec files to running agents in Orq.ai Studio | LOW | Per-swarm README with numbered steps. Critical for the 5-15 non-technical user base |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Orchestration spec generation (A2A) | No other tool generates A2A Protocol orchestration specs. Agent builders create individual agents but leave orchestration to the developer. Generating `ORCHESTRATION.md` with agent sequence, Task ID strategy, handoff logic, and error handling is unique | HIGH | This is the killer feature. Salesforce's "Configurer pattern" is the closest analog but targets SOQL/JSON, not A2A |
| Eval dataset generation | Most agent builders stop at "here's your agent." Generating test inputs, eval pairs, and multi-model comparison matrices means users can validate before deploying. DeepEval and Promptfoo do this standalone but not integrated into spec generation | MEDIUM | Generate: (1) test inputs covering happy path + edge cases, (2) expected output pairs for evaluation, (3) multi-model comparison prompts |
| Smart subagent spawning | Adjust pipeline depth based on input detail. Detailed brief = skip research, brief description = deep research. No other tool explicitly adapts its own pipeline this way | MEDIUM | Saves tokens and time. Key UX differentiator for a CLI tool where latency matters |
| Orq.ai-native output | Specs are specifically valid for Orq.ai's `/v2/agents` API — correct field names, model format (`provider/model-name`), settings ranges. No generic agent builder does this | LOW | Low complexity because it's template-driven, but high value because it eliminates translation work |
| Platform-specific naming conventions | Enforced `[domain]-[role]-agent` kebab-case convention matching Orq.ai patterns. Prevents the naming chaos that plagues agent sprawl | LOW | Small feature, big impact on organizational hygiene as agent count grows |
| GSD workflow integration | Callable from within a GSD phase when a coding project needs agents designed. No agent design tool integrates with developer workflow tools | LOW | Adds the `/orq-agent` as a step in existing development workflows rather than being a separate tool |
| Human-in-the-loop decision points | Orchestration specs explicitly mark where human approval is needed. Anthropic's building-effective-agents guide emphasizes this as critical for production agents | LOW | Annotate decision points in ORCHESTRATION.md. Low implementation cost, high production safety value |
| Version-tagged agent specs | Output specs include `@version-number` tags matching Orq.ai's agent versioning system, enabling iteration tracking | LOW | Aligns with Orq.ai's native versioning. Simple metadata but enables spec evolution over time |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Visual/GUI agent builder | "I want to drag and drop agents" — influenced by OpenAI Agent Builder, n8n, Flowise | Massive scope increase. CLI tool trying to be a web app. Orq.ai Studio already IS the visual builder — our job is to generate specs FOR it, not replace it | Generate specs that are ready to paste into Orq.ai Studio's visual interface |
| Direct Orq.ai API deployment | "Just deploy it for me" — skip the copy-paste step | Orq.ai MCP doesn't exist yet. Building custom API integration is fragile, needs auth management, and creates a maintenance burden. Also removes the human review step before deployment | Output machine-parseable specs that a future Orq.ai MCP can consume. Keep the human-in-the-loop for now |
| Real-time agent monitoring | "Show me how my agents are performing" | Orq.ai handles observability natively. Duplicating it is wasted effort and would require persistent infrastructure | Reference Orq.ai's built-in monitoring in the README. Link to their dashboard |
| Auto-update on launch | "Always use the latest version" | Surprise changes mid-workflow break trust. Non-technical users need predictable behavior | Manual update via `/orq-agent:update` — explicit, predictable, user-controlled |
| Knowledge base content creation | "Generate the training data too" | Massive scope expansion into data engineering. Knowledge bases are domain-specific and require human curation | Specs reference knowledge bases by name and describe what content they should contain. Users populate them in Orq.ai |
| Multi-platform support (LangChain, CrewAI, etc.) | "Support all frameworks" | Splits focus, dilutes Orq.ai-native quality. Each platform has different config formats, capabilities, and constraints | Stay Orq.ai-native. The structured output format is documented enough that someone could write a converter later |
| Prompt optimization/fine-tuning loop | "Automatically improve prompts based on eval results" | Requires a runtime loop (run agent -> eval -> modify -> repeat). Way beyond spec generation scope. Tools like DeepEval and Promptfoo handle this | Generate eval datasets so users can run optimization in Orq.ai's own experimentation tools |

## Feature Dependencies

```
[Natural Language Input]
    └──feeds──> [Agent Decomposition (Architect)]
                    ├──triggers──> [Domain Research Subagents]
                    │                   └──feeds──> [System Prompt Generation]
                    │                   └──feeds──> [Model Recommendation]
                    │                   └──feeds──> [Tool/Function Schema Generation]
                    └──feeds──> [Orchestration Spec Generation]
                                    └──requires──> [Agent Decomposition] (needs to know agent count + sequence)

[System Prompt Generation] ──produces──> [Structured Output (Agent .md files)]
[Model Recommendation] ──produces──> [Structured Output (Agent .md files)]
[Tool/Function Schema Generation] ──produces──> [Structured Output (Agent .md files)]

[Structured Output] ──enables──> [Eval Dataset Generation] (needs agent specs to generate test cases)
[Structured Output] ──enables──> [README Generation]

[Naming Convention] ──applies-to──> [Structured Output] + [Orchestration Spec]

[GSD Integration] ──independent──> (works in parallel, wraps the core pipeline)

[Claude Code Skill Distribution] ──independent──> (packaging concern, not pipeline concern)
```

### Dependency Notes

- **Agent Decomposition requires Natural Language Input:** The architect subagent needs a use case to analyze before it can determine agent count and roles
- **Domain Research requires Agent Decomposition:** Research subagents are spawned per-role, so roles must be defined first
- **Orchestration Spec requires Agent Decomposition:** Can't define agent sequence without knowing which agents exist
- **Eval Dataset Generation requires Structured Output:** Test cases are generated against finalized agent specs, not intermediate state
- **Smart Subagent Spawning modifies Domain Research:** When input is detailed enough, research subagents are skipped entirely — this is a control flow decision, not a dependency
- **Distribution is independent:** Packaging as a Claude Code skill is orthogonal to the generation pipeline

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] Natural language input handling — accept use case descriptions of varying detail
- [ ] Agent decomposition (architect subagent) — determine agent count, roles, and orchestration pattern
- [ ] System prompt generation — produce Orq.ai-format `instructions` for each agent
- [ ] Model recommendation — suggest appropriate model per agent role from Orq.ai catalog
- [ ] Structured output — one `.md` per agent with all Orq.ai fields, copy-paste ready
- [ ] Orchestration spec — `ORCHESTRATION.md` with agent sequence and handoff logic
- [ ] Naming convention enforcement — `[domain]-[role]-agent` kebab-case
- [ ] README generation — per-swarm setup guide for non-technical users
- [ ] Claude Code skill packaging — installable as `/orq-agent`

### Add After Validation (v1.x)

Features to add once core is working and users provide feedback.

- [ ] Tool/function schema generation — add when users report needing tools beyond basic ones. Depends on seeing real use cases
- [ ] Eval dataset generation — add after first round of agents are deployed and users want to compare models
- [ ] Smart subagent spawning — optimize for speed/cost after the basic pipeline is validated
- [ ] GSD integration — add when developers (not just non-technical users) start using the tool
- [ ] `/orq-agent:update` command — add when there are actual updates to distribute

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Human-in-the-loop decision point annotation — defer until orchestration patterns are validated in production
- [ ] Version-tagged agent specs — defer until users iterate on specs (need version 2+ of agents)
- [ ] Machine-parseable output for future Orq.ai MCP — defer until MCP is actually available
- [ ] Multi-model comparison matrices in datasets — defer until users actively experiment across providers

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Natural language input | HIGH | LOW | P1 |
| Agent decomposition | HIGH | HIGH | P1 |
| System prompt generation | HIGH | MEDIUM | P1 |
| Model recommendation | MEDIUM | MEDIUM | P1 |
| Structured output (Orq.ai format) | HIGH | LOW | P1 |
| Orchestration spec | HIGH | HIGH | P1 |
| Naming conventions | MEDIUM | LOW | P1 |
| README generation | HIGH | LOW | P1 |
| Skill distribution | HIGH | LOW | P1 |
| Tool/function schema gen | MEDIUM | MEDIUM | P2 |
| Eval dataset generation | MEDIUM | MEDIUM | P2 |
| Smart subagent spawning | MEDIUM | MEDIUM | P2 |
| GSD integration | LOW | LOW | P2 |
| Update mechanism | MEDIUM | LOW | P2 |
| HITL annotations | LOW | LOW | P3 |
| Version tags | LOW | LOW | P3 |
| MCP-ready output | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Airia Agent Builder | LangSmith Agent Builder | OpenAI Agent Builder | Microsoft Copilot Agent Builder | **Orq Agent Designer** |
|---------|--------------------|-----------------------|---------------------|-------------------------------|----------------------|
| Natural language input | Yes — describe and auto-build | Yes — natural language to agent | Yes — visual + NL | Yes — conversational creation | Yes — CLI-based NL input |
| Multi-agent decomposition | Yes — auto-structures workflows | Yes — creates subagents | Yes — node-based multi-agent | Limited — single agent focus | Yes — architect subagent determines swarm |
| Platform-specific output | Airia platform only | LangChain ecosystem | OpenAI ecosystem | Microsoft 365 ecosystem | **Orq.ai-native specs** |
| Orchestration spec | Implicit in visual canvas | Via LangGraph integration | Visual workflow definition | Declarative agent specs | **Explicit A2A Protocol docs** |
| Eval/testing integration | Via Airia platform | Via LangSmith evals | Via AgentKit evals | Limited | **Generated eval datasets** |
| Copy-paste ready specs | No — platform-locked | No — code artifacts | No — platform-locked | Partial — YAML specs | **Yes — human-readable .md files** |
| Non-technical user focus | Medium — visual but complex | Low — developer-focused | Medium — visual builder | High — conversational | **High — README + copy-paste** |
| Offline/CLI operation | No — cloud platform | No — cloud platform | No — cloud platform | No — cloud platform | **Yes — runs locally in Claude Code** |
| Cost | Platform subscription | Platform subscription | Platform subscription | M365 license | **Free — Claude Code skill** |

**Key insight:** Every competitor is a cloud platform that locks you into their ecosystem. Orq Agent Designer is unique as a local CLI tool that generates portable, human-readable specs for a specific target platform (Orq.ai). The combination of "runs locally + generates for a specific cloud platform" has no direct competitor.

## Sources

- [Top 8 LLM Frameworks for Building AI Agents in 2026](https://www.secondtalent.com/resources/top-llm-frameworks-for-building-ai-agents/) — Framework landscape
- [The 2026 Guide to AI Agent Builders](https://composio.dev/blog/best-ai-agent-builders-and-integrations) — Agent builder comparison
- [Top 10+ Agentic Orchestration Frameworks in 2026](https://aimultiple.com/agentic-orchestration) — Orchestration landscape
- [How to Write a Good Spec for AI Agents (O'Reilly)](https://www.oreilly.com/radar/how-to-write-a-good-spec-for-ai-agents/) — Spec writing best practices
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Agent design principles
- [Orq.ai Agent API Documentation](https://docs.orq.ai/docs/agents/agent-api) — Target platform API spec
- [DeepEval Documentation](https://deepeval.com/docs/getting-started) — Eval dataset generation patterns
- [Promptfoo Dataset Generation](https://www.promptfoo.dev/docs/configuration/datasets/) — Automated test data creation
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) — Skill distribution mechanism
- [Airia Natural Language Agent Building](https://airia.com/natural-language-agent-building-capabilities/) — NL-to-agent competitor
- [LangSmith Agent Builder](https://www.langchain.com/langsmith/agent-builder) — NL-to-agent competitor
- [OpenAI AgentKit](https://openai.com/index/introducing-agentkit/) — Agent building + eval ecosystem
- [Augment Code: Prompt Engineering for Agentic AI Swarms](https://www.augmentcode.com/guides/prompt-engineering-for-agentic-ai-swarms-a-practical-guide-for-developers) — Swarm prompt patterns
- [Salesforce Enterprise Agentic Architecture](https://architect.salesforce.com/docs/architect/fundamentals/guide/enterprise-agentic-architecture) — Configurer pattern reference

---
*Feature research for: LLM Agent Design Tooling (Orq Agent Designer)*
*Researched: 2026-02-24*
