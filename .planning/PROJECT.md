# Agent Workforce

## What This Is

A web-based Agent Workforce application that lets Moyne Roberts colleagues create production-ready AI agent swarms from a browser. Users type a use case description and watch agents get designed, deployed, and tested on Orq.ai -- with a real-time dashboard showing pipeline progress and agent performance.

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

**V3.0 Web UI & Dashboard** (executing — 91%):
- [ ] Browser-based pipeline with real-time visibility for non-technical colleagues
- [ ] Authentication (email/password primary, M365 SSO when Azure AD is ready)
- [ ] Self-service use case input to deployed agents via browser
- [ ] Real-time pipeline dashboard with run list, progress, log stream, and performance scores
- [ ] Interactive node graph visualization of agent swarms with execution overlay
- [ ] HITL approval flow with in-app approve/reject, queue, history, and email notifications

**V4.0 Browser Automation Builder** (planning):
- [ ] Pipeline stage that detects agents needing browser automation for no-API systems
- [ ] SOP document + screenshot upload flow within the pipeline
- [ ] AI-driven screenshot annotation and step-by-step confirmation with user
- [ ] Playwright script generation from SOP + screenshot understanding
- [ ] Script execution and iterative testing on Browserless.io
- [ ] Deployment of verified script as MCP tool attached to the Orq.ai agent

**V6.0 Executive Dashboard & UI Revamp** (partially complete — phases 44-45 shipped):
- [x] Extended project model with status lifecycle and automation type tracking
- [x] Executive dashboard with KPI cards, charts, tables, 4 tabs
- [ ] Automated project status monitoring (deferred to V7.0+)
- [ ] O365 SSO via Azure AD (moved to V7.0)

**V7.0 Agent OS** (defining):
- [ ] O365 SSO via Azure AD for frictionless executive access
- [ ] Full visual redesign with new design system (Satoshi + Cabinet Grotesk, glassmorphism, dark/light)
- [ ] Sidebar with swarm navigation (Debtor Email, Sales Email, + generic template)
- [ ] AI narrative briefing per swarm (dedicated Orq.ai Briefing Agent)
- [ ] Live delegation graph with animated orchestrator → sub-agent paths
- [ ] Subagent fleet cards with recursive detail drawer
- [ ] Kanban execution board for business-stage job tracking
- [ ] Gantt-style observability swimlanes (per-agent timeline)
- [ ] Claude-style terminal event stream (Supabase Realtime)
- [ ] Data integration: Supabase + Orq.ai API (traces, tool calls, agent metrics)

### Out of Scope

- Orq.ai Deployments — output targets Agents API (`/v2/agents`), not the simpler Deployments pattern
- Real-time agent monitoring/observability — Orq.ai handles this natively
- CLI skill management -- lives in orqai-agent-pipeline repo
- Dynamic/exploratory browser-use — already handled by existing Orq.ai MCP tools

## Current Milestone: V7.0 Agent OS

**Goal:** Transform the Agent Workforce app into a cinematic swarm operating view with O365 SSO for frictionless executive access. A real-time control room where management sees every swarm, agent, and job in action — powered by Supabase Realtime and Orq.ai API data.

**Target features:**
- O365 SSO via Azure AD (CEO/management login with Microsoft account)
- Full visual redesign with new design system (Satoshi + Cabinet Grotesk, glassmorphism, dark/light toggle)
- Sidebar with swarm navigation (Debtor Email, Sales Email, + generic template for future swarms)
- AI narrative briefing per swarm (dedicated Orq.ai Briefing Agent, runs recurrently)
- Live delegation graph with animated orchestrator → sub-agent communication paths
- Subagent fleet cards with metrics, skills, and recursive detail drawer
- Kanban execution board for business-stage job tracking (drag & drop)
- Gantt-style observability swimlanes (per-agent timeline: thinking/tool/wait/done)
- Claude-style terminal event stream via Supabase Realtime
- Data integration: Supabase (automation_runs, projects) + Orq.ai API (traces, tool calls, agent metrics)

**Design reference:** `docs/designs/agent-dashboard-v2.html`

**Previous milestones:** V6.0 (phases 44-45 complete), V3.0 (91%), V4.0 (phases 39-40 complete)

## Context

