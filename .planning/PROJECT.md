# Orq Agent Designer

## What This Is

A web-based Orq Agent Designer that lets Moyne Roberts colleagues create production-ready AI agent swarms from a browser. Users type a use case description and watch agents get designed, deployed, and tested on Orq.ai — with a real-time dashboard showing pipeline progress and agent performance. Also available as a Claude Code skill (`/orq-agent`) for technical users.

## Core Value

Any colleague can go from a use case description to deployed, tested agents on Orq.ai — through a browser UI with real-time visibility, visual agent graphs, and in-app approvals — without touching a terminal or needing technical knowledge.

## Requirements

### Validated

Shipped in v0.3 (2026-03-01) — 50 requirements:

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
- Modular install with capability tiers (core/deploy/test/full)

Shipped in V2.0 (2026-03-02) — 23 requirements:

- ✓ Autonomous agent deployment to Orq.ai via MCP/API (DEPLOY-01 through DEPLOY-08) — V2.0
- ✓ Automated testing pipeline with dataset upload, evaluator selection, 3x experiments (TEST-01 through TEST-05) — V2.0
- ✓ Prompt iteration loop with diagnosis, diff proposals, HITL approval, stopping conditions (ITER-01 through ITER-07) — V2.0
- ✓ Guardrails and hardening via evaluator promotion and quality gates (GUARD-01 through GUARD-03) — V2.0

Shipped in V2.1 (2026-03-13) — 24 requirements:

- ✓ Dataset-preparer subagent with MCP/REST upload, smoke test, stratified splits (DATA-01 through DATA-05) — V2.1
- ✓ Experiment-runner subagent with REST-only execution, adaptive polling, holdout mode (EXPR-01 through EXPR-06) — V2.1
- ✓ Results-analyzer subagent with triple-run statistics, category slicing, hardener compat (ANLZ-01 through ANLZ-05) — V2.1
- ✓ Rewritten test.md orchestrating 3 subagents with validation gates (TEST-01 through TEST-03) — V2.1
- ✓ Failure-diagnoser + prompt-editor for section-level diagnosis and HITL-approved iteration (ITPIPE-01 through ITPIPE-06) — V2.1
- ✓ Rewritten iterate.md with 2-subagent loop and 5 stop conditions (LOOP-01 through LOOP-03) — V2.1

### Active

**V3.0 Web UI & Dashboard:**
- [ ] Browser-based pipeline with real-time visibility for non-technical colleagues
- [ ] M365 SSO authentication (Azure AD) — Moyne Roberts employees only
- [ ] Self-service use case input to deployed agents via browser
- [ ] Real-time pipeline dashboard with run list, progress, log stream, and performance scores
- [ ] Interactive node graph visualization of agent swarms with execution overlay
- [ ] HITL approval flow with in-app approve/reject, queue, history, and email notifications

### Out of Scope

- Orq.ai Deployments — output targets Agents API (`/v2/agents`), not the simpler Deployments pattern
- Real-time agent monitoring/observability — Orq.ai handles this natively
- Auto-update on launch — updates are manual via `/orq-agent:update`
- Dynamic/exploratory browser-use — already handled by existing Orq.ai MCP tools

## Current Milestone: V3.0 Web UI & Dashboard

**Goal:** Build a browser-based interface so non-technical colleagues can create, deploy, test, and iterate agent swarms on Orq.ai — with real-time dashboard, node graph visualization, and HITL approval workflows.

**Target features:**
- Foundation & Auth (Next.js + Supabase + M365 SSO)
- Self-Service Pipeline (use case → deployed agents via browser)
- Pipeline Dashboard (run list, progress, logs, scores)
- Node Graph (interactive swarm visualization)
- HITL Approval Flow (in-app approve/reject with notifications)

## Context

