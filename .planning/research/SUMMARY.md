# Project Research Summary

**Project:** Orq Agent Designer — Claude Code skill for LLM agent specification generation
**Domain:** LLM agent design tooling / Claude Code plugin
**Researched:** 2026-02-24
**Confidence:** HIGH (stack, architecture) / MEDIUM (features, pitfalls)

## Executive Summary

Orq Agent Designer is a Claude Code plugin that takes a natural language use case description and generates copy-paste-ready Orq.ai agent specifications. The product occupies a unique niche: every competitor (Airia, LangSmith, OpenAI Agent Builder, Microsoft Copilot Agent Builder) is a cloud platform that locks output into its own ecosystem. Orq Agent Designer runs locally in Claude Code and generates portable, human-readable markdown files for Orq.ai Studio. This combination has no direct competitor. The recommended build approach is a Claude Code plugin (v1.0.33+) with a subagent pipeline: an architect subagent analyzes the use case, domain researcher subagents (one per agent role) investigate best practices, spec generator subagents produce Orq.ai-ready `.md` files, and a dataset generator subagent produces test and eval data. The pipeline uses adaptive depth — detailed user input skips research and sometimes architect stages to save tokens and time.

The primary technical risk is the quality of generated prompts. LLMs writing prompts for other LLMs tend to optimize for what looks thorough rather than what performs reliably. Mitigating this requires structured prompt templates with explicit quality gates baked into the spec generator subagent from the start. The second risk is over-engineering: the architect subagent will naturally bias toward multi-agent solutions because that is what it is built to design. A "complexity gate" — defaulting to single-agent designs and requiring documented justification for each additional agent — must be built into the architect's core logic from Phase 1, not added retroactively.

The third risk is distribution. The target audience of 5-15 non-technical Moyne Roberts colleagues is not the developer who built the tool. Install scripts tested only on developer machines fail silently on other machines. The Claude Code character budget (16k) silently excludes skills that exceed it. Testing installation on at least two non-developer machines before release is non-negotiable, and a health-check command (`/orq-agent:check`) should be included to verify correct installation.

## Key Findings

### Recommended Stack

Build as a Claude Code plugin (v1.0.33+) rather than personal skills or a shell-script-based tool. Plugins provide namespaced commands (`/orq-agent:design`), bundle all assets (skills, agents, templates, reference docs) into one installable unit, and distribute via the Claude Code plugin marketplace with a single command. The entire tool is markdown files — no npm, no pip, no runtime dependencies. Subagents use Claude Code's `.claude/agents/` system for isolated execution with custom tool allowlists and model selection. The output format is structured markdown, not JSON, because target users are non-technical and Orq.ai Studio is a form-based GUI where users copy-paste field values.

**Core technologies:**
- Claude Code Plugin System (v1.0.33+): distribution and packaging — namespaced commands, marketplace install, semantic versioning
- Claude Code Subagents (v2.1+): pipeline execution — isolated contexts, custom tools, model-per-agent selection
- Claude Code Skills System (v2.1+): entry point and workflow orchestration — `$ARGUMENTS` substitution, supporting files, frontmatter control
- Orq.ai Agents API v2: target output format — `key`, `role`, `description`, `instructions`, `model`, `settings`, `tools`, `team_of_agents`
- A2A Protocol (2025): orchestration spec format — task states, message parts, task_id continuation patterns
- JSON Schema (draft-2020-12): tool parameter definitions — required for every Orq.ai `function` tool type

**What NOT to use:** Orq.ai Python/TypeScript SDK (no runtime API calls needed), LangChain/LangGraph/CrewAI (wrong abstraction — this generates specs, does not execute agents), custom MCP server (overkill), npm/pip distribution (installation complexity for non-technical users).

### Expected Features

The product has no direct competitors, so feature landscape was synthesized from adjacent tools. Confidence is MEDIUM.

**Must have (table stakes):**
- Natural language input — all agent builders accept plain English; forms are not acceptable
- Agent decomposition — architect subagent determines agent count and roles from use case description
- System prompt generation — quality instructions in Orq.ai `instructions` field format, using structured sections not monolithic paragraphs
- Model recommendation — decision matrix mapping task type to model from Orq.ai 200+ catalog
- Tool/function schema generation — valid JSON Schema for each tool (required by Orq.ai for function tools)
- Structured output — one `.md` per agent with all Orq.ai fields, copy-paste ready for Orq.ai Studio
- Orchestration spec (`ORCHESTRATION.md`) — agent sequence, Task ID strategy, handoff logic, error handling
- Naming convention enforcement — `[domain]-[role]-agent` kebab-case throughout
- Per-swarm README — step-by-step setup guide for non-technical users including Orq.ai Studio navigation

