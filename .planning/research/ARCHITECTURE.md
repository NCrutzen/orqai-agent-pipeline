# Architecture Research

**Domain:** LLM agent design tooling / Claude Code skill
**Researched:** 2026-02-24
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      User Layer (Claude Code CLI)                   │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  /orq-agent  (entry point — slash command / skill)            │ │
│  └──────────────────────────┬─────────────────────────────────────┘ │
├─────────────────────────────┼───────────────────────────────────────┤
│                    Orchestration Layer                               │
│  ┌──────────────────────────┴─────────────────────────────────────┐ │
│  │              Orchestrator Workflow (main.md)                    │ │
│  │  1. Parse input  2. Spawn architect  3. Fan-out researchers    │ │
│  │  4. Spawn spec generators  5. Spawn dataset gen  6. Assemble  │ │
│  └──┬───────────┬───────────┬───────────┬───────────┬─────────────┘ │
├─────┼───────────┼───────────┼───────────┼───────────┼───────────────┤
│     │     Subagent Layer     │           │           │               │
│  ┌──┴──────┐ ┌──┴──────┐ ┌──┴──────┐ ┌──┴──────┐ ┌──┴──────┐      │
│  │Architect│ │Research │ │Research │ │Spec Gen │ │Dataset  │      │
│  │         │ │Agent 1  │ │Agent N  │ │(per agt)│ │Generator│      │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘      │
├───────┼───────────┼───────────┼───────────┼───────────┼─────────────┤
│                      Reference Layer                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │Templates │  │Orq.ai Ref│  │Model     │  │Pattern   │            │
│  │(output   │  │(API spec,│  │Catalog   │  │Library   │            │
│  │ formats) │  │ fields)  │  │(200+ LLM)│  │(prompts) │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
├─────────────────────────────────────────────────────────────────────┤
│                      Output Layer (Filesystem)                      │
│  Agents/[swarm-name]/                                               │
│  ├── ORCHESTRATION.md  ├── agents/*.md  ├── datasets/  ├── README  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Orchestrator** | Entry point. Parses user input, determines pipeline depth, spawns subagents in correct sequence, assembles final output | Single workflow `.md` file (like GSD's `new-project.md`) |
| **Architect** | Analyzes use case, determines agent count, assigns roles, picks orchestration pattern (single/sequential/parallel) | Subagent prompt with Orq.ai pattern library as context |
| **Domain Researcher** | Per-agent-role investigation: best prompt patterns, model fit, tool needs, knowledge base relevance | Parallel subagent spawns (1 per designed agent), uses WebSearch |
| **Spec Generator** | Converts architect blueprint + research into copy-paste-ready Orq.ai Agent `.md` files with all required fields | Subagent with Orq.ai field reference as mandatory context |
| **Dataset Generator** | Creates test inputs, expected outputs, and model comparison matrices per agent | Subagent that reads completed specs to generate realistic test data |
| **Reference Files** | Static knowledge: Orq.ai API fields, model catalog, prompt patterns, output templates | `.md` files in `references/` directory, loaded by subagents |
| **Templates** | Output format definitions for agent specs, orchestration docs, datasets | `.md` templates in `templates/` directory |

## Recommended Project Structure

```
orq-agent/                          # Root — installed to ~/.claude/skills/orq-agent/
├── SKILL.md                        # Skill entry point (frontmatter + instructions)
├── workflows/
│   ├── design-swarm.md             # Main orchestrator workflow
│   └── update.md                   # /orq-agent:update workflow
├── agents/
│   ├── architect.md                # Architect subagent prompt
│   ├── domain-researcher.md        # Domain researcher subagent prompt
│   ├── spec-generator.md           # Spec generator subagent prompt
│   └── dataset-generator.md        # Dataset generator subagent prompt
├── templates/
│   ├── agent-spec.md               # Template for individual agent .md output
│   ├── orchestration.md            # Template for ORCHESTRATION.md output
│   ├── dataset-test-inputs.md      # Template for test input datasets
│   ├── dataset-eval-pairs.md       # Template for eval pair datasets
│   └── readme.md                   # Template for swarm README
├── references/
│   ├── orqai-agent-fields.md       # Complete Orq.ai Agent config field reference
│   ├── orqai-api-spec.md           # v2 API endpoint details, request/response shapes
│   ├── orqai-model-catalog.md      # Model providers, names, strengths, pricing tiers
│   ├── orchestration-patterns.md   # Single agent, sequential pipeline, parallel fan-out
│   ├── prompt-patterns.md          # Role-specific prompt engineering patterns
│   └── naming-conventions.md       # [domain]-[role]-agent kebab-case rules
├── bin/
│   └── install.sh                  # One-liner installer script
└── VERSION                         # Current version number
```

### Structure Rationale

- **`workflows/`:** Mirrors GSD. Each workflow is an orchestrator that spawns subagents and manages the pipeline. Only two workflows needed: the main design pipeline and the update mechanism.
- **`agents/`:** Each file is a complete subagent prompt definition. The orchestrator loads these via path reference and injects context (use case, architect output, etc.) when spawning.
- **`templates/`:** Output format definitions. Subagents reference these to produce consistent, copy-paste-ready files. Separating templates from agent prompts means the output format can evolve without rewriting agent logic.
- **`references/`:** Static knowledge that multiple subagents need. The Orq.ai field reference is the single source of truth for what fields exist and what values they accept. This is the most maintenance-heavy directory -- it must stay current with Orq.ai's API.
- **`bin/`:** Distribution tooling. The install script clones the repo and symlinks into `~/.claude/skills/`.

## Architectural Patterns

### Pattern 1: Sequential Pipeline with Parallel Fan-Out

**What:** The orchestrator runs stages sequentially (architect must complete before researchers start), but within a stage, independent work fans out in parallel (multiple researchers run simultaneously).

**When to use:** Always. This is the core execution pattern.

**Trade-offs:** Sequential stages add latency but guarantee data dependencies are met. Parallel fan-out within stages maximizes throughput where safe.

```
User Input
    │
    ▼
[Architect] ─── sequential gate ───
    │                                │
    ▼                                │
[Researcher 1] [Researcher 2] [Researcher N]  ← parallel fan-out
    │               │               │
    ▼               ▼               ▼
─── sequential gate ────────────────
    │
    ▼
[Spec Gen 1] [Spec Gen 2] [Spec Gen N]  ← parallel fan-out
    │             │             │
    ▼             ▼             ▼
─── sequential gate ────────────
    │
    ▼
[Dataset Generator]  ← needs all specs complete
    │
    ▼
[Assembly + Output]
```

### Pattern 2: Adaptive Pipeline Depth

**What:** The orchestrator inspects user input detail level and skips or simplifies stages accordingly. A one-liner ("invoice checking agent") gets full research. A detailed brief with model preferences and prompt drafts skips research and goes straight to spec generation.

**When to use:** Every invocation. The orchestrator classifies input as brief/moderate/detailed and adjusts.

**Trade-offs:** Saves significant tokens and time for detailed inputs. Risk of skipping research that would have caught issues. Mitigation: always run architect (even detailed inputs benefit from orchestration pattern analysis).

```
Brief input   → Architect → Research → Spec Gen → Dataset → Output  (full pipeline)
Moderate input → Architect → Spec Gen → Dataset → Output            (skip research)
Detailed input → Spec Gen → Dataset → Output                        (skip architect + research)
```

### Pattern 3: Reference Injection via Path Loading

**What:** Subagent prompts reference static files by absolute path. The orchestrator resolves paths at spawn time and includes them in the subagent's `files_to_read` block. This mirrors GSD's pattern exactly.

**When to use:** For all subagents that need Orq.ai-specific knowledge (field reference, model catalog, patterns).

**Trade-offs:** Adds context tokens but ensures subagents have authoritative, consistent information. Without this, subagents hallucinate field names and model identifiers.

```
Orchestrator spawns Spec Generator:

Task(prompt="
<files_to_read>
- {skill_root}/references/orqai-agent-fields.md
- {skill_root}/references/orqai-model-catalog.md
- {skill_root}/templates/agent-spec.md
- {architect_output_path}
- {researcher_output_path}
</files_to_read>

Generate agent spec for: {agent_role}
...
")
```

### Pattern 4: Output-as-Contract

**What:** Each subagent returns a structured result block that the orchestrator parses to determine next steps. Same pattern GSD uses with `## RESEARCH COMPLETE`, `## ROADMAP CREATED`, etc.

**When to use:** Every subagent return.

**Trade-offs:** Slightly rigid, but eliminates ambiguity. The orchestrator can reliably detect success, failure, or need-for-clarification.

```markdown
## ARCHITECTURE COMPLETE

**Swarm name:** invoice-validation
**Agent count:** 3
**Pattern:** Sequential pipeline
**Agents:**
1. invoice-ingestion-agent — Extract invoice data
2. invoice-validation-agent — Validate against rules
3. invoice-routing-agent — Route to appropriate handler

## ARCHITECTURE BLOCKED

**Blocked by:** Ambiguous scope — unclear if OCR is in-scope
**Question:** Should the agent handle PDF parsing or expect structured input?
```

## Data Flow

### Primary Pipeline Flow

```
User Input (use case description)
    │
    ▼
Orchestrator: classify input depth (brief/moderate/detailed)
    │
    ▼
Architect: analyze use case
    │ Reads: user input, orchestration-patterns.md
    │ Writes: ARCHITECTURE_BLUEPRINT (in-memory, passed to next stage)
    │ Contains: agent count, roles, orchestration pattern, data flow
    │
    ▼
Domain Researchers (1 per agent role): investigate best practices
    │ Reads: blueprint for their assigned agent role, web search results
    │ Writes: RESEARCH_NOTES per agent (in-memory, passed to next stage)
    │ Contains: recommended model, prompt patterns, tool needs, gotchas
    │
    ▼
Spec Generators (1 per agent): produce Orq.ai-ready specs
    │ Reads: blueprint, research notes, orqai-agent-fields.md, agent-spec.md template
    │ Writes: agents/[agent-name].md files to disk
    │ Contains: all Orq.ai fields populated, copy-paste ready
    │
    ▼
Orchestration Generator: produce ORCHESTRATION.md
    │ Reads: blueprint, all agent specs
    │ Writes: ORCHESTRATION.md to disk
    │ Contains: agent sequence, Task ID strategy, error handling, HITL points
    │
    ▼
Dataset Generator: produce test and eval data
    │ Reads: all agent specs, ORCHESTRATION.md
    │ Writes: datasets/*.md files to disk
    │ Contains: test inputs, eval pairs, model comparison matrices
    │
    ▼
Assembler: final output
    │ Reads: all generated files
    │ Writes: README.md to disk
    │ Validates: completeness, naming conventions, field correctness
    │
    ▼
Output: Agents/[swarm-name]/ directory with all files
```

### Key Data Flows

1. **Blueprint propagation:** The architect's blueprint is the spine of the entire pipeline. Every downstream subagent receives it. It defines agent count (which determines how many researchers and spec generators spawn), orchestration pattern (which shapes ORCHESTRATION.md), and role descriptions (which guide research focus).

2. **Research-to-spec enrichment:** Domain researcher output enriches specs with model recommendations, prompt patterns, and tool definitions that the architect's high-level blueprint doesn't contain. Without research, specs get generic models and shallow prompts.

3. **Spec-to-dataset dependency:** The dataset generator must read completed specs to generate realistic test inputs and expected outputs. It cannot run in parallel with spec generation.

4. **Reference file consumption:** The `orqai-agent-fields.md` reference is consumed by the spec generator and the orchestration generator. The `orqai-model-catalog.md` is consumed by the architect and domain researchers. These are static -- they don't flow through the pipeline, they're injected at spawn time.

### State Management

There is no persistent state between invocations. Each `/orq-agent` run is stateless -- it produces output files and exits. State within a single run is managed by the orchestrator passing subagent outputs forward through the pipeline.

The only persistent artifact is the output directory (`Agents/[swarm-name]/`), which users can re-run on to iterate.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-5 agent swarms | Current architecture handles well. Pipeline completes in 2-5 minutes. Token cost ~$0.50-2.00 per run |
| 6-15 agent swarms | Parallel fan-out becomes critical. Sequential would take 10+ minutes. Consider chunking researchers into batches of 5 to stay within Claude Code's parallel task limits |
| 15+ agent swarms | Likely indicates the use case should be split into sub-swarms. The architect should recommend decomposition rather than designing one massive swarm |

### Scaling Priorities

1. **First bottleneck: Token context limits.** With 10+ agents, the accumulated specs exceed what the dataset generator and orchestration generator can hold in context. Mitigation: summarize specs before passing to these late-stage agents.
2. **Second bottleneck: Parallel task limits.** Claude Code has practical limits on concurrent Task() spawns. Mitigation: batch parallel work in groups of 4-5.

## Anti-Patterns

### Anti-Pattern 1: Monolithic Orchestrator Prompt

**What people do:** Put all logic (architecture analysis, research, spec generation, dataset creation) in one massive prompt.
**Why it's wrong:** Exceeds context limits quickly. No parallelism. No separation of concerns. One failure kills the entire run. The prompt becomes unmaintainable.
**Do this instead:** Pipeline of focused subagents, each with a single responsibility and clear input/output contract.

### Anti-Pattern 2: Hardcoding Orq.ai Field Knowledge in Agent Prompts

**What people do:** Embed Orq.ai field names, valid values, and API details directly in each subagent's prompt.
**Why it's wrong:** When Orq.ai updates their API (new fields, changed values, deprecations), you must update every subagent prompt. Inconsistencies creep in.
**Do this instead:** Single `references/orqai-agent-fields.md` file. All subagents that need field knowledge load it via `files_to_read`. Update one file, all subagents get the change.

### Anti-Pattern 3: Skipping the Architect Stage

**What people do:** Jump straight from user input to spec generation, letting each spec generator independently decide what agents are needed.
**Why it's wrong:** No coherent orchestration pattern. Agents overlap or leave gaps. No consistent data flow between agents. The swarm doesn't function as a system.
**Do this instead:** Always run the architect first. It produces the blueprint that gives the swarm coherence. Even detailed user inputs benefit from architectural analysis.

### Anti-Pattern 4: Generating JSON Instead of Markdown

**What people do:** Output raw JSON matching the Orq.ai API request format.
**Why it's wrong:** Target users are non-technical Moyne Roberts colleagues who copy-paste into Orq.ai Studio (a GUI). JSON is hostile to non-technical users -- one missing comma breaks everything. Studio has form fields, not a JSON editor.
**Do this instead:** Structured markdown with clear sections matching Studio fields. Each field has a heading, the value, and a brief explanation of why. Users read the explanation and paste the value into the corresponding Studio field. Future-proof: when Orq.ai MCP arrives, a thin adapter can parse the markdown into API calls.

### Anti-Pattern 5: Treating All Inputs Identically

**What people do:** Run the full pipeline (architect + research + spec gen + dataset) regardless of input detail level.
**Why it's wrong:** A detailed brief with model preferences, prompt drafts, and tool definitions wastes 3-5 minutes and significant tokens re-discovering what the user already specified.
**Do this instead:** Adaptive pipeline depth. Classify input, skip stages where the user has already done the work.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Orq.ai Studio** | Output files designed for manual copy-paste into Studio GUI | No API integration yet. Output format mirrors Studio field layout |
| **Orq.ai API (future)** | Machine-parseable markdown enables future MCP adapter | Keep field names and structure consistent with `/v2/agents` endpoint schema |
| **GitHub** | Distribution via `git clone` + symlink install | `bin/install.sh` handles clone, `bin/update.sh` handles `git pull` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Orchestrator to Architect | Task() spawn with user input + pattern library | Architect returns structured blueprint block |
| Orchestrator to Researchers | Parallel Task() spawns with blueprint excerpt per agent | Each researcher returns independently; orchestrator collects all |
| Orchestrator to Spec Generators | Parallel Task() spawns with blueprint + research notes | Each generator writes files directly to disk |
| Orchestrator to Dataset Generator | Single Task() spawn after all specs written | Reads specs from disk rather than receiving in prompt (context savings) |
| Skill to GSD | GSD can invoke `/orq-agent` as a slash command within a phase | Output lands in project directory, GSD continues its workflow |

## Build Order (Dependencies)

The following build order reflects hard dependencies between components:

```
Phase 1: References + Templates (no dependencies)
    │  orqai-agent-fields.md, orqai-model-catalog.md, orchestration-patterns.md
    │  agent-spec.md template, orchestration.md template, dataset templates
    │
Phase 2: Architect Subagent (depends on: references)
    │  architect.md — needs orchestration-patterns.md to recommend patterns
    │
Phase 3: Domain Researcher Subagent (depends on: references)
    │  domain-researcher.md — needs model-catalog.md for recommendations
    │  Can be built in parallel with Phase 2
    │
Phase 4: Spec Generator Subagent (depends on: references, templates)
    │  spec-generator.md — needs agent-spec.md template and field reference
    │
Phase 5: Dataset Generator Subagent (depends on: templates)
    │  dataset-generator.md — needs dataset templates
    │  Can be built in parallel with Phase 4
    │
Phase 6: Orchestrator Workflow (depends on: ALL subagents)
    │  design-swarm.md — spawns all subagents, manages pipeline
    │  This is the integration layer; requires all parts to exist
    │
Phase 7: Distribution (depends on: orchestrator)
    │  SKILL.md, install.sh, update workflow
    │  Last because it wraps everything for delivery
```

**Critical path:** References -> Architect -> Orchestrator -> Distribution. The researcher, spec generator, and dataset generator can be built in parallel once references exist, but the orchestrator cannot be tested until all subagents are functional.

## Sources

- [Orq.ai Agent API Documentation](https://docs.orq.ai/docs/agents/agent-api)
- [Orq.ai AI Agent Introduction](https://docs.orq.ai/docs/ai-agent)
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- GSD reference architecture (local: `~/.claude/get-shit-done/`)
- GSD `new-project.md` workflow (local: parallel subagent spawning pattern)
- GSD `research-phase.md` workflow (local: Task() spawn + structured return pattern)

---
*Architecture research for: Orq Agent Designer*
*Researched: 2026-02-24*
