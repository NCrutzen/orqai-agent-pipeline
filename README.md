# Orq Agent Designer

Generate complete, copy-paste-ready Orq.ai agent swarm specifications from a simple use case description. Built as a Claude Code skill for the Moyne Roberts team.

## What it does

Describe what you need in plain language, and the pipeline produces:
- Agent specs with all Orq.ai fields (model, instructions, tools, guardrails, etc.)
- Orchestration docs with data flow diagrams and error handling
- Test datasets with adversarial edge cases
- A step-by-step setup README

## Prerequisites

You need two things installed on your machine:

1. **Node.js** — download from [nodejs.org](https://nodejs.org/) (click the big green button, run the installer)
2. **Claude Code** — open your terminal and run:
   ```
   npm install -g @anthropic-ai/claude-code
   ```

Not sure if you have these? Open Terminal and type `node --version` and `claude --version`. If both show a version number, you're good.

## Install

Open your terminal and paste this single command:

```bash
curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

That's it. The installer checks prerequisites, downloads the skill, and verifies the installation.

## Usage

Inside Claude Code, type:

```
/orq-agent "Build a customer support triage system"
```

The pipeline will guide you through a short discussion to clarify your needs, then generate the full agent swarm specification.

### Other commands

| Command | What it does |
|---------|-------------|
| `/orq-agent "your use case"` | Generate a new agent swarm |
| `/orq-agent:help` | Show available commands and options |
| `/orq-agent:update` | Update to the latest version |

## Update

Inside Claude Code:

```
/orq-agent:update
```

Or re-run the install command — it will update to the latest version automatically.

## Troubleshooting

**"Node.js is not installed"** — Download and install from [nodejs.org](https://nodejs.org/)

**"Claude Code is not installed"** — Run `npm install -g @anthropic-ai/claude-code` in your terminal

**"Permission denied"** — Try running the install command with `sudo` in front, or contact Nick

**Skill not showing up in Claude Code** — Make sure Claude Code is up to date (`npm update -g @anthropic-ai/claude-code`), then restart it