**Should have (competitive differentiators):**
- A2A Protocol orchestration docs — no other tool generates explicit A2A orchestration specs; this is the killer feature
- Eval dataset generation — test inputs, eval pairs, multi-model comparison matrices integrated into spec generation
- Adaptive pipeline depth — skip research for detailed inputs; saves tokens and latency
- Human-in-the-loop decision point annotations in orchestration specs
- Version-tagged agent specs matching Orq.ai's `@version-number` system

**Defer (v2+):**
- Machine-parseable output for future Orq.ai MCP (defer until MCP actually ships)
- Multi-model comparison matrices in datasets (defer until users actively experiment)
- GSD workflow integration (add when developers, not just non-technical users, adopt the tool)
- `/orq-agent:update` command (add when there are actual updates to distribute)

### Architecture Approach

The architecture is a sequential pipeline with parallel fan-out, mirroring the GSD reference architecture. The orchestrator workflow runs stages sequentially (architect must complete before researchers start) but fans out in parallel within stages (multiple researchers and spec generators run simultaneously). This guarantees data dependencies while maximizing throughput. A critical architectural decision: the `references/` directory holds all Orq.ai-specific knowledge (field reference, model catalog, orchestration patterns) as separate `.md` files. Every subagent loads these via `files_to_read` injection rather than having field knowledge hardcoded in prompts. This means updating the Orq.ai reference once propagates to all subagents automatically.

**Major components:**
1. **Orchestrator** (`workflows/design-swarm.md`) — parses input, classifies detail level, spawns subagents in sequence, assembles output
2. **Architect subagent** (`agents/architect.md`) — analyzes use case, determines agent count and roles, picks orchestration pattern (single/sequential/parallel), produces blueprint
3. **Domain Researcher subagents** (`agents/domain-researcher.md`) — one spawned per agent role, investigates model fit, prompt patterns, tool needs; skipped when input is detailed
4. **Spec Generator subagents** (`agents/spec-generator.md`) — one spawned per agent, converts blueprint + research into Orq.ai-ready `.md` files written to disk
5. **Dataset Generator subagent** (`agents/dataset-generator.md`) — reads completed specs, produces test inputs, eval pairs, adversarial cases
6. **Reference files** (`references/`) — static Orq.ai knowledge: agent field reference, model catalog, orchestration patterns, prompt patterns, naming conventions
7. **Templates** (`templates/`) — output format definitions for agent specs, orchestration doc, datasets, README

Build order from architecture: References + Templates first (no dependencies), then Architect and Researcher subagents in parallel (depend on references), then Spec Generator and Dataset Generator subagents, then the Orchestrator workflow (depends on all subagents), then distribution packaging last.

### Critical Pitfalls

1. **Over-engineering agent count ("bag of agents" trap)** — architect will default to multi-agent solutions; mitigate with an explicit complexity gate: start with single-agent design, require documented justification for each additional agent, default to single agent for inputs under 3 sentences. Must be in Phase 1 architect logic.

2. **Generated prompts that look good but perform poorly** — LLMs writing prompts optimize for appearance not function; mitigate with a structured prompt template (role / constraints / output format / few-shot examples / edge cases sections) and a quality checklist the spec generator validates against before output. Must be baked into Phase 2 spec generation templates.

3. **Error cascading in sequential pipelines** — garbage from Agent A silently propagates through Agents B and C; mitigate with inter-agent contracts (explicit input/output schemas between each agent pair), `input-required` state as circuit breakers, and defensive agent prompts that return errors on unexpected input. Orchestration spec template must include error paths by default.

4. **Model recommendation staleness** — LLM model landscape changes monthly; mitigate by maintaining a separate `model-catalog.md` reference file (never hardcode model names in prompts), including "last verified" dates, recommending alternatives alongside primary choice, and designing the update mechanism to specifically refresh the model catalog.

5. **Distribution friction killing adoption** — non-technical users cannot debug failed installs; mitigate by testing install on 2+ non-developer machines before release, building a `/orq-agent:check` health check command, staying well under the 16k character budget (measure it), and writing a visual step-by-step install guide with expected terminal output.

6. **Orq.ai Task ID and state management gotchas** — subtle API semantics (tasks must be inactive to continue, agent keys trigger version creation on parameter change, project API keys treat first path element as folder); mitigate with a dedicated `orq-constraints.md` reference file the spec generator always loads, and a setup checklist in every generated README.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation — References, Templates, and Architect
**Rationale:** Everything depends on references. The Orq.ai field reference and model catalog must exist before any subagent can produce valid output. The architect subagent is the critical path — without it, no pipeline can run. The complexity gate (single-agent-first logic) must be built in from day one; retrofitting it is expensive. The Orq.ai constraint reference (Task ID semantics, versioning rules) also belongs here because it shapes all downstream templates.
**Delivers:** Complete reference knowledge base, output templates for all file types, functional architect subagent that produces a blueprint from use case input
**Addresses:** Natural language input, agent decomposition, naming convention enforcement
**Avoids:** Over-engineering agent count, Orq.ai Task ID gotchas, hardcoded model knowledge in prompts

