# Orq Agent Designer

## What This Is

A Claude Code skill (`/orq-agent`) that takes a use case description from a Moyne Roberts colleague and delivers a complete agent swarm specification — copy-paste-ready Orq.ai Agent configs, orchestration logic, and experimentation datasets. It's a pipeline from idea to production-ready agent specs, designed for 5-15 users with varying technical backgrounds.

## Core Value

Given any use case description (brief or detailed), produce correct, complete Orq.ai Agent specifications and autonomously deploy, test, iterate, and harden them via the Orq.ai MCP server and API — while keeping non-technical colleagues able to review and approve every change.

## Current Milestone: V2.0 Autonomous Orq.ai Pipeline

**Goal:** Transform the spec generation skill into a fully autonomous pipeline that deploys agent swarms to Orq.ai, runs automated tests, iterates prompts based on results (with user approval), and configures guardrails — all via MCP-first integration with API fallback.

**Target features:**
- Update skill references and prompts with latest agentic framework research (Anthropic, OpenAI, etc.)
- Modular install with capability selection (core/deploy/test/full) and Orq.ai API key onboarding
- Autonomous agent deployment to Orq.ai via MCP (tools via API), with idempotent updates
- Automated testing: dataset upload, evaluator creation, experiment execution, results presentation
- Prompt iteration loop: analyze results → propose changes → user approves → update → re-test
- Guardrails and hardening via evaluator-based quality gates
- Full audit trail: all iterations and reasoning logged to local `.md` files

## Requirements

### Validated

Shipped in V1.0 (2026-02-26) — all 40 requirements complete:

- Adaptive input handling (brief → detailed, pipeline depth adapts)
- Architect subagent with complexity gate (single-agent default)
- Domain research subagents (smart skip when input is detailed)
- Agent spec generation (all 18 Orq.ai fields, copy-paste ready)
- Orchestration spec (agent-as-tool, data flow, error handling, HITL)
- Dataset generation (test inputs, eval pairs, adversarial cases 30%+)
- Naming convention (`[domain]-[role]-agent` kebab-case)
- Directory output structure (`Agents/[swarm-name]/`)
- Claude Code skill distribution (install script, update command)
- GSD integration (standalone + within GSD phases)
- Discussion step (surfaces gray areas before architect)
- Tool resolver (unified tool catalog, MCP-first)
- Prompt strategy (XML-tagged, heuristic-first, context-engineered)
- KB-aware pipeline (discussion → researcher → spec generator)

### Active

- [ ] Latest agentic framework research incorporated into references and prompts
- [ ] Modular install with capability selection and Orq.ai API key onboarding
- [ ] Autonomous agent deployment to Orq.ai via MCP/API
- [ ] Automated testing pipeline (datasets, evaluators, experiments)
- [ ] Prompt iteration loop with user approval
- [ ] Guardrails and hardening via evaluator-based quality gates
- [ ] Full audit trail in local `.md` files

### Out of Scope

- ~~Direct Orq.ai API integration~~ — Now in scope for V2.0 (MCP available)
- Orq.ai Deployments — output targets Agents API (`/v2/agents`), not the simpler Deployments pattern
- Real-time agent monitoring/observability — Orq.ai handles this natively
- Knowledge base automated provisioning — Deferred to V2.1 (user-chosen RAG DB)
- Auto-update on launch — updates are manual via `/orq-agent:update`

## Context

- **Platform:** Orq.ai — Generative AI orchestration platform with Agents API (`/v2/agents`), A2A Protocol support, Task ID-based state persistence, two-step tool execution, and agent versioning via `@version-number` tags
- **Agent config surface:** key, role, description, model (`provider/model-name`), instructions, settings (max_iterations: 3-15, max_execution_time: ~300s), tools (built-in + function with JSON schema)
- **Orchestration pattern:** Sequential pipelines where agents connect at the application layer — output from Agent A feeds Agent B via shared Task IDs. Agents pause at `input-required` state for tool execution or human decisions
- **Distribution model:** Claude Code skill (like GSD), versioned through GitHub, installed via one-liner script
- **Users:** 5-15 Moyne Roberts employees, mostly non-technical. Output must be human-readable and copy-paste ready into Orq.ai Studio
- **GSD reference architecture:** Follows similar patterns — workflows (orchestrators) reference agents (subagents), with templates, references, and a bin/ toolchain. The `/orq-agent` skill should mirror this structure for its own distribution
- **Model landscape:** Agent should recommend models per use case from Orq.ai's 200+ model catalog (OpenAI, Anthropic, Google, Groq, DeepSeek, etc.) while making it easy for users to swap

## Constraints

- **Platform:** Must target Orq.ai Agents API — all output specs must be valid for `/v2/agents` endpoint and/or Orq.ai Studio manual setup
- **Users:** Non-technical colleagues must be able to follow README and copy-paste specs without developer assistance
- **Distribution:** Must work as Claude Code slash command — no standalone CLI or separate tooling
- **Compatibility:** Must integrate cleanly with GSD workflow when used within coding projects

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Target Orq.ai Agents, not Deployments | Agents support orchestration, persistent state, tool execution loops, and A2A Protocol — Deployments are single-call only | — Pending |
| Kebab-case naming convention (`[domain]-[role]-agent`) | Matches Orq.ai's own deployment key patterns, readable, consistent | — Pending |
| Directory-per-swarm output structure | Groups related agents with their orchestration logic and datasets — mirrors how GSD organizes workflows + agents | — Pending |
| Claude Code skill distribution via GitHub | Balances easy install for non-technical users with version management for maintainers | — Pending |
| Manual updates only (`/orq-agent:update`) | Simpler than auto-update, avoids surprise changes mid-workflow | — Pending |
| Smart subagent spawning based on input detail | Avoids unnecessary research when user provides detailed brief — reduces token cost and time | — Pending |

---
*Last updated: 2026-03-01 after V2.0 milestone initialization*
