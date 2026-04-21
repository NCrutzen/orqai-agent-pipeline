---
description: Show available Orq Agent Designer commands, usage examples, and current version
allowed-tools: Read, Bash
---

# Orq Agent Designer Help

You are running the `/orq-agent:help` command. Display the help information for Orq Agent Designer.

## Constraints

- **NEVER** omit a command from the help index.
- **NEVER** show deprecated commands as if they were active.
- **ALWAYS** list commands in the pipeline-order that `/orq-agent` follows.
- **ALWAYS** flag `/orq-agent:prompt` and `/orq-agent:architect` as lateral side-entries.

**Why these constraints:** Help is the first thing new users read; pipeline-order drives mental model; mis-labeled lateral commands confuse the flow.

## When to use

- User is new to Orq Agent Designer and runs `/orq-agent:help` to discover commands.
- User needs a quick reminder of a command name or flag.
- User wants to confirm the installed version.

## When NOT to use

- User needs in-depth documentation on a specific command → open the command's own skill file.
- User needs to change tier / reconfigure → re-run the installer with `--reconfigure`.

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- No subagent — this command only reads `VERSION` and prints text.
- Meta-command — lists all commands but does not invoke any.
- ← user invocation — discovery-time entry point.

## Done When

- [ ] Terminal shows the ORQ ► HELP banner with the current version
- [ ] Every command registered under `/orq-agent` or `/orq-agent:*` appears in the Commands list
- [ ] Usage examples + flags block rendered
- [ ] Output directory layout example present

## Destructive Actions

- **None** — this command is read-only (prints help text for all orq-agent commands).

## Step 1: Read Version

Check for the VERSION file at the install location:

```bash
cat "$HOME/.claude/skills/orq-agent/VERSION" 2>/dev/null || echo "unknown"
```

Store the result as `CURRENT_VERSION`. If the file was not found, set `CURRENT_VERSION="unknown (not installed via standard method)"`.

## Step 2: Display Help

Display the following help output, replacing `vX.Y.Z` with the actual version from Step 1:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► HELP                                    vX.Y.Z
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commands:
  /orq-agent "description"     Generate agent specs from a use case
  /orq-agent:prompt "desc"     Quick single-agent generator
  /orq-agent:architect "desc"  Standalone architecture design
  /orq-agent:tools             Unified tool resolver
  /orq-agent:research          Domain best practices research
  /orq-agent:datasets          Test dataset generation
  /orq-agent:deploy            Deploy specs to Orq.ai (deploy+ tier)
  /orq-agent:kb                KB management (deploy+ tier)
  /orq-agent:test              Automated evaluation (test+ tier)
  /orq-agent:iterate           Prompt iteration with HITL (full tier)
  /orq-agent:harden            Guardrails & quality gates (full tier)
  /orq-agent:set-profile       Switch model profile
  /orq-agent:systems           Manage IT systems registry
  /orq-agent:update            Check for and install updates
  /orq-agent:workspace         Single-screen workspace overview
  /orq-agent:traces            Query production traces (errors first)
  /orq-agent:analytics         Requests/cost/tokens/error-rate summary
  /orq-agent:models            List Model Garden models by provider & type
  /orq-agent:quickstart        12-step onboarding tour
  /orq-agent:observability     Instrument LLM app for trace capture (framework detect + codegen)
  /orq-agent:trace-failure-analysis  Grounded-theory failure taxonomy from ~100 traces (deploy+ tier)
  /orq-agent:automations       Trace Automation rules (list / --create)
  /orq-agent:help              Show this help

Usage examples:
  /orq-agent "Build a customer support triage system"
  /orq-agent "Multi-agent content pipeline with research, writing, and editing"
  /orq-agent --gsd "Build invoice processing agents"
  /orq-agent --output ./my-agents "Build a chatbot"

Flags:
  --gsd              Enable GSD integration mode
  --output <path>    Override default output directory (default: ./Agents/)

Reconfigure (change tier, API key, or MCP setup):
  curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash -s -- --reconfigure

Output: ./Agents/[swarm-name]/
  ├── agents/           Per-agent specifications
  ├── datasets/         Test data with adversarial cases
  ├── ORCHESTRATION.md  Agent wiring (multi-agent swarms)
  └── README.md         Setup guide
```

That is the complete output. Do not add anything else.

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Adding explanatory prose around the banner | Keep the banner verbatim — consistency matters for readers; elaboration belongs in each command's own file |
| Omitting the version line | The version is a load-bearing diagnostic; users paste it into issue reports |
| Hiding lateral commands to "simplify" | Lateral side-entries (`prompt`, `architect`) solve distinct problems; omitting them strands users |
| Listing commands alphabetically instead of pipeline-order | Pipeline-order teaches the mental model; alphabetical loses the sequencing signal |

## Open in orq.ai

- **N/A** — this skill is a local help command (no Orq.ai entities involved)

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`search_entities`, `get_agent`, `models-list`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