- **Platform:** Orq.ai — Generative AI orchestration platform with Agents API (`/v2/agents`), A2A Protocol support, Task ID-based state persistence, two-step tool execution, and agent versioning via `@version-number` tags
- **Agent config surface:** key, role, description, model (`provider/model-name`), instructions, settings (max_iterations: 3-15, max_execution_time: ~300s), tools (built-in + function with JSON schema)
- **V2.0 pipeline:** 4 commands (`deploy`, `test`, `iterate`, `harden`) with 4 subagents (deployer, tester, iterator, hardener). MCP-first with REST API fallback. Per-agent incremental operations via `--agent` flag.
- **V3.0 stack:** Next.js on Vercel (frontend + API routes), Supabase (auth via M365 SSO, DB, Realtime), Claude API (pipeline prompts), Orq.ai API (agent deployment/testing)
- **V4.0 context:** As swarms multiply across business processes (Invoice-to-Cash, etc.), they develop blind spots — overlapping work, missing handoffs, conflicting actions. The ultra architect layer provides cross-swarm awareness.
- **V5.0 context:** Many Moyne Roberts systems (NXT, iController, Intelly) lack APIs. Agents interacting with these need browser automation. Fixed Playwright scripts handle deterministic flows; dynamic browser-use is already available via existing Orq.ai MCP tools. Scripts deploy to a VPS-hosted MCP server.
- **Distribution model:** Web app (primary for non-technical users) + Claude Code skill (for technical users). Both share pipeline logic from the same GitHub repo.
- **Users:** 5-15 Moyne Roberts employees, mostly non-technical. Web UI is the primary interface; Claude Code remains available for developers.
- **Codebase:** 10,628 lines across orq-agent/ (markdown + JSON). 43 files: 11 agents, 5 commands, 8 references, 7 templates, SKILL.md, install script
- **Shipped:** v0.3 (2026-03-01, 50 requirements), V2.0 (2026-03-02, 23 requirements), V2.1 (2026-03-13, 24 requirements). V3.0-V5.0 defined, not yet shipped

## Constraints

- **Platform:** Must target Orq.ai Agents API — all output specs must be valid for `/v2/agents` endpoint and/or Orq.ai Studio manual setup
- **Auth:** Must use M365 SSO (Azure AD) — no separate accounts. Moyne Roberts employees only.
- **Hosting:** Vercel for frontend/API, Supabase for data/auth/realtime — no self-hosted infrastructure
- **Updates:** Pipeline logic must auto-deploy from GitHub repo — no manual deployment steps
- **Backward compat:** Claude Code skill (`/orq-agent`) must continue working alongside the web app
- **Users:** Non-technical colleagues must complete the full pipeline without developer assistance
- **SDK pins:** `@orq-ai/node@^3.14.45`, `@orq-ai/evaluatorq@^1.1.0`, `@orq-ai/evaluators@^1.1.0`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Target Orq.ai Agents, not Deployments | Agents support orchestration, persistent state, tool execution loops, and A2A Protocol | ✓ Good |
| Kebab-case naming convention | Matches Orq.ai's own deployment key patterns | ✓ Good |
| Directory-per-swarm output structure | Groups related agents with orchestration and datasets | ✓ Good |
| Claude Code skill distribution via GitHub | Easy install for non-technical users with version management | ✓ Good |
| Smart subagent spawning based on input detail | Avoids unnecessary research, reduces token cost | ✓ Good |
| MCP-first with API fallback | MCP covers agents/datasets/evaluators; REST covers tools/prompts/memory | ✓ Good — validated in V2.0 |
| Modular capability tiers | Users control automation; core tier preserves V1.0 behavior | ✓ Good |
| XML-tagged prompt strategy | Anthropic context engineering patterns produce consistent output | ✓ Good |
| Subagents as .md instruction files | LLM reasoning handles diagnosis/proposals — no custom code needed | ✓ Good — validated at scale in V2.1 (5 new subagents) |
| Per-agent `--agent` flag (not positional args) | Consistent convention across all 4 commands, documented in SKILL.md | ✓ Good |
| Native `settings.guardrails` API for guardrail attachment | Direct Orq.ai integration, no application-layer workarounds | ✓ Good |
| Holdout dataset for re-test | Clean isolation between training and iteration testing | ✓ Good |
| HITL approval before any prompt change | Non-technical users maintain trust and control | ✓ Good |
| Next.js + Supabase + Vercel for web app | Existing tech stack, Supabase Realtime for live updates, M365 SSO support, zero infrastructure management | — Pending |
| Node graph for swarm visualization | Intuitive representation of agent relationships and data flow, lights up during pipeline execution | — Pending |
| GitHub repo as single source of truth | Pipeline prompts shared between Claude Code skill and web app, auto-deploy on push | — Pending |

| Cross-swarm intelligence layer | Swarms grow siloed; need ecosystem-level awareness to prevent overlaps and missing handoffs | — Pending |
| Dual source of truth (specs + Orq.ai) | Drift detection requires reading both local specs and live deployed state | — Pending |
| Auto-apply low-risk, escalate structural | Shared context additions are safe; rewiring agent relationships needs human judgment | — Pending |
| MCP server on VPS for Playwright scripts | Agents call browser automation via MCP tools; VPS handles Playwright runtime. Non-technical users never touch it. | — Pending |
| Fixed scripts over dynamic browser-use | Deterministic Playwright scripts for known flows; dynamic browser-use already solved via existing Orq.ai MCP tools | — Pending |
| Application capabilities config file | Pipeline reads per-system integration method from config; discussion step fills gaps for unknown systems | — Pending |

---
*Last updated: 2026-03-13 after V3.0 milestone start*
