---
name: orq-agent
description: Generate complete, copy-paste-ready Orq.ai Agent specifications with orchestration logic from use case descriptions
---

# orq-agent

Generate complete, copy-paste-ready Orq.ai Agent specifications with orchestration logic from use case descriptions.

## Directory Structure

```
orq-agent/
  SKILL.md                       # This file -- skill index
  systems.md                     # User-configurable IT systems registry
  commands/
    orq-agent.md                 # Phase 3: Orchestrator slash command
    prompt.md                    # Quick single-agent spec generator
    architect.md                 # Standalone architect command
    tools.md                     # Standalone tool resolver command
    research.md                  # Standalone researcher command
    datasets.md                  # Standalone dataset generator command
    deploy.md                    # Phase 5: Deploy to Orq.ai (requires deploy+ tier)
    kb.md                        # KB management: generate, provision, upload
    test.md                      # Phase 5: Automated testing (requires test+ tier)
    iterate.md                   # Phase 5: Prompt iteration (requires full tier)
    harden.md                    # Phase 9: Guardrails and quality gates (requires full tier)
    set-profile.md               # Phase 5: Model profile management
  agents/
    architect.md                 # Phase 1: Architect subagent
    tool-resolver.md             # Phase 4.2: Tool resolver subagent
    researcher.md                # Phase 2: Domain researcher subagent
    spec-generator.md            # Phase 2: Spec generator subagent (includes tool schemas)
    orchestration-generator.md   # Phase 2: Orchestration generator subagent
    dataset-generator.md         # Phase 2: Dataset generator subagent
    readme-generator.md          # Phase 2: README generator subagent
    kb-generator.md              # KB content generation from pipeline context
    hardener.md                  # Phase 9: Guardrails promotion and quality gates
  templates/
    agent-spec.md                # Template: individual agent specification
    orchestration.md             # Template: swarm orchestration document
    dataset.md                   # Template: test dataset with adversarial cases
    readme.md                    # Template: swarm README for non-technical users
    tools.md                     # Template: tool landscape and per-agent assignments
    test-results.json            # Phase 5: V2.0 test results template (JSON)
    iteration-log.json           # Phase 5: V2.0 iteration audit template (JSON)
    quality-report.json          # Phase 9: Quality gate results template (JSON)
  references/
    orqai-agent-fields.md        # Orq.ai v2 API field reference (18 fields, 15 tool types)
    orqai-model-catalog.md       # Model catalog by use case (14 providers, 12 models)
    orchestration-patterns.md    # Three orchestration patterns with complexity gate
    naming-conventions.md        # Agent key naming rules with regex validation
    tool-catalog.md              # Unified tool catalog (built-in + MCP + HTTP/function patterns)
    agentic-patterns.md          # Phase 5: Anthropic composable patterns + context engineering
    orqai-api-endpoints.md       # Phase 5: REST API endpoint reference for V2.0 subagents
    orqai-evaluator-types.md     # Phase 5: Evaluator taxonomy for automated testing
  .orq-agent/
    config.json                  # Capability tier + model profile settings
```

## Output Directory Convention

Generated swarms are written to the following structure:

```
Agents/[swarm-name]/
  TOOLS.md                       # Tool landscape and per-agent assignments (always generated)
  ORCHESTRATION.md               # Swarm orchestration document (multi-agent only)
  agents/
    [agent-name].md              # Per-agent specification
  datasets/
    [agent-name]-dataset.md      # Per-agent test data with adversarial cases
  README.md                      # Setup guide for non-technical users
```

- `[swarm-name]` matches the domain portion of agent keys (e.g., `customer-support`)
- Single-agent swarms omit ORCHESTRATION.md; all files are markdown

## Commands

### Orchestrator

| Command | File | Purpose |
|---------|------|---------|
| `/orq-agent` | `commands/orq-agent.md` | Main orchestrator -- accepts use case descriptions, runs structured discussion, enriches input, runs adaptive pipeline (Architect -> Tool Resolver -> Researcher -> Spec Generator -> Post-Generation), produces complete swarm specs |
| `/orq-agent:update` | `commands/update.md` | Check for and install updates from GitHub |
| `/orq-agent:prompt` | `commands/prompt.md` | Quick single-agent spec generator -- skips full pipeline, asks 2-3 questions inline, spawns spec-generator directly |
| `/orq-agent:architect` | `commands/architect.md` | Standalone architect -- designs swarm blueprint from use case description |
| `/orq-agent:tools` | `commands/tools.md` | Standalone tool resolver -- resolves tool needs and produces TOOLS.md |
| `/orq-agent:research` | `commands/research.md` | Standalone researcher -- investigates domain best practices for agent roles |
| `/orq-agent:datasets` | `commands/datasets.md` | Standalone dataset generator -- produces dual test datasets (clean + edge) |
| `/orq-agent:help` | `commands/help.md` | Show available commands, usage examples, and version |

