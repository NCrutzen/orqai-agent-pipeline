# Roadmap: Orq Agent Designer

## Overview

Build a Claude Code skill that transforms natural language use case descriptions into complete Orq.ai agent swarm specifications, then autonomously deploys, tests, iterates, and hardens them via the Orq.ai MCP server and API. V4.0 adds cross-swarm intelligence so that agent swarms don't operate in silos -- overlaps are surfaced, missing coordination is identified, and fixes are proposed across the entire ecosystem. V5.0 extends the pipeline to detect browser automation needs, generate deterministic Playwright scripts, deploy them to a VPS-hosted MCP server, and wire agent specs with the right MCP tools.

## Milestones

| Version | Milestone | Status |
|---------|-----------|--------|
| **v0.3** | Core Pipeline + V2.0 Foundation -- V1.0 spec generation + V2.0 install infrastructure | **Shipped 2026-03-01** |
| **V2.0** | Autonomous Orq.ai Pipeline -- deploy, test, iterate, and harden agent swarms via MCP/API | **Shipped 2026-03-02** |
| **V2.1** | Experiment Pipeline Restructure -- rewrite test/iterate with native MCP, smaller subagents | **Shipped 2026-03-13** |
| **V3.0** | Web UI & Dashboard -- browser-based pipeline with real-time visibility, node graph, HITL approvals | **Dropped** (web interface removed from scope 2026-03-19) |
| **V4.0** | Cross-Swarm Intelligence -- ecosystem mapping, drift detection, overlap analysis, and fix proposals | **Defined** |
| **V5.0** | Browser Automation -- Playwright script generation, VPS MCP server, automated deployment, agent spec wiring | **Defined** |

---

<details>
<summary>v0.3 Core Pipeline + V2.0 Foundation (Phases 1-05.2) -- SHIPPED 2026-03-01</summary>

**11 phases, 28 plans, 50 requirements satisfied**
**Full archive:** `milestones/v0.3-ROADMAP.md` | `milestones/v0.3-REQUIREMENTS.md`

- [x] Phase 1: Foundation -- References, templates, architect subagent (completed 2026-02-24)
- [x] Phase 2: Core Generation Pipeline -- 5 subagents: researcher, spec-gen, orch-gen, dataset-gen, readme-gen (completed 2026-02-24)
- [x] Phase 3: Orchestrator and Adaptive Pipeline -- Orchestrator wiring with adaptive depth (completed 2026-02-24)
- [x] Phase 4: Distribution -- Install script, update command, GSD integration (completed 2026-02-24)
- [x] Phase 04.1: Discussion Step -- Structured gray area surfacing (completed 2026-02-24)
- [x] Phase 04.2: Tool Selection & MCP Servers -- Tool resolver + unified catalog (completed 2026-02-24)
- [x] Phase 04.3: Prompt Strategy -- XML-tagged, context-engineered instructions (completed 2026-02-24)
- [x] Phase 04.4: KB-Aware Pipeline -- End-to-end knowledge base support (completed 2026-02-26)
- [x] Phase 5: References, Install, Capability Infrastructure -- V2.0 references + modular install (completed 2026-03-01)
- [x] Phase 05.1: Fix Distribution Placeholders -- OWNER/REPO to NCrutzen/orqai-agent-pipeline (completed 2026-03-01)
- [x] Phase 05.2: Fix Tool Catalog & Pipeline Wiring -- Memory tool identifiers + research brief wiring (completed 2026-03-01)

</details>

<details>
<summary>V2.0 Autonomous Orq.ai Pipeline (Phases 6-11) -- SHIPPED 2026-03-02</summary>

**7 phases, 11 plans, 23 requirements satisfied**
**Full archive:** `milestones/V2.0-ROADMAP.md` | `milestones/V2.0-REQUIREMENTS.md`

- [x] Phase 6: Orq.ai Deployment -- Deployer subagent, MCP/REST adapter, idempotent deploy (completed 2026-03-01)
- [x] Phase 7: Automated Testing -- Tester subagent, dataset pipeline, evaluator selection, 3x experiments (completed 2026-03-01)
- [x] Phase 7.1: Test Pipeline Tech Debt -- SDK-to-REST mapping, package declaration, template cleanup (completed 2026-03-01)
- [x] Phase 8: Prompt Iteration Loop -- Iterator subagent, diagnosis, proposals, HITL approval, audit trail (completed 2026-03-01)
- [x] Phase 9: Guardrails and Hardening -- Hardener subagent, guardrail promotion, quality gates, --agent flags (completed 2026-03-01)
- [x] Phase 10: Fix Holdout Dataset Path -- Holdout dataset ID alignment, step label fixes (completed 2026-03-02)
- [x] Phase 11: Flag Conventions + Tech Debt -- Flag alignment, step renumbering, files_to_read fixes (completed 2026-03-02)

</details>

<details>
<summary>V2.1 Experiment Pipeline Restructure (Phases 26-33) -- SHIPPED 2026-03-13</summary>

