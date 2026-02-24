# Stack Research

**Domain:** Claude Code skill for LLM agent specification generation (Orq.ai target)
**Researched:** 2026-02-24
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Claude Code Skills System | v2.1+ | Primary distribution and execution framework | The unified skills system (merged in v2.1.3, Jan 2026) is the canonical way to extend Claude Code. Skills support subagent delegation, supporting files, frontmatter-controlled invocation, and `$ARGUMENTS` substitution. This is how users invoke `/orq-agent`. |
| Claude Code Plugin System | v1.0.33+ | Distribution and installation mechanism | Plugins are the official packaging format for sharing skills across projects and teams. They support namespaced commands (`/orq-agent:design`), marketplace distribution via GitHub, versioned releases, and bundling of skills + agents + templates in one installable unit. |
| Claude Code Subagents | v2.1+ | Architect, researcher, and generator pipeline | Custom subagents (`.claude/agents/` markdown files) run in isolated contexts with custom system prompts, tool restrictions, and model selection. The skill spawns subagents for architect analysis, domain research, and spec generation — each with focused instructions and appropriate tool access. |
| Markdown | -- | Agent specification output format | Orq.ai Studio accepts manual configuration. Human-readable `.md` files with structured sections map directly to Orq.ai Agent fields. Non-technical users can read, understand, and copy-paste from markdown without tooling. |

### Orq.ai API Surface (Reference, Not Runtime Dependency)

| Technology | Version | Purpose | Why Documented |
|------------|---------|---------|----------------|
| Orq.ai Agents API | v2 | Target specification format | `POST /v2/agents` defines the schema our output must conform to: `key`, `role`, `description`, `instructions`, `model`, `settings` (max_iterations, max_execution_time), `tools` (function/code/http/mcp), `knowledge_bases`, `memory_stores`, `team_of_agents`. Output specs must be valid for this endpoint. |
| A2A Protocol | latest (2025) | Agent-to-agent communication standard | Orq.ai payloads are built on A2A Protocol (a2a-protocol.org). Task states (submitted, working, input_required, completed, failed, canceled), message parts format (text/file/tool_call kinds), and task_id continuation pattern must be documented in orchestration specs. |
| Orq.ai Tool Types | v2 | Tool specification format | Seven tool types must be representable: `function` (JSON Schema params), `code` (Python), `http` (URL templates with `{{params}}`), `mcp` (server_url + connection_type), `google_search`, `web_scraper`, plus agent tools (`retrieve_agents`, `call_sub_agent`). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| JSON Schema | draft-2020-12 | Tool parameter definitions | Every Orq.ai function tool requires JSON Schema for its parameters. Agent specs must include valid schemas that Orq.ai can consume for tool execution. |
| Bash scripts (via skill) | -- | Dynamic context injection, validation | Skills support `!`command`` syntax for preprocessing. Use for fetching current Orq.ai model catalog, validating output structure, or injecting project context before generation. |
| GitHub CLI (gh) | latest | Distribution, updates, version management | Plugin distribution uses GitHub repositories. The `/orq-agent:update` mechanism pulls latest from GitHub. Users install via `/plugin marketplace add` or `--plugin-dir`. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Claude Code `--plugin-dir` | Local plugin testing | Load plugin from local directory during development without installation. Supports multiple plugins: `claude --plugin-dir ./orq-agent-plugin` |
| `/agents` command | Subagent management | Interactive interface for creating, editing, and testing custom subagents. Changes take effect immediately without restart. |
| `claude agents` | CLI subagent listing | Non-interactive listing of all configured subagents grouped by source. Useful for verifying plugin subagents loaded correctly. |

## Architecture: Skill vs Plugin Decision

**Recommendation: Build as a Plugin** because:

1. **Namespaced commands** prevent conflicts (`/orq-agent:design`, `/orq-agent:update`)
2. **Bundled assets** — plugins package skills, agents, templates, and reference docs in one unit
3. **Marketplace distribution** — installable via `/plugin install` from any GitHub repo
4. **Version management** — semantic versioning in `plugin.json` enables tracked updates
5. **Team sharing** — one install command for all 5-15 Moyne Roberts users

The GSD system uses a different pattern (personal `~/.claude/` installation with a shell script) because it predates the plugin system. For new work in 2026, plugins are the correct abstraction.

### Plugin Directory Structure

