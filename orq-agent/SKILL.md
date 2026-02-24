# orq-agent

Generate complete, copy-paste-ready Orq.ai Agent specifications with orchestration logic from use case descriptions.

## Directory Structure

```
orq-agent/
  SKILL.md                       # This file -- skill index
  commands/
    orq-agent.md                 # Phase 3: Orchestrator slash command
  agents/
    architect.md                 # Phase 1: Architect subagent
    researcher.md                # Phase 2: Domain researcher subagent
    spec-generator.md            # Phase 2: Spec generator subagent (includes tool schemas)
    orchestration-generator.md   # Phase 2: Orchestration generator subagent
    dataset-generator.md         # Phase 2: Dataset generator subagent
    readme-generator.md          # Phase 2: README generator subagent
  templates/
    agent-spec.md                # Template: individual agent specification
    orchestration.md             # Template: swarm orchestration document
    dataset.md                   # Template: test dataset with adversarial cases
    readme.md                    # Template: swarm README for non-technical users
  references/
    orqai-agent-fields.md        # Orq.ai v2 API field reference (18 fields, 15 tool types)
    orqai-model-catalog.md       # Model catalog by use case (14 providers, 12 models)
    orchestration-patterns.md    # Three orchestration patterns with complexity gate
    naming-conventions.md        # Agent key naming rules with regex validation
```

## Output Directory Convention

Generated swarms are written to the following structure:

```
Agents/[swarm-name]/
  ORCHESTRATION.md               # Swarm orchestration document (multi-agent only)
  agents/
    [agent-name].md              # Per-agent specification
  datasets/
    [agent-name]-dataset.md      # Per-agent test data with adversarial cases
  README.md                      # Setup guide for non-technical users
```

- `[swarm-name]` matches the domain portion of agent keys (e.g., `customer-support`)
- Single-agent swarms still use this structure (ORCHESTRATION.md is omitted)
- All files are markdown -- no runtime code, no dependencies

## Commands

### Orchestrator

| Command | File | Purpose |
|---------|------|---------|
| `/orq-agent` | `commands/orq-agent.md` | Main orchestrator -- accepts use case descriptions, classifies input depth, runs adaptive pipeline, produces complete swarm specs |
| `/orq-agent:update` | `commands/update.md` | Check for and install updates from GitHub |
| `/orq-agent:help` | `commands/help.md` | Show available commands, usage examples, and version |

**Invocation modes:**
- Inline: `/orq-agent "Build a customer support triage system"`
- Interactive: `/orq-agent` (prompts for input)
- GSD mode: `/orq-agent --gsd "Build invoice processing agents"`
- Custom output: `/orq-agent --output ./my-agents "Build a chatbot"`

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

## References

| File | Purpose |
|------|---------|
| `orqai-agent-fields.md` | All 18 Orq.ai v2 API fields and 15 tool types with configuration JSON |
| `orqai-model-catalog.md` | 14 providers with format patterns, 12 curated models across 5 use cases |
| `orchestration-patterns.md` | Single, sequential, and parallel patterns with selection criteria and complexity gate |
| `naming-conventions.md` | `[domain]-[role]-agent` convention, regex validation, 12 valid and 7 invalid examples |

## Templates

| File | Purpose |
|------|---------|
| `agent-spec.md` | Template for individual agent specs with all Orq.ai fields and tool subsections |
| `orchestration.md` | Template for swarm orchestration docs with setup steps and data flow |
| `dataset.md` | Template for test datasets requiring 30% adversarial cases minimum |
| `readme.md` | Template for swarm READMEs with non-technical setup instructions |

## Distribution

- **Install:** `curl -sfL https://raw.githubusercontent.com/OWNER/REPO/main/install.sh | bash`
- **Update:** `/orq-agent:update` (version-aware, shows changelog, auto-rollback)
- **Location:** Installed to `~/.claude/skills/orq-agent/`
- **GSD integration:** Use `--gsd` flag when invoking from a GSD phase
- **Custom output:** Use `--output <path>` to override default `./Agents/` directory

## Key Design Decisions

- **Complexity gate:** Architect defaults to single-agent design; each additional agent requires explicit justification
- **Reference files under 1000 words:** Preserves subagent context window for reasoning
- **{{PLACEHOLDER}} format:** Matches Orq.ai native variable syntax for consistency
- **Self-contained templates:** Each template has its own legend; no cross-template dependencies
- **Hyphens-only naming:** Agent keys use kebab-case despite regex allowing dots and underscores
- **Embedded classifier:** Input classification is an LLM analysis step within the orchestrator prompt, not a separate subagent
- **Only researcher is skippable:** All other stages always run regardless of input detail level
- **Wave-based parallelism:** Researchers parallel, then spec generators parallel, then post-generation parallel
- **Lean orchestrator:** Passes file paths to subagents rather than loading outputs into orchestrator context
- **`--gsd` flag is a hint, not a dependency:** Skill works standalone without GSD installed
- **Install to skills directory:** `~/.claude/skills/orq-agent/` for multi-file support without plugin namespace overhead
- **Clean install every time:** No preservation of user customizations; always overwrite from GitHub