- **Platform:** Orq.ai — Generative AI orchestration platform with Agents API (`/v2/agents`), A2A Protocol support, Task ID-based state persistence, two-step tool execution, and agent versioning via `@version-number` tags
- **Agent config surface:** key, role, description, model (`provider/model-name`), instructions, settings (max_iterations: 3-15, max_execution_time: ~300s), tools (built-in + function with JSON schema)
- **V3.0 stack:** Next.js on Vercel (frontend + API routes), Supabase (auth via email/password + future M365 SSO, DB, Realtime), Claude API (pipeline prompts), Orq.ai API (agent deployment/testing)
- **V4.0 context:** Many Moyne Roberts systems (NXT, iController, Intelly) lack APIs. The pipeline detects when an agent needs browser automation, guides the user through SOP + screenshot upload, generates Playwright scripts via AI vision, tests on Browserless.io, and deploys as MCP tools attached to agents. The entire flow is a pipeline stage — user just validates, AI does the heavy lifting.
- **V5.0 context:** As swarms multiply across business processes (Invoice-to-Cash, etc.), they develop blind spots — overlapping work, missing handoffs, conflicting actions. The ultra architect layer provides cross-swarm awareness.
- **Distribution model:** Web app for all users. CLI skills available separately in orqai-agent-pipeline repo.
- **Users:** 5-15 Moyne Roberts employees, mostly non-technical. Web UI is the primary interface.
- **Shipped:** v0.3 (2026-03-01, 50 requirements), V2.0 (2026-03-02, 23 requirements), V2.1 (2026-03-13, 24 requirements). V3.0 executing (91%), V4.0-V5.0 defined

## Constraints

- **Platform:** Must target Orq.ai Agents API — all output specs must be valid for `/v2/agents` endpoint and/or Orq.ai Studio manual setup
- **Auth:** Email/password auth primary. M365 SSO as additional provider when Azure AD tenant setup is complete.
- **Hosting:** Vercel for frontend/API, Supabase for data/auth/realtime — no self-hosted infrastructure
- **Updates:** Pipeline logic must auto-deploy from GitHub repo — no manual deployment steps
- **Users:** Non-technical colleagues must complete the full pipeline without developer assistance

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Target Orq.ai Agents, not Deployments | Agents support orchestration, persistent state, tool execution loops, and A2A Protocol | ✓ Good |
| Kebab-case naming convention | Matches Orq.ai's own deployment key patterns | ✓ Good |
| Directory-per-swarm output structure | Groups related agents with orchestration and datasets | ✓ Good |
| Claude Code skill distribution via GitHub | Moved to orqai-agent-pipeline repo | ✓ Good |
| Smart subagent spawning based on input detail | Avoids unnecessary research, reduces token cost | ✓ Good |
| MCP-first with API fallback | MCP covers agents/datasets/evaluators; REST covers tools/prompts/memory | ✓ Good — validated in V2.0 |
| Modular capability tiers | Users control automation; core tier preserves V1.0 behavior | ✓ Good |
| XML-tagged prompt strategy | Anthropic context engineering patterns produce consistent output | ✓ Good |
| Subagents as .md instruction files | LLM reasoning handles diagnosis/proposals — no custom code needed | ✓ Good — validated at scale in V2.1 (5 new subagents) |
| Per-agent `--agent` flag (not positional args) | Consistent convention across all 4 commands, documented in SKILL.md | ✓ Good |
| Native `settings.guardrails` API for guardrail attachment | Direct Orq.ai integration, no application-layer workarounds | ✓ Good |
| Holdout dataset for re-test | Clean isolation between training and iteration testing | ✓ Good |
| HITL approval before any prompt change | Non-technical users maintain trust and control | ✓ Good |
| Next.js + Supabase + Vercel for web app | Existing tech stack, Supabase Realtime for live updates, email/password auth primary with SSO swap-in, zero infrastructure management | — Pending |
| Node graph for swarm visualization | Intuitive representation of agent relationships and data flow, lights up during pipeline execution | — Pending |
| GitHub repo as single source of truth | Pipeline prompts shared between Claude Code skill and web app, auto-deploy on push | — Pending |

| Browser automation as pipeline stage | SOP + screenshots → Playwright script → MCP tool, all inline during initial agent creation. User validates, AI builds. | — Pending |
| Browserless.io for cloud execution | No VPS management; Browserless.io handles Playwright runtime in the cloud | — Pending |
| AI vision for screenshot analysis | Claude vision reads screenshots, annotates them, presents understanding back to user for confirmation | — Pending |
| MCP tool as automation output | Verified Playwright script deployed as MCP tool and attached to the Orq.ai agent automatically | — Pending |
| Fixed scripts over dynamic browser-use | Deterministic Playwright scripts for known flows; dynamic browser-use already solved via existing Orq.ai MCP tools | — Pending |
| Cross-swarm intelligence layer (V5.0) | Swarms grow siloed; need ecosystem-level awareness to prevent overlaps and missing handoffs | — Pending |
| Dual source of truth (V5.0) | Drift detection requires reading both local specs and live deployed state | — Pending |
| Auto-apply low-risk, escalate structural (V5.0) | Shared context additions are safe; rewiring agent relationships needs human judgment | — Pending |

---
*Last updated: 2026-04-15 after V7.0 Agent OS milestone definition*