```
orq-agent/
  .claude-plugin/
    plugin.json              # name, description, version, author
  skills/
    design/
      SKILL.md               # Main /orq-agent:design entry point
      templates/
        agent-spec.md        # Template for individual agent specs
        orchestration.md     # Template for orchestration documentation
        dataset.md           # Template for test/eval datasets
      reference/
        orq-api-surface.md   # Orq.ai API fields reference
        model-catalog.md     # Model recommendations by use case
        tool-types.md        # Tool configuration patterns
      examples/
        invoice-checker/     # Example swarm output
    update/
      SKILL.md               # /orq-agent:update skill
  agents/
    architect.md             # Analyzes use case, determines agent count + orchestration
    domain-researcher.md     # Investigates best practices per agent role
    spec-generator.md        # Produces final agent specifications
    dataset-generator.md     # Creates test inputs and eval pairs
  README.md                  # Installation and usage instructions
```

## Subagent Architecture

### Architect Subagent

```yaml
---
name: orq-architect
description: Analyzes use cases and designs agent swarm topology. Use when designing new Orq.ai agent configurations.
tools: Read, Grep, Glob
model: inherit
skills:
  - orq-agent:design
---
```

- Receives use case description
- Determines: agent count, roles, orchestration pattern (single/sequential/parallel)
- Outputs: swarm blueprint with agent names, responsibilities, data flow
- Runs with read-only tools (no side effects)

### Domain Researcher Subagent

```yaml
---
name: orq-domain-researcher
description: Researches best practices for specific agent roles. Skipped when user provides detailed specifications.
tools: Read, Grep, Glob, WebSearch
model: sonnet
---
```

- Receives individual agent role from architect
- Investigates: model selection, prompt patterns, tool needs, knowledge base relevance
- Outputs: recommendations per agent for model, instructions approach, tool configuration
- Uses Sonnet for capability; read-only + web search

### Spec Generator Subagent

```yaml
---
name: orq-spec-generator
description: Generates Orq.ai agent specification files from architect blueprints and researcher recommendations.
tools: Read, Write, Glob
model: inherit
---
```

- Receives blueprint + research
- Produces: one `.md` per agent with all Orq.ai fields, `ORCHESTRATION.md`, `README.md`
- Uses templates from skill supporting files
- Writes directly to `Agents/[swarm-name]/` directory

### Dataset Generator Subagent

```yaml
---
name: orq-dataset-generator
description: Creates test inputs, eval pairs, and model comparison matrices for agent experimentation.
tools: Read, Write
model: sonnet
---
```

- Receives agent specs
- Produces: test inputs, expected output pairs, multi-model comparison matrices
- Writes to `datasets/` subdirectory

## Installation

```bash
# Option 1: Direct plugin installation from GitHub (recommended for users)
# Users run this inside Claude Code:
/plugin marketplace add moyne-roberts/orq-agent

# Option 2: Local development testing
claude --plugin-dir ./orq-agent

# Option 3: Manual skill installation (fallback for non-plugin setups)
git clone https://github.com/moyne-roberts/orq-agent.git ~/.claude/plugins/orq-agent
```

No npm packages required. The entire skill is markdown files, templates, and optional bash scripts. This is intentional — Claude Code skills are prompt-driven, not code-driven.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Claude Code Plugin | Personal skills (`~/.claude/skills/`) | Single developer, no distribution needed. Simpler but cannot be versioned or shared via marketplace. |
| Plugin distribution | GSD-style shell install script | Only if targeting Claude Code versions before v1.0.33 that lack plugin support. Unlikely in 2026. |
| Markdown output specs | JSON output specs | Only if Orq.ai MCP integration arrives and requires machine-parseable input. The current design is future-proofed: structured markdown sections map 1:1 to JSON fields. |
| Subagent pipeline | Single monolithic skill | Only for very simple single-agent use cases. The subagent approach preserves context (each agent runs in isolation) and enables smart skipping of research when input is detailed. |
| `context: fork` skills | Custom subagent definitions | When the task is simple enough that a single forked skill suffices. For multi-step pipelines with different tool access per step, custom subagents are more appropriate. |
| Inherit model | Fixed model per subagent | Default to inherit so the user's model choice propagates. Fix model only for specific subagents (researcher uses Sonnet for capability, dataset generator uses Sonnet for creativity). |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Orq.ai Python/TypeScript SDK | No runtime API calls — this skill generates specs, not deployments. Adding SDK dependencies complicates installation for non-technical users and adds no value. | Markdown templates with Orq.ai API field structure baked in |
| `.claude/commands/` directory | Legacy format. Still works but lacks supporting files, frontmatter control, and subagent integration. | `.claude/skills/` or plugin `skills/` directory |
| Auto-update on launch | Surprise changes mid-workflow frustrate users. Claude Code plugins handle versioning natively. | Manual `/orq-agent:update` skill or plugin version bumps |
| LangChain / LangGraph / CrewAI | These are agent execution frameworks. This skill generates agent specifications for Orq.ai, not executing agents. Adding framework dependencies is wrong abstraction level. | Pure Claude Code subagent orchestration (markdown-driven) |
| Custom MCP server | Overkill for this use case. MCP servers provide tool access to external systems. This skill reads templates and writes files — standard Claude Code tools suffice. | Built-in Read, Write, Glob, Grep tools |
| `bypassPermissions` mode | Security risk. Subagents should request only the tools they need. | Explicit `tools` allowlists per subagent |
| npm/pip package distribution | Adds installation complexity for non-technical users. Claude Code plugins install with a single command. | GitHub-based plugin distribution |

