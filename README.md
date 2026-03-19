# Agent Workforce

Browser-based interface for creating, deploying, testing, and iterating AI agent swarms on [Orq.ai](https://orq.ai). Built with Next.js, Supabase, and Vercel for the Moyne Roberts team.

## What it does

Non-technical colleagues describe a use case in plain language, and the pipeline:

1. **Designs** agent swarm architecture (roles, tools, orchestration)
2. **Deploys** agents to Orq.ai
3. **Tests** with automated evaluations
4. **Iterates** prompts based on test results (with human approval)
5. **Hardens** with guardrails before production

All from a browser -- no terminal or technical knowledge required.

## Getting Started

The web application lives in the `web/` directory. See `web/README.md` for setup instructions.

## CLI Skills

The Claude Code CLI skills (`/orq-agent`) live in a separate repository: [orqai-agent-pipeline](https://github.com/NCrutzen/orqai-agent-pipeline).