### V2.0 Commands (Phase 5+)

| Command | File | Tier Required | Purpose |
|---------|------|---------------|---------|
| `/orq-agent:deploy` | `commands/deploy.md` | deploy+ | Deploy agent specs to Orq.ai via MCP (V1.0 fallback: copy-paste steps) |
| `/orq-agent:kb` | `commands/kb.md` | deploy+ | Manage KBs -- generate content, provision, upload files |
| `/orq-agent:test` | `commands/test.md` | test+ | Run automated tests against deployed agents (V1.0 fallback: manual steps) |
| `/orq-agent:iterate` | `commands/iterate.md` | full | Iterate on prompts using evaluator feedback (V1.0 fallback: manual steps) |
| `/orq-agent:harden` | `commands/harden.md` | full | Set up guardrails and quality gates from test results |
| `/orq-agent:set-profile` | `commands/set-profile.md` | any | View or change model profile (quality/balanced/budget) |
| `/orq-agent:systems` | `commands/systems.md` | any | Manage IT systems registry (list, add, remove) |

**Invocation:** `/orq-agent "description"` | `/orq-agent` (interactive) | `--gsd` flag | `--output <path>`

## Command Flags

| Flag | Commands | Purpose |
|------|----------|---------|
| `--agent {key}` | deploy, test, iterate, harden | Scope operation to a single agent (+ tool dependencies for deploy) |
| `--all` | test, iterate, harden | Explicitly run on all agents in swarm |
| `--gsd` | orq-agent | Run in GSD mode |
| `--output <path>` | orq-agent | Override default output directory |

## Subagents

### Phase 1 (Foundation)

| Agent | File | Purpose |
|-------|------|---------|
| Architect | `agents/architect.md` | Analyzes use cases, applies complexity gate, produces swarm blueprints |

### Phase 2 (Core Generation)

| Agent | File | Purpose |
|-------|------|---------|
| Researcher | `agents/researcher.md` | Investigates domain best practices, produces research briefs with model/prompt/tool/guardrail recommendations |
| Spec Generator | `agents/spec-generator.md` | Fills agent-spec template with all Orq.ai fields including full system prompts and tool schemas |
| Orchestration Generator | `agents/orchestration-generator.md` | Creates ORCHESTRATION.md with agent-as-tool assignments, data flow, Mermaid diagrams, error handling |
| Dataset Generator | `agents/dataset-generator.md` | Produces dual datasets (clean + edge case) with eval pairs and multi-model comparison matrices |
| README Generator | `agents/readme-generator.md` | Generates per-swarm README with setup instructions for non-technical users |

### Phase 4.2 (Tool Resolution)

| Agent | File | Purpose |
|-------|------|---------|
| Tool Resolver | `agents/tool-resolver.md` | Resolves tool needs per agent by consulting curated catalog and web search, produces TOOLS.md with verified Orq.ai-native configs |

### Phase 8 (Prompt Iteration)

| Agent | File | Purpose |
|-------|------|---------|
| Iterator | `agents/iterator.md` | Analyzes test failures, proposes targeted prompt changes with diff-style views, collects per-agent approval, orchestrates re-deploy/re-test cycle with holdout validation |

### Phase 5 (KB Management)

| Agent | File | Purpose |
|-------|------|---------|
| KB Generator | `agents/kb-generator.md` | Generates KB-ready documents from pipeline context or domain templates |

### Phase 9 (Guardrails)

| Agent | File | Purpose |
|-------|------|---------|
| Hardener | `agents/hardener.md` | Analyzes test results, suggests guardrails for promotion, collects approval, attaches to deployed agents, generates quality gate reports |

## References

| File | Purpose |
|------|---------|
| `orqai-agent-fields.md` | All 18 Orq.ai v2 API fields and 15 tool types with configuration JSON |
| `orqai-model-catalog.md` | 14 providers with format patterns, 12 curated models across 5 use cases |
| `orchestration-patterns.md` | Single, sequential, and parallel patterns with selection criteria and complexity gate |
| `naming-conventions.md` | `[domain]-[role]-agent` convention, regex validation, 12 valid and 7 invalid examples |
| `tool-catalog.md` | Unified catalog: built-in tools, 21 MCP servers, HTTP/function patterns with resolution priority chain |
| `agentic-patterns.md` | Anthropic composable patterns mapped to Orq.ai equivalents |
| `orqai-api-endpoints.md` | REST API endpoints for V2.0 deploy/test/iterate subagents |
| `orqai-evaluator-types.md` | Evaluator taxonomy: 3 built-in categories + 4 custom types |

