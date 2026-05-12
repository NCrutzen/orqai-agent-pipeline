# MR Automations Toolkit (formerly Agent Workforce)

## What This Is

A platform for production AI-driven automations at Moyne Roberts. The current focus is the **canonical 5-stage email-handling pipeline** (Stage 0 input safety → Stage 1 noise filter → Stage 2 entity resolution → Stage 3 intent coordinator → Stage 4 handler), validated on debtor-email across 5 mailboxes and being extended to sales-email and future swarms via a registry-driven architecture.

The original "browser-UI agent-swarm builder" thesis (V3.0–V6.0) was paused 2026-03-25 in favour of shipping production automations against real Moyne Roberts processes (debtor-email recovery, sales-email triage, supplier onboarding, etc.). The Agent OS UI (v7.0) was kept and extended to surface these production pipelines.

## Core Value

Every recurring email-driven process at Moyne Roberts gets a swarm. New swarms onboard via registry INSERTs (Phase 68) without code changes. Operators give per-email feedback that the system distils into new rules and intents (V9.0). Top-volume intents become handlers in priority order (V11.0).

The product is no longer "a colleague creates a swarm via a browser UI." The product is "a swarm exists for every business process that needs one, and it self-improves from operator feedback."

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

### Abandoned (2026-03-25 pivot)

The browser-UI agent-swarm-builder thesis was paused when the team pivoted to shipping production automations directly. Phases and partial deliverables retained for traceability.

- **V3.0 Web UI & Dashboard** — abandoned at ~91% planning (phases 34–38 never executed; no production deployment)
- **V4.0 Browser Automation Builder** — abandoned at phases 39–40; SOP+screenshot+Playwright vision was never built; Browserless.io is still used directly by individual automations
- **V5.0 Cross-Swarm Intelligence** — never started
- **V6.0 Executive Dashboard** — phases 44–45 partially shipped (project model + KPI cards); phases 46–47 abandoned

The pieces of V3/V4/V6 that survived the pivot were absorbed into V7.0 (Agent OS UI) and v8.0 (pipeline-on-real-data).

### Shipped under the pivot

**V7.0 Agent OS** (shipped 2026-04-30 — phases 48-54):
- [x] O365 SSO via Azure AD for frictionless executive access
- [x] Full visual redesign with new design system (Satoshi + Cabinet Grotesk, glassmorphism, dark/light)
- [x] Sidebar with swarm navigation (Debtor Email, Sales Email, + generic template)
- [x] AI narrative briefing per swarm (dedicated Orq.ai Briefing Agent)
- [x] Live delegation graph with animated orchestrator → sub-agent paths
- [x] Subagent fleet cards with recursive detail drawer
- [x] Kanban execution board for business-stage job tracking
- [x] Gantt-style observability swimlanes (per-agent timeline)
- [x] Claude-style terminal event stream (Supabase Realtime)
- [x] Data integration: Supabase + Orq.ai API (traces, tool calls, agent metrics)

**v8.0 Agentic Platform** (shipped substantively — closure pending 82.2 + 82.4):
- [x] Architecture RFC (Phase 63) — canonical 5-stage funnel locked
- [x] Stage 0 input safety / prompt-injection guard (Phase 64)
- [x] Per-run token & cost budgets + tool-call allowlists per intent (Phase 64)
- [x] Stage 3 ranked multi-intent coordinator + Stage 3.5 escalation (Phase 65)
- [x] Pipeline consolidation — legacy triage path retired (Phase 66)
- [x] Stage 2 closure: iController DOM tagging (Phase 67)
- [x] Bulk Review 4-axis override redesign (Phase 71) + unified stage-keyed shell (Phase 82)
- [x] `public.swarms` registry generalisation + canonical context-shape (Phase 68)
- [x] Cross-swarm handler-agent canonicalisation (Phase 69)
- [x] Single canonical `pipeline_events` table (Phase 70) — *coverage gap, see Phase 82.2*
- [x] Stage 1 LLM Category Classifier — swarm-agnostic (Phase 74)
- [x] **Sales-email Stage 0/1 canary**: 181 emails ingested (30d), 91% Stage 0 reach, Stage 1 LLM classifying — corpus accruing for V10.0 rule design. (Was Half B of original v8.0 charter; satisfied incidentally by Phase 74 rollout.)
- [ ] **Phase 82.2** — Stage 0 telemetry coverage fix (stabilisation, in flight)
- [ ] **Phase 82.4** — Feedback capture infrastructure (`email_feedback` table + Stage 2/3 prose form + history view, no synthesis)
- [→] Promotion recommender + Learning Inbox **synthesis layer** — **moved to V9.0** (T2 draft-proposer on top of 82.4 capture)
- [→] Sales-email full operator onboarding — **moved to V10.0** (Stage 2 Sugar resolver, Stage 3 sales intent agent, multi-operator handling)

### Active

**v8.0 stabilisation** (this week + next): two phases gating closure:
- Phase 82.2 — Stage 0 telemetry coverage fix (26–45% → ≥99% on debtor mailboxes)
- Phase 82.4 — Feedback capture infrastructure so the debtor-person has a place to put Stage 2/3 prose feedback from day 1 of their onboarding (2026-05-18). Capture only; V9.0 synthesises.

### Defined (not yet active)

**V9.0 Promotion Recommender + Learning Inbox** — single-operator prose-feedback synthesis. Stage 2 sparse corrections (Stream A) + Stage 3 row-by-row intent review (Stream B). T2 draft-proposer tier: LLM clusters feedback, drafts concrete system changes, operator one-click approves. New intents typed by operator apply immediately. Wilson-CI noise-rule promotion (existing) coexists, not absorbed.