### Phase 2: Core Generation Pipeline
**Rationale:** Domain researcher and spec generator subagents are the product's core value delivery. They depend on Phase 1 references and templates. The dataset generator depends on completed specs. Prompt quality gates and adversarial dataset categories must be baked into templates now — retrofitting them later requires rewriting every template.
**Delivers:** Domain researcher subagent (per-role best practices), spec generator subagent (Orq.ai-ready `.md` files with quality-gated prompts), orchestration generator (A2A Protocol `ORCHESTRATION.md` with error paths), dataset generator (test inputs + eval pairs + adversarial cases), README generator
**Addresses:** System prompt generation, model recommendation, tool/function schema generation, structured output, orchestration spec, eval dataset generation, A2A differentiator
**Avoids:** Generated prompts that look good but perform poorly, error cascading in sequential pipelines, synthetic test data that does not represent real usage

### Phase 3: Orchestrator and Adaptive Pipeline
**Rationale:** The orchestrator workflow depends on all subagents being functional before it can be built and tested. Adaptive pipeline depth (input classification, skipping stages) is an optimization on top of the working pipeline, not a precondition for it. The sequential-with-parallel-fan-out execution pattern and structured return contracts between subagents are implemented here.
**Delivers:** Fully functional orchestrator workflow (`design-swarm.md`), adaptive input classification (brief/moderate/detailed), parallel fan-out for researcher and spec generator spawns, structured return contracts, progress indicators
**Addresses:** Smart subagent spawning, input depth adaptation, UX feedback during generation
**Avoids:** Monolithic orchestrator anti-pattern, treating all inputs identically, lack of feedback during long generation

### Phase 4: Distribution and Plugin Packaging
**Rationale:** Distribution is the final wrapping layer. All content must be finalized before packaging. The character budget must be measured here to catch any size issues. The install experience for non-technical users must be explicitly tested and validated at this phase.
**Delivers:** Claude Code plugin manifest (`plugin.json`), `SKILL.md` entry point with correct frontmatter, `/orq-agent:update` workflow, `/orq-agent:check` health-check command, `bin/install.sh` with error handling, visual install guide, GitHub repository structure for marketplace distribution
**Addresses:** Skill distribution, update mechanism, non-technical user install experience
**Avoids:** Distribution friction killing adoption, character budget silent exclusion, install-only-works-on-dev-machine

### Phase Ordering Rationale

- References and templates before subagents because subagents reference them at spawn time — build order is a hard dependency, not a preference
- Architect before researchers and spec generators because the blueprint it produces is the data contract the entire pipeline depends on
- All subagents before the orchestrator because the orchestrator integrates and tests them — the orchestrator cannot be meaningfully built until all parts exist
- Distribution last because it packages a finished product; packaging a partially working product obscures quality issues and complicates testing
- Complexity gate, prompt quality templates, and Orq.ai constraint reference are all Phase 1-2 concerns — the pitfalls research is unambiguous that these cannot be bolted on later

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Prompt quality gate design — what specific criteria distinguish a functional LLM prompt from one that merely looks functional? Needs validation against real Orq.ai agent runs, not just static analysis. Consider `/gsd:research-phase` to investigate Anthropic's prompt engineering best practices and existing quality rubrics.
- **Phase 2:** A2A Protocol orchestration spec format — A2A Protocol is a 2025 release and documentation depth is still growing. The specific patterns for `input-required` state transitions and task continuation in multi-agent Orq.ai pipelines may need direct testing.
- **Phase 3:** Adaptive pipeline depth classification — the heuristic for classifying input as brief/moderate/detailed is not specified in research. The decision threshold (what constitutes "detailed enough to skip research") needs a concrete definition validated with real use cases.