## Capability Tiers

Installed via `install.sh`. Config stored at `.orq-agent/config.json`.

| Tier | Capabilities | Commands |
|------|-------------|----------|
| core | Spec generation | `/orq-agent` |
| deploy | + Deployment | `/orq-agent:deploy` |
| test | + Automated testing | `/orq-agent:test` |
| full | + Prompt iteration + Hardening | `/orq-agent:iterate`, `/orq-agent:harden` |

- Default profile: **quality** (best output out-of-the-box)
- Change profile: `/orq-agent:set-profile [quality|balanced|budget]`
- V2.0 commands check MCP availability; fall back to V1.0 copy-paste output when MCP unavailable

## V2.0 Runtime Dependencies

Packages required by V2.0 subagents at runtime. Not installed by `install.sh` (which only copies files) — subagents ensure availability at execution time.

| Package | Version | Purpose | Tier Required |
|---------|---------|---------|---------------|
| `@orq-ai/node` | latest | Orq.ai SDK — used for `deployments.invoke()` with modelId override (A/B testing). Env: `ORQ_API_KEY` | deploy+ |
| `@orq-ai/evaluatorq` | `^1.1.0` | Experiment execution framework (Effect-based parallel evaluations) | test+ |
| `@orq-ai/evaluators` | `^1.1.0` | Local evaluator scorers (peer dep of evaluatorq — cosine similarity, threshold evaluators) | test+ |

> **Note:** `@orq-ai/evaluatorq` also declares peer dependencies on `@opentelemetry/*` packages for tracing. These are optional — evaluatorq works without them but npm may issue warnings.
>
> **SDK vs REST vs MCP:** The SDK is used for `deployments.invoke()` with modelId override. Agent CRUD uses MCP tools. Experiments and dataset uploads use REST via curl. See `orqai-api-endpoints.md` for the full pattern.

## Templates

| File | Purpose |
|------|---------|
| `agent-spec.md` | Template for individual agent specs with all Orq.ai fields and tool subsections |
| `orchestration.md` | Template for swarm orchestration docs with setup steps and data flow |
| `dataset.md` | Template for test datasets requiring 30% adversarial cases minimum |
| `readme.md` | Template for swarm READMEs with non-technical setup instructions |
| `tools.md` | Template for TOOLS.md output with capability-first organization and per-agent config JSON |
| `test-results.json` | V2.0 test results template (JSON) |
| `iteration-log.json` | V2.0 iteration audit log template (JSON) |
| `quality-report.json` | V2.0 quality gate results template (JSON) |

## Distribution

- **Install:** `curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash`
- **Update:** `/orq-agent:update` (version-aware, shows changelog, auto-rollback)
- **Location:** Installed to `~/.claude/skills/orq-agent/`
- **GSD integration:** Use `--gsd` flag when invoking from a GSD phase
- **Custom output:** Use `--output <path>` to override default `./Agents/` directory

## Key Design Decisions

- **Complexity gate:** Architect defaults to single-agent; each extra agent requires justification
- **Reference files under 1000 words:** Preserves subagent context window for reasoning
- **Discussion-first flow:** Structured discussion enriches input before architect runs
- **Only researcher is skippable:** Internal decision after discussion, not user-facing
- **Wave-based parallelism:** Research -> spec generation -> post-generation, parallel within waves
- **Lean orchestrator:** Passes file paths to subagents, not full content
- **Tool resolver always runs:** Resolves tools from blueprint even when researcher skipped
- **TOOLS.md is authoritative:** Spec generator and researcher defer to TOOLS.md for tool selection
- **MCP-first V2.0:** Deploy/test/iterate use MCP when available, V1.0 copy-paste fallback otherwise
- **Clean install:** Always overwrite from GitHub; no user customization preservation
- **`--gsd` flag is a hint:** Skill works standalone without GSD installed

## User Configuration

| File | Purpose | Managed By |
|------|---------|------------|
| `systems.md` | IT systems your agents interact with (integration methods, URLs, auth) | User |
| `.orq-agent/config.json` | Capability tier, model profile, API key | Installer |