**V10.0 Sales-email canonical pipeline** — `verkoop@smeba.nl` runs the same 5-stage funnel as debtor-email end-to-end. New sales-email-specific Stage 2 Sugar-account resolver; sales-email Stage 3 intent agent; Phase 78 actually executed. V10.0 is the second customer of V9.0's feedback infrastructure — also introduces multi-operator handling.

**V11.0 Intent-prioritised handlers** — top-N most-frequent uncovered Stage 3 intents become first-class Stage 4 handlers per milestone. Reads V10.0's intent-volume signal. Coverage dashboard + handler-scaffolding template + dispatch via `swarm_intents`.

### Out of Scope

- Orq.ai Deployments — output targets Agents API (`/v2/agents`), not the simpler Deployments pattern
- Real-time agent monitoring/observability — Orq.ai handles this natively
- CLI skill management -- lives in orqai-agent-pipeline repo
- Dynamic/exploratory browser-use — already handled by existing Orq.ai MCP tools

## Current Milestone: v8.0 stabilisation → V9.0 prep

**This week (v8.0 closure):**
- Phase 82.2: Stage 0 telemetry coverage fix (26–45% → ≥99% on debtor mailboxes) — blocker for the Learning Inbox per-email trace
- Debtor-person operator onboarding (week of 2026-05-18) — first human-in-the-loop on Stage 2/3
- Once 82.2 lands + 999.8 browser smokes pass: formal v8.0 audit and closure

**v8.0 delivered substantively** — 5-stage funnel canonical across debtor-email, registry-driven swarm config (Phase 68), cross-swarm handler reuse (Phase 69), unified Bulk Review shell (Phase 82). Reframed Phase 72 (Promotion Recommender) into a full milestone (V9.0) once the prose-feedback approach replaced the original telemetry-only design. Reframed Phase 73 (sales-email validation) into V10.0 because Phase 78 was never executed.

**Pipeline architectural decisions (locked):**
- Workflow-first per Anthropic guidance; agents (autonomous loops) only where decomposition is genuinely required
- Stage 2 labeling is enriching, NOT blocking — coordinator handles customer-less emails downstream
- 4-axis override model — each stage gets its own override type for independent learning signals
- Brand-multitenant from day 1 (Smeba, Berki, Sicli-Noord/Sud, Smeba-Fire today; UK/IE coming, no hardcoded enums)
- Single canonical `pipeline_events` table — sole source of per-stage decision history

**Previous milestones:** V7.0 Agent OS shipped 2026-04-30. V2.1 / V2.0 / v0.3 (orq-agent-pipeline CLI tooling) shipped earlier. V3.0/V4.0/V6.0 abandoned per 2026-03-25 pivot.

## Context

- **Platform:** Orq.ai — agent orchestration (model routing, prompt versioning, evals); LLM calls via the Orq.ai Router, not direct provider SDKs
- **Stack:** Next.js on Vercel · Supabase (Postgres + Realtime + auth) · Inngest (durable functions) · Zapier (NXT SQL bridge + Sugar trigger) · Browserless.io (no-API systems) · ElevenLabs (voice) · Twilio (telephony). Full guidance in `CLAUDE.md`.
- **Mailboxes in scope:** debtor-email on 5 mailboxes (debiteuren@smeba.nl, debiteuren@berki.nl, debiteuren@smeba-fire.be, administratie@fire-control.nl, sicli) ; sales-email starting at verkoop@smeba.nl
- **Operator model:** single debtor-person from week of 2026-05-18 (V9.0 scope); sales-email operator added in V10.0 (forces multi-operator handling)
- **Users:** 5–15 Moyne Roberts employees, mostly non-technical. The product is the *automations themselves*, not a swarm-builder UI.

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
| Next.js + Supabase + Vercel + Inngest | Validated production stack across debtor-email + sales-email; durable Inngest workflows underpin the 5-stage funnel | ✓ Good |
| 5-stage funnel as canonical architecture | One shape covers every email-driven swarm; new swarms onboard via registry INSERTs (Phase 68) | ✓ Good — proven across debtor mailboxes |
| Registry-driven swarm config | `swarms` + `swarm_intents` + `swarm_noise_categories` tables replace hardcoded enums; cross-swarm handler reuse | ✓ Good — Phase 68/69 |
| `pipeline_events` as single per-stage source of truth | Replaces parallel tables for stage decision history; backs Bulk Review and the upcoming Learning Inbox | ✓ Good — Phase 70 (coverage fix in 82.2) |
| Stage 2 enriching, not blocking | Customer-less emails still reach Stage 3; Stage 2 adds context when available | ✓ Good |
| 4-axis Bulk Review overrides | Each stage gets independent override signal; feeds V9.0 synthesis | ✓ Good — Phase 71 |
| Pivot away from browser-UI swarm-builder (2026-03-25) | Building automations directly delivers value faster than building the meta-tool to build them | ✓ Good — validated by debtor-email production wins |

**Abandoned decisions (V3/V4/V5/V6):** node graph swarm builder, AI-vision screenshot annotation, Playwright auto-generation as pipeline stage, cross-swarm intelligence layer. Retained in `MILESTONES.md` history for traceability.

---
*Last updated: 2026-05-12 — milestone hygiene after Phase 55–58/74 sweep, V9/V10/V11 framing locked*
