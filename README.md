# Orq Agent Designer

Generate, deploy, test, iterate, and harden Orq.ai agent swarms from a simple use case description. Built as a Claude Code skill for the Moyne Roberts team.

## What it does

Describe what you need in plain language, and the pipeline produces:
- Agent specs with all Orq.ai fields (model, instructions, tools, guardrails, etc.)
- Orchestration docs with data flow diagrams and error handling
- Test datasets with adversarial edge cases
- Knowledge base content (FAQs, policies, knowledge articles)
- A step-by-step setup README

Then autonomously:
- **Deploys** agents to Orq.ai (MCP-first, REST API fallback)
- **Provisions** knowledge bases with embedding model selection and auto-chunking
- **Tests** with automated evaluations (3x median scoring, holdout validation)
- **Iterates** prompts based on test failures (diff proposals, user approval required)
- **Hardens** with guardrails and quality gates before production

### Pipeline architecture

```
Use case description
  -> Discussion (surfaces gray areas, clarifies requirements)
    -> Architect (designs swarm topology, complexity gate)
      -> Researcher (domain best practices per agent)
      -> Tool Resolver (MCP-first tool catalog)
        -> Spec Generator (all 18 Orq.ai fields)
          -> Orchestration Generator (data flow, error handling)
          -> Dataset Generator (clean + adversarial test data)
          -> KB Generator (knowledge base content)
            -> README Generator (setup guide)
              -> Deployer (agents, tools, KBs to Orq.ai)
                -> Tester (3x experiments, holdout validation)
                  -> Iterator (diagnose failures, propose fixes)
                    -> Hardener (guardrails, quality gates)
```

17 specialized subagents, wave-based parallel execution, adaptive depth based on input detail.

## Prerequisites

1. **Node.js** -- download from [nodejs.org](https://nodejs.org/)
2. **Claude Code** -- run in your terminal:
   ```
   npm install -g @anthropic-ai/claude-code
   ```

Not sure if you have these? Run `node --version` and `claude --version`. If both show a version number, you're good.

## Install

```bash
curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

The installer checks prerequisites, downloads the skill, and verifies the installation. Choose your capability tier during install:

| Tier | Capabilities |
|------|-------------|
| core | Spec generation only |
| deploy | + Deployment + KB provisioning |
| test | + Automated testing |
| full | + Prompt iteration + Hardening |

## Usage

Inside Claude Code:

```
/orq-agent "Build a customer support triage system"
```

The pipeline guides you through a short discussion to clarify your needs, then generates the full agent swarm specification.

### All commands

**Generation**

| Command | What it does |
|---------|-------------|
| `/orq-agent "your use case"` | Full pipeline -- generates complete agent swarm (specs, orchestration, datasets, README) |
| `/orq-agent:prompt "agent description"` | Quick single agent -- generates one agent spec without the full pipeline |
| `/orq-agent:architect "your use case"` | Blueprint only -- design swarm architecture (agent count, roles, orchestration pattern) |
| `/orq-agent:tools "your use case"` | Tool resolution only -- produces TOOLS.md with verified MCP/API/function tool configs |
| `/orq-agent:research "agent role"` | Research only -- investigates domain best practices (model, prompt strategy, guardrails) |
| `/orq-agent:datasets ./path/to/spec.md` | Datasets only -- generates test datasets with adversarial edge cases from an existing spec |
| `/orq-agent:kb` | KB management -- generate content, provision on Orq.ai, upload files |

**Automation** -- requires Orq.ai API key

| Command | What it does |
|---------|-------------|
| `/orq-agent:deploy` | Deploy agent swarm to Orq.ai (tools, KBs, agents, orchestration wiring) |
| `/orq-agent:test` | Run automated evaluations against deployed agents (3x median scoring) |
| `/orq-agent:iterate` | Analyze failures, propose prompt changes, re-test after approval |
| `/orq-agent:harden` | Promote evaluators to runtime guardrails with quality gates |

All automation commands support `--agent agent-key` to target a single agent.

**Utility**

| Command | What it does |
|---------|-------------|
| `/orq-agent:help` | Show available commands and options |
| `/orq-agent:update` | Update to the latest version |
| `/orq-agent:set-profile` | Switch model profile (quality/balanced/budget) |

**When to use which:**
- Need a complete swarm? `/orq-agent`
- Just need one agent's prompt? `/orq-agent:prompt`
- Want to explore architecture before committing? `/orq-agent:architect`
- Need knowledge base content? `/orq-agent:kb`
- Ready to ship to Orq.ai? `/orq-agent:deploy` then `/orq-agent:test`

## Update

Inside Claude Code:

```
/orq-agent:update
```

Or re-run the install command -- it updates to the latest version automatically.

## User configuration

| File | Purpose | Managed by |
|------|---------|------------|
| `systems.md` | IT systems your agents interact with (integration methods, URLs, auth) | You |
| `.orq-agent/config.json` | Capability tier, model profile, API key | Installer |

## Troubleshooting

**"Node.js is not installed"** -- Download and install from [nodejs.org](https://nodejs.org/)

**"Claude Code is not installed"** -- Run `npm install -g @anthropic-ai/claude-code` in your terminal

**"Permission denied"** -- Try running the install command with `sudo` in front, or contact Nick

**Skill not showing up in Claude Code** -- Make sure Claude Code is up to date (`npm update -g @anthropic-ai/claude-code`), then restart it
