---
description: Show available Orq Agent Designer commands, usage examples, and current version
allowed-tools: Read, Bash
---

# Orq Agent Designer Help

You are running the `/orq-agent:help` command. Display the help information for Orq Agent Designer.

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
  /orq-agent:test              Automated evaluation (test+ tier)
  /orq-agent:iterate           Prompt iteration with HITL (full tier)
  /orq-agent:harden            Guardrails & quality gates (full tier)
  /orq-agent:set-profile       Switch model profile
  /orq-agent:update            Check for and install updates
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