Phases with standard patterns (skip research-phase):
- **Phase 1:** References and templates — pure content creation, no novel technical decisions. Well-documented Orq.ai API v2 field reference exists. Standard GSD template patterns apply.
- **Phase 4:** Plugin packaging — Claude Code plugin structure is fully documented (HIGH confidence). Distribution via GitHub is a well-established pattern. No research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core technologies verified against official Claude Code and Orq.ai documentation. Plugin system, skills system, subagents, and Orq.ai API v2 all have authoritative docs. |
| Features | MEDIUM | No direct competitor exists doing exactly this. Feature landscape synthesized from adjacent tools. Table-stakes features are reliable; differentiator value claims are reasonable but unvalidated against actual user behavior. |
| Architecture | HIGH | Architecture mirrors the GSD reference architecture which is proven in production. Orq.ai API semantics are well-documented. Pipeline pattern is well-understood. |
| Pitfalls | MEDIUM-HIGH | Pitfalls from multi-agent LLM systems are well-documented in research literature. Orq.ai-specific pitfalls (Task ID semantics, character budget) are documented in official sources and known bugs. Prompt quality pitfalls have strong research backing. |

**Overall confidence:** HIGH for build approach; MEDIUM for feature prioritization decisions

### Gaps to Address

- **Adaptive input classification thresholds:** Research identifies that input depth should determine pipeline stages but does not define the exact classification heuristic. Address during Phase 3 planning by testing with 5-10 real use case examples of varying detail.
- **Prompt quality gate criteria:** Research flags this as the highest-risk pitfall but does not provide a complete rubric. Address during Phase 2 planning by reviewing Anthropic's building-effective-agents guide and existing prompt evaluation frameworks.
- **Orq.ai function_calling model list:** Research flags that only models supporting function_calling are valid for Orq.ai agents, but the exact current list is not in research files. Address during Phase 1 by pulling the validated model list from Orq.ai documentation at build time.
- **Claude Code character budget measurement:** Research warns about the 16k character limit but does not provide a measurement approach. Address during Phase 4 by building a size measurement step into the development process.
- **Non-technical user install testing:** Research flags this as critical but cannot be validated until the product exists. Address before Phase 4 completion by recruiting 2 non-developer testers.

## Sources

### Primary (HIGH confidence)
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) — skill architecture, frontmatter, supporting files, subagent integration
- [Claude Code Plugins Documentation](https://code.claude.com/docs/en/plugins) — plugin structure, manifest format, marketplace distribution
- [Claude Code Subagents Documentation](https://code.claude.com/docs/en/sub-agents) — agent definitions, tool restrictions, model selection
- [Orq.ai Agent API Documentation](https://docs.orq.ai/docs/agents/agent-api) — v2 API surface, endpoints, tool types, task states
- [Orq.ai AI Agent Introduction](https://docs.orq.ai/docs/ai-agent) — agent configuration fields, creation workflow
- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/) — agent-to-agent communication standard
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — agent design principles, HITL patterns, tool documentation importance

### Secondary (MEDIUM confidence)
- [The 2026 Guide to AI Agent Builders](https://composio.dev/blog/best-ai-agent-builders-and-integrations) — competitor feature analysis
- [Top 8 LLM Frameworks for Building AI Agents in 2026](https://www.secondtalent.com/resources/top-llm-frameworks-for-building-ai-agents/) — framework landscape
- [Galileo: Why Multi-Agent LLM Systems Fail](https://galileo.ai/blog/multi-agent-llm-systems-fail) — over-engineering pitfalls
- [Towards Data Science: The 17x Error Trap of the "Bag of Agents"](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/) — agent count complexity trap
- [Google Cloud: The Prompt Paradox](https://medium.com/google-cloud/the-prompt-paradox-why-your-llm-shines-during-experimentation-but-fails-in-production-8d092676857b) — meta-prompting failure modes
- [Latitude: Production-Grade LLM Prompt Engineering](https://latitude.so/blog/10-best-practices-for-production-grade-llm-prompt-engineering) — prompt quality practices
- [ZenML: LLM Agents in Production](https://www.zenml.io/blog/llm-agents-in-production-architectures-challenges-and-best-practices) — production architecture patterns
- [DeepEval Documentation](https://deepeval.com/docs/getting-started) — eval dataset generation patterns
- [Anthropic: How We Built Our Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system) — pipeline architecture patterns

### Tertiary (MEDIUM confidence, community sources)
- [Claude Code Skills vs Slash Commands 2026](https://yingtu.ai/blog/claude-code-skills-vs-slash-commands) — skills/commands evolution timeline
- [Claude Code Merges Slash Commands Into Skills](https://medium.com/@joe.njenga/claude-code-merges-slash-commands-into-skills-dont-miss-your-update-8296f3989697) — v2.1.3 merge details
- [Claude Code Skills/Slash Commands Bug (GitHub #11459)](https://github.com/anthropics/claude-code/issues/11459) — character budget and loading behavior
- [Medium: Challenges and Pitfalls of Synthetic Data for LLMs](https://medium.com/foundation-models-deep-dive/challenges-and-pitfalls-of-using-synthetic-data-for-llms-7337fcda1316) — test data quality

---
*Research completed: 2026-02-24*
*Ready for roadmap: yes*