## Stack Patterns by Variant

**If building for single-agent use cases only:**
- Skip the architect subagent
- Use a single `context: fork` skill with the Explore agent
- Output one agent spec file directly
- Because: orchestration logic is unnecessary for single agents

**If Orq.ai MCP becomes available:**
- Add an MCP server definition to the plugin (`.mcp.json`)
- Create a `/orq-agent:deploy` skill that pushes specs via API
- Keep markdown output as the primary format (human review before deploy)
- Because: the spec-first workflow remains valuable even with API access

**If targeting Claude Code versions without plugin support:**
- Fall back to personal skills installation (`~/.claude/skills/orq-agent/`)
- Distribute via git clone + manual copy
- Lose namespacing (commands become `/design` instead of `/orq-agent:design`)
- Because: skills work universally, plugins require v1.0.33+

**If user provides very detailed input:**
- Architect subagent still runs (determines structure)
- Domain researcher subagent is skipped entirely
- Spec generator receives architect output directly
- Because: smart subagent spawning saves tokens and time (per PROJECT.md requirement)

## Version Compatibility

| Component | Compatible With | Notes |
|-----------|-----------------|-------|
| Plugin system | Claude Code v1.0.33+ | Plugin manifest and `/plugin` command. Pre-v1.0.33 users fall back to skill installation. |
| Skills unified system | Claude Code v2.1.0+ | Merged skills/commands. Older versions use `.claude/commands/` only. |
| Subagent `context: fork` | Claude Code v2.0.20+ | Forked execution for skills. Required for isolated agent runs. |
| Custom subagents (`agents/`) | Claude Code v1.0.60+ | Agent markdown files in `.claude/agents/`. Needed for architect/researcher/generator pipeline. |
| `skills` preloading in agents | Claude Code v2.1+ | Injecting full skill content into subagent context at startup. |
| `$ARGUMENTS` substitution | Claude Code v2.1+ | Dynamic skill arguments. Used for passing use case descriptions. |
| `disable-model-invocation` | Claude Code v2.1+ | Prevents auto-invocation of `/orq-agent:design`. Users must invoke explicitly. |
| Orq.ai Agents API | v2 | `POST /v2/agents` endpoint. Agent key versioning via `@version-number` suffix. |
| A2A Protocol | 2025 release | Task lifecycle states, message parts format. Orq.ai's stated protocol foundation. |

## Sources

- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) -- Full skill architecture, frontmatter reference, supporting files, subagent integration. HIGH confidence.
- [Claude Code Plugins Documentation](https://code.claude.com/docs/en/plugins) -- Plugin structure, manifest format, distribution via marketplaces. HIGH confidence.
- [Claude Code Subagents Documentation](https://code.claude.com/docs/en/sub-agents) -- Custom agent definitions, tool restrictions, model selection, persistence. HIGH confidence.
- [Orq.ai Agent API Documentation](https://docs.orq.ai/docs/agents/agent-api) -- Full v2 API surface: endpoints, request/response formats, tool types, task states. HIGH confidence.
- [Orq.ai AI Agent Introduction](https://docs.orq.ai/docs/ai-agent) -- Agent configuration fields, creation workflow, model/tool setup. HIGH confidence.
- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/) -- Agent-to-agent communication standard underpinning Orq.ai payloads. HIGH confidence.
- [Anthropic Official Plugin Marketplace](https://github.com/anthropics/claude-plugins-official) -- Distribution model reference. HIGH confidence.
- [Claude Code Skills vs Slash Commands 2026](https://yingtu.ai/blog/claude-code-skills-vs-slash-commands) -- Evolution timeline, migration guidance. MEDIUM confidence (third-party synthesis).
- [Claude Code Merges Slash Commands Into Skills](https://medium.com/@joe.njenga/claude-code-merges-slash-commands-into-skills-dont-miss-your-update-8296f3989697) -- v2.1.3 merge details. MEDIUM confidence (community source).

---
*Stack research for: Orq Agent Designer — Claude Code skill for LLM agent specification generation*
*Researched: 2026-02-24*