**8 phases, 9 plans, 24 requirements satisfied**
**Full archive:** `milestones/V2.1-ROADMAP.md` | `milestones/V2.1-REQUIREMENTS.md`

- [x] Phase 26: Dataset Preparer -- MCP/REST upload, smoke test, stratified splits, JSON contract (completed 2026-03-11)
- [x] Phase 27: Experiment Runner -- REST-only execution, adaptive polling, holdout mode (completed 2026-03-11)
- [x] Phase 28: Results Analyzer -- Student's t statistics, category slicing, hardener compatibility (completed 2026-03-12)
- [x] Phase 29: Test Command Rewrite -- 3-subagent orchestration with validation gates (completed 2026-03-12)
- [x] Phase 30: Failure Diagnoser -- Evaluator-to-section mapping, diff proposals, HITL approval (completed 2026-03-12)
- [x] Phase 31: Prompt Editor -- Section-level changes, re-deploy delegation, score comparison (completed 2026-03-12)
- [x] Phase 32: Iterate Command Rewrite -- 2-subagent loop with 5 stop conditions (completed 2026-03-13)
- [x] Phase 33: Fix Iteration Pipeline Wiring -- Holdout schema path + mcp_available forwarding (completed 2026-03-13)

</details>

---

## Phases

<details>
<summary>V3.0 Web UI & Dashboard (Phases 34-38) -- DROPPED</summary>

**Status:** Dropped (2026-03-19). Web interface removed from scope. Project refocused on CLI pipeline skill.

- [Dropped] **Phase 34: Foundation & Auth** - Next.js app shell, Supabase DB schema with RLS, M365 SSO with tenant restriction, project CRUD
- [Dropped] **Phase 35: Pipeline Engine** - Prompt adapter, Inngest durable functions, pipeline state machine, use case input form, run list
- [Dropped] **Phase 36: Dashboard & Graph** - Real-time progress timeline, log stream, run list updates, interactive node graph with execution overlay
- [Dropped] **Phase 37: HITL Approval** - Pipeline pause/resume, diff viewer, approve/reject flow, email notifications, audit trail
- [Dropped] **Phase 38: Swarm Activation** - Webhook endpoints for external pipeline triggering with API key auth and status polling

</details>

<details>
<summary>V4.0 Cross-Swarm Intelligence (Phases 39-43) -- DEFINED</summary>

- [ ] Phase 39: Ecosystem Foundation -- Unified inventory of all swarms from local specs and live Orq.ai state
- [ ] Phase 40: Drift Detection -- Field-by-field comparison between spec and deployed state
- [ ] Phase 41: Overlap & Gap Analysis -- Semantic role overlap, tool duplication, blind spot identification
- [ ] Phase 42: Fix Proposals -- Structured fix proposals with diff previews, risk classification, HITL approval
- [ ] Phase 43: Command Integration & Auto-Trigger -- On-demand audit command and auto-trigger after new swarm designs

</details>

<details>
<summary>V5.0 Browser Automation (Phases 44-47) -- DEFINED</summary>

- [ ] Phase 44: Capabilities Config & VPS Scaffold -- Application capabilities config file, VPS MCP server setup
- [ ] Phase 45: Script Generation & Pipeline Integration -- Playwright script generator, pipeline browser-use detection
- [ ] Phase 46: Deployment, Wiring & NXT Validation -- Automated script deployment to VPS, agent spec wiring
- [ ] Phase 47: Hardening & Second System -- Script health monitoring, iController validation

</details>

## Progress

**Execution Order:**
V3.0 phases dropped. Next active milestone: V4.0 (Phases 39-43).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| ~~34. Foundation & Auth~~ | V3.0 | - | **Dropped** | 2026-03-19 |
| ~~35. Pipeline Engine~~ | V3.0 | - | **Dropped** | 2026-03-19 |
| ~~36. Dashboard & Graph~~ | V3.0 | - | **Dropped** | 2026-03-19 |
| ~~37. HITL Approval~~ | V3.0 | - | **Dropped** | 2026-03-19 |
| ~~38. Swarm Activation~~ | V3.0 | - | **Dropped** | 2026-03-19 |

## Progress Summary

| Version | Phase | Plans Complete | Status | Completed |
|---------|-------|----------------|--------|-----------|
| v0.3 | 1-05.2 (11 phases) | 28/28 | **Shipped** | 2026-03-01 |
| V2.0 | 6-11 (7 phases) | 11/11 | **Shipped** | 2026-03-02 |
| V2.1 | 26-33 (8 phases) | 9/9 | **Shipped** | 2026-03-13 |
| V3.0 | 34-38 (5 phases) | - | **Dropped** (2026-03-19) | - |
| V4.0 | 39-43 (5 phases) | 0/TBD | **Defined** | - |
| V5.0 | 44-47 (4 phases) | 0/TBD | **Defined** | - |
